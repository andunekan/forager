import type { Recipe } from '../types/recipe';
import { createId, parseIngredient } from './ingredientParser';

export function cleanOcrText(raw: string): string {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      let s = line.trim();
      if (!s) return '';

      // Strip leading OCR bullet/border noise
      s = s.replace(/^[•·▪▫◦‣⁃\-–—*_~|©®]+\s*/, '');

      // Drop pure punctuation / scanner artifact lines
      if (!/[a-zA-Z0-9]/.test(s)) return '';
      if (s.length <= 2 && !/^\d+$/.test(s)) return '';

      // Fix leading 'l' or 'I' or '|' misread for digit '1' before measurements or fractions
      s = s.replace(
        /^([lI|])(?=\s+(?:\d+\/\d+|½|¼|¾|⅓|⅔|cups?|tbsp|tsp|thsp|tbps|oz|0z|lbs?|pounds?|cans?|cloves?|packages?|pkgs?|slices?|bunches?|heads?|sprigs?|stalks?|pinch|teaspoons?|tablespoons?)\b)/,
        '1',
      );

      // Fix common culinary unit misreads
      s = s
        .replace(/\bthsp\.?\b/gi, 'tbsp')
        .replace(/\btbps\.?\b/gi, 'tbsp')
        .replace(/\btbspn\.?\b/gi, 'tbsp')
        .replace(/\bt5p\.?\b/gi, 'tsp')
        .replace(/\bteasp\.?\b/gi, 'tsp')
        .replace(/\b0z\.?\b/gi, 'oz')
        .replace(/\b1\/z\b/gi, '1/2')
        .replace(/\bV2\b/g, '1/2')
        .replace(/\bV4\b/g, '1/4')
        .replace(/\b3\/4\b/g, '3/4')
        // Fix letter O misread as zero in oven temperatures (e.g. 35O°F -> 350°F, 4OO F -> 400 F)
        .replace(/\b([2-5][0-9])O(?=\s*°?\s*[FC]\b)/g, '$10')
        .replace(/\b([2-5])OO(?=\s*°?\s*[FC]\b)/g, '$100');

      return s.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);

  return lines.join('\n');
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Prepares a recipe photo for local Tesseract OCR:
 * - Rotates by 0 / 90 / 180 / 270 degrees
 * - Resizes to ~1600px max edge (sharp text without slow 12MP pixels)
 * - Converts to grayscale and stretches contrast across the 5th–95th percentiles
 *   so shadows, warm lighting, and yellowed paper become crisp dark text on white.
 */
export async function preprocessPhotoForOcr(
  dataUrl: string,
  rotationDegrees = 0,
): Promise<{ ocrDataUrl: string; displayDataUrl: string }> {
  if (typeof document === 'undefined') {
    return { ocrDataUrl: dataUrl, displayDataUrl: dataUrl };
  }

  const img = await loadImageElement(dataUrl);
  const normalizedRot = ((rotationDegrees % 360) + 360) % 360;
  const swapDims = normalizedRot === 90 || normalizedRot === 270;

  const maxEdge = 1600;
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;
  const scale = Math.min(1, maxEdge / Math.max(origW, origH));

  const drawW = Math.round(origW * scale);
  const drawH = Math.round(origH * scale);
  const canvasW = swapDims ? drawH : drawW;
  const canvasH = swapDims ? drawW : drawH;

  // 1. Clean rotated color image (for preview + AI Vision)
  const displayCanvas = document.createElement('canvas');
  displayCanvas.width = canvasW;
  displayCanvas.height = canvasH;
  const dCtx = displayCanvas.getContext('2d');
  if (!dCtx) return { ocrDataUrl: dataUrl, displayDataUrl: dataUrl };

  dCtx.fillStyle = '#ffffff';
  dCtx.fillRect(0, 0, canvasW, canvasH);
  dCtx.translate(canvasW / 2, canvasH / 2);
  dCtx.rotate((normalizedRot * Math.PI) / 180);
  dCtx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

  const displayDataUrl = displayCanvas.toDataURL('image/jpeg', 0.86);

  // 2. High-contrast grayscale canvas for local Tesseract OCR
  const ocrCanvas = document.createElement('canvas');
  ocrCanvas.width = canvasW;
  ocrCanvas.height = canvasH;
  const oCtx = ocrCanvas.getContext('2d');
  if (!oCtx) return { ocrDataUrl: displayDataUrl, displayDataUrl };

  oCtx.drawImage(displayCanvas, 0, 0);
  const imageData = oCtx.getImageData(0, 0, canvasW, canvasH);
  const pixels = imageData.data;

  // Compute luminance histogram to auto-stretch contrast
  const hist = new Uint32Array(256);
  const totalPixels = canvasW * canvasH;
  const grays = new Uint8Array(totalPixels);

  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    const gray = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    grays[p] = gray;
    hist[gray] += 1;
  }

  let low = 0;
  let high = 255;
  let acc = 0;
  for (let g = 0; g < 256; g += 1) {
    acc += hist[g];
    if (acc >= totalPixels * 0.04) {
      low = g;
      break;
    }
  }
  acc = 0;
  for (let g = 255; g >= 0; g -= 1) {
    acc += hist[g];
    if (acc >= totalPixels * 0.08) {
      high = g;
      break;
    }
  }
  const range = Math.max(24, high - low);

  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    let v = ((grays[p] - low) / range) * 255;
    // Gentle S-curve boost to push paper towards pure white and ink towards dark charcoal
    if (v > 185) v = Math.min(255, v * 1.12);
    else if (v < 115) v = Math.max(0, v * 0.8);
    const byte = Math.max(0, Math.min(255, Math.round(v)));
    pixels[i] = byte;
    pixels[i + 1] = byte;
    pixels[i + 2] = byte;
    pixels[i + 3] = 255;
  }

  oCtx.putImageData(imageData, 0, 0);
  const ocrDataUrl = ocrCanvas.toDataURL('image/png');

  return { ocrDataUrl, displayDataUrl };
}

interface RawGeminiRecipe {
  title?: unknown;
  servings?: unknown;
  prepMinutes?: unknown;
  ingredients?: unknown;
  steps?: unknown;
  notes?: unknown;
}

export function parseGeminiRecipeJson(text: string, imageDataUrl?: string): Recipe | null {
  try {
    const stripped = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    const parsed = JSON.parse(stripped) as RawGeminiRecipe;
    const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : 'Scanned Recipe';
    const servingsNum = Math.max(1, parseInt(String(parsed.servings ?? '4'), 10) || 4);
    const prepNum = parseInt(String(parsed.prepMinutes ?? ''), 10);

    const rawIngredients = Array.isArray(parsed.ingredients)
      ? parsed.ingredients.map((item) => String(item).trim()).filter(Boolean)
      : [];
    const steps = Array.isArray(parsed.steps)
      ? parsed.steps.map((step) => String(step).trim()).filter(Boolean)
      : [];
    const notes = typeof parsed.notes === 'string' ? parsed.notes.trim() : '';

    const now = new Date().toISOString();
    return {
      id: createId('rec'),
      title,
      image: imageDataUrl,
      servings: servingsNum,
      prepMinutes: Number.isFinite(prepNum) && prepNum > 0 ? prepNum : undefined,
      ingredients: rawIngredients.map((raw) => parseIngredient(raw)),
      steps: steps.length > 0 ? steps : ['Review and adjust steps as needed.'],
      notes,
      sourceType: 'photo',
      createdAt: now,
      updatedAt: now,
    };
  } catch {
    return null;
  }
}

export type PhotoScanMode = 'recipe' | 'dish';

export interface PhotoVisionOptions {
  mode?: PhotoScanMode;
  hint?: string;
}

export function buildRecipeVisionPrompt(
  pageCount: number,
  options: PhotoVisionOptions = {},
): string {
  const mode = options.mode ?? 'recipe';
  const trimmedHint = options.hint?.trim();

  if (mode === 'dish') {
    const parts = [
      pageCount > 1
        ? `You are an expert home-cooking recipe developer. Study these ${pageCount} photos of a finished meal/dish closely (identify the dish, visible ingredients, sauces, garnishes, cooking method, and textures).`
        : 'You are an expert home-cooking recipe developer. Study the finished meal/dish shown in this photo closely (identify the dish, visible ingredients, sauces, garnishes, cooking method, and textures).',
      'Create a delicious, practical home recipe to recreate this dish in clean JSON with these exact keys:',
      '{"title": string, "servings": number, "prepMinutes": number | null, "ingredients": string[], "steps": string[], "notes": string}.',
      'Include realistic, well-proportioned ingredient quantities and fractions (e.g. "1 1/2 cups rice", "2 tbsp olive oil") and clear step-by-step cooking instructions.',
      'Put brief flavor, substitution, or serving tips in notes.',
    ];
    if (trimmedHint) {
      parts.push(`Incorporate this user preference or context: "${trimmedHint}".`);
    }
    return parts.join(' ');
  }

  const lead =
    pageCount > 1
      ? `These ${pageCount} photos are consecutive pages of the same recipe. Combine all pages in order into one complete recipe in clean JSON with these exact keys:`
      : 'Transcribe the recipe shown in this photo into clean JSON with these exact keys:';
  return [
    lead,
    '{"title": string, "servings": number, "prepMinutes": number | null, "ingredients": string[], "steps": string[], "notes": string}.',
    'Preserve exact ingredient quantities and fractions (e.g. "1 1/2 cups flour").',
    'Combine multi-line steps into complete sentences. Do not invent ingredients not in the photos.',
  ].join(' ');
}

export async function extractRecipeWithGeminiVision(
  imageDataUrls: string | string[],
  apiKey: string,
  options: PhotoVisionOptions = {},
): Promise<Recipe> {
  const pages = (Array.isArray(imageDataUrls) ? imageDataUrls : [imageDataUrls]).filter(Boolean);
  if (pages.length === 0) {
    throw new Error('At least one recipe photo is required.');
  }

  const mode = options.mode ?? 'recipe';
  const prompt = buildRecipeVisionPrompt(pages.length, options);

  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [
    { text: prompt },
  ];

  pages.forEach((url, index) => {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Invalid photo format');
    }
    if (pages.length > 1) {
      parts.push({ text: mode === 'dish' ? `Photo ${index + 1}:` : `Page ${index + 1}:` });
    }
    parts.push({
      inline_data: {
        mime_type: match[1],
        data: match[2],
      },
    });
  });

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: mode === 'dish' ? 0.35 : 0.1,
      },
    }),
  });

  if (!resp.ok) {
    const errText =
      resp.status === 400 || resp.status === 403
        ? 'Gemini API key was rejected — check your key and try again.'
        : `Gemini Vision request failed (${resp.status}).`;
    throw new Error(errText);
  }

  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) {
    throw new Error('Gemini Vision returned an empty response.');
  }

  const recipe = parseGeminiRecipeJson(jsonText, pages[0]);
  if (!recipe) {
    throw new Error('Could not parse structured recipe from Gemini Vision response.');
  }
  return recipe;
}
