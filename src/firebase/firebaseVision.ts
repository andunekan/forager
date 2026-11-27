import { parseGeminiRecipeJson } from '../domain/photoOcr';
import type { Recipe } from '../types/recipe';
import { getFirebaseVisionModel } from './firebaseClient';

export interface InlineImagePart {
  type: 'inlineData';
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export interface VisionModelLike {
  generateContent: (
    parts: Array<string | InlineImagePart>,
  ) => Promise<{ response: { text: () => string } }>;
}

function buildVisionPrompt(pageCount: number): string {
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

export function parseDataUrlToInlinePart(imageDataUrl: string): InlineImagePart {
  const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid photo data URL');
  }
  return {
    type: 'inlineData',
    inlineData: {
      mimeType: match[1],
      data: match[2],
    },
  };
}

export async function extractRecipeFromFirebaseModel(
  imageDataUrls: string | string[],
  model: VisionModelLike,
): Promise<Recipe> {
  const pages = (Array.isArray(imageDataUrls) ? imageDataUrls : [imageDataUrls]).filter(Boolean);
  if (pages.length === 0) {
    throw new Error('At least one recipe photo is required.');
  }

  const parts: Array<string | InlineImagePart> = [buildVisionPrompt(pages.length)];
  pages.forEach((url, index) => {
    if (pages.length > 1) {
      parts.push(`Page ${index + 1}:`);
    }
    parts.push(parseDataUrlToInlinePart(url));
  });

  let result: { response: { text: () => string } };
  try {
    result = await model.generateContent(parts);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    if (/app\s*check|401|unauthorized/i.test(rawMsg)) {
      throw new Error(
        'Firebase AI requires App Check (a reCAPTCHA Enterprise site key). Add it in Firebase App Check or paste a Gemini API key.',
      );
    }
    throw err;
  }

  const text = result.response.text();
  const recipe = parseGeminiRecipeJson(text, pages[0]);
  if (!recipe) {
    throw new Error('Could not parse structured recipe from Gemini Vision response.');
  }
  return recipe;
}

export async function extractRecipeWithFirebaseAi(
  imageDataUrls: string | string[],
): Promise<Recipe> {
  const model = getFirebaseVisionModel();
  if (!model) {
    throw new Error('Firebase AI Logic is not configured.');
  }
  return extractRecipeFromFirebaseModel(imageDataUrls, model);
}
