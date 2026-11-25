import * as XLSX from 'xlsx';
import type { Recipe } from '../types/recipe';
import { createId, parseIngredient } from './ingredientParser';

function splitListField(value: string): string[] {
  if (!value) return [];
  const normalized = value.replace(/\r\n/g, '\n').trim();
  const hasNewline = normalized.includes('\n');
  const rawParts = hasNewline
    ? normalized.split('\n')
    : normalized.includes(';')
      ? normalized.split(';')
      : normalized.includes('|')
        ? normalized.split('|')
        : [normalized];

  return rawParts
    .map((s) => s.trim().replace(/^\d+[.)]\s*/, '').replace(/^[•\-*]\s*/, ''))
    .filter(Boolean);
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((c) => c.length > 0)) {
      rows.push(row);
    }
  }
  return rows;
}

function rowsToRecipes(rows: string[][]): Recipe[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.toLowerCase().trim());

  const findCol = (aliases: string[]): number =>
    headers.findIndex((h) => aliases.some((a) => h.includes(a)));

  const titleCol = findCol(['title', 'name', 'recipe']);
  const servingsCol = findCol(['serving', 'yield']);
  const prepCol = findCol(['prep', 'time', 'min']);
  const ingCol = findCol(['ingredient']);
  const stepCol = findCol(['instruction', 'step', 'direction', 'method']);
  const notesCol = findCol(['note', 'tip', 'comment']);
  const urlCol = findCol(['url', 'link', 'source']);
  const imgCol = findCol(['image', 'photo']);

  const now = new Date().toISOString();
  const recipes: Recipe[] = [];

  for (const row of rows.slice(1)) {
    const title = (titleCol >= 0 ? row[titleCol] : row[0])?.trim();
    if (!title) continue;

    const servingsRaw = servingsCol >= 0 ? row[servingsCol] : '4';
    const servingsNum = parseInt(String(servingsRaw).match(/\d+/)?.[0] ?? '4', 10) || 4;

    const prepRaw = prepCol >= 0 ? row[prepCol] : '';
    const prepNum = parseInt(String(prepRaw).match(/\d+/)?.[0] ?? '', 10);

    const ingList = splitListField(ingCol >= 0 ? row[ingCol] ?? '' : '');
    const stepList = splitListField(stepCol >= 0 ? row[stepCol] ?? '' : '');
    const notes = notesCol >= 0 ? (row[notesCol] ?? '').trim() : '';
    const sourceUrl = urlCol >= 0 ? (row[urlCol] ?? '').trim() || undefined : undefined;
    const image = imgCol >= 0 ? (row[imgCol] ?? '').trim() || undefined : undefined;

    recipes.push({
      id: createId('rec'),
      title,
      image,
      servings: servingsNum,
      prepMinutes: Number.isFinite(prepNum) ? prepNum : undefined,
      ingredients: ingList.map((raw) => parseIngredient(raw)),
      steps: stepList.length > 0 ? stepList : ['Prepare ingredients and cook to taste.'],
      notes,
      sourceUrl,
      sourceType: 'spreadsheet',
      createdAt: now,
      updatedAt: now,
    });
  }

  return recipes;
}

export function parseCsvRecipes(csvText: string): Recipe[] {
  return rowsToRecipes(parseCsvRows(csvText));
}

export function parseSpreadsheetBuffer(buffer: ArrayBuffer): Recipe[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  const stringRows = rawRows.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => String(cell ?? '').trim()),
  );
  return rowsToRecipes(stringRows);
}

export const SAMPLE_SPREADSHEET_CSV = [
  'Title,Servings,Prep Minutes,Ingredients,Instructions,Notes',
  '"Spring Pea & Mint Risotto",4,30,"1 1/2 cups arborio rice; 1 cup sweet green peas; 4 cups vegetable broth; 2 tbsp unsalted butter; 1/2 cup grated parmesan; 2 tbsp fresh mint","Warm broth gently in a saucepan; Toast arborio rice in butter for 2 minutes; Ladle broth in slowly until creamy; Fold in peas, parmesan, and fresh mint","Try swapping butter and parmesan for dairy-free"',
  '"Honey Citrus Salad",2,10,"4 cups baby arugula; 2 blood oranges; 1/2 cup shaved fennel; 2 tbsp olive oil; 1 tbsp honey; 2 tbsp toasted almonds","Arrange arugula and sliced oranges on a platter; Whisk olive oil with honey and drizzle over; Finish with fennel and toasted almonds","Great alongside miso salmon"',
].join('\n');

function parseIsoDurationMinutes(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!match) {
    const plain = parseInt(value.match(/\d+/)?.[0] ?? '', 10);
    return Number.isFinite(plain) ? plain : undefined;
  }
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const mins = match[2] ? parseInt(match[2], 10) : 0;
  const total = hours * 60 + mins;
  return total > 0 ? total : undefined;
}

function extractImageUrl(img: unknown): string | undefined {
  if (typeof img === 'string') return img;
  if (Array.isArray(img) && img.length > 0) return extractImageUrl(img[0]);
  if (img && typeof img === 'object' && 'url' in img && typeof (img as { url: unknown }).url === 'string') {
    return (img as { url: string }).url;
  }
  return undefined;
}

function extractInstructions(instructions: unknown): string[] {
  if (!instructions) return [];
  if (typeof instructions === 'string') {
    return splitListField(instructions);
  }
  if (Array.isArray(instructions)) {
    const out: string[] = [];
    for (const item of instructions) {
      if (typeof item === 'string') {
        const cleaned = item.trim();
        if (cleaned) out.push(cleaned);
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (typeof obj.text === 'string' && obj.text.trim()) {
          out.push(obj.text.trim());
        } else if (Array.isArray(obj.itemListElement)) {
          out.push(...extractInstructions(obj.itemListElement));
        }
      }
    }
    return out;
  }
  return [];
}

function findRecipeJsonLd(node: unknown): Record<string, unknown> | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeJsonLd(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const type = obj['@type'];
    const isRecipe =
      type === 'Recipe' ||
      (Array.isArray(type) && type.includes('Recipe'));
    if (isRecipe) return obj;
    if (obj['@graph']) {
      return findRecipeJsonLd(obj['@graph']);
    }
  }
  return null;
}

export function parseRecipeFromHtml(html: string, sourceUrl?: string): Recipe | null {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1].trim());
      const recipeNode = findRecipeJsonLd(json);
      if (recipeNode) {
        const now = new Date().toISOString();
        const title = String(recipeNode.name ?? 'Imported Recipe').trim();
        const yieldVal = Array.isArray(recipeNode.recipeYield)
          ? recipeNode.recipeYield[0]
          : recipeNode.recipeYield;
        const servings = parseInt(String(yieldVal ?? '4').match(/\d+/)?.[0] ?? '4', 10) || 4;
        const prepMinutes =
          parseIsoDurationMinutes(recipeNode.totalTime) ??
          parseIsoDurationMinutes(recipeNode.cookTime) ??
          parseIsoDurationMinutes(recipeNode.prepTime);

        const rawIngredients = Array.isArray(recipeNode.recipeIngredient)
          ? recipeNode.recipeIngredient.map((i) => String(i).trim()).filter(Boolean)
          : [];

        const steps = extractInstructions(recipeNode.recipeInstructions);

        return {
          id: createId('rec'),
          title,
          image: extractImageUrl(recipeNode.image),
          servings,
          prepMinutes,
          ingredients: rawIngredients.map((i) => parseIngredient(i)),
          steps: steps.length > 0 ? steps : ['Follow source recipe instructions.'],
          notes: '',
          sourceUrl,
          sourceType: 'url',
          createdAt: now,
          updatedAt: now,
        };
      }
    } catch {
      // Ignore malformed JSON-LD block and keep scanning
    }
  }

  // Graceful fallback to page <title> if no JSON-LD Recipe found
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const cleanTitle = titleMatch[1].replace(/\s*[-|–].*$/, '').trim();
    if (cleanTitle) {
      const now = new Date().toISOString();
      return {
        id: createId('rec'),
        title: cleanTitle,
        servings: 4,
        ingredients: [],
        steps: [],
        notes: 'Imported link — add or refine ingredients below.',
        sourceUrl,
        sourceType: 'url',
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  return null;
}

export function parseOcrRecipeText(rawText: string, imageDataUrl?: string): Recipe {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let title = 'Scanned Recipe';
  let servings = 4;
  let prepMinutes: number | undefined;
  const ingredients: string[] = [];
  const steps: string[] = [];

  let section: 'header' | 'ingredients' | 'steps' = 'header';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (/^ingredients?:?$/i.test(lower)) {
      section = 'ingredients';
      continue;
    }
    if (/^(directions?|instructions?|method|steps?|preparation):?$/i.test(lower)) {
      section = 'steps';
      continue;
    }

    // Detect servings/time metadata line
    const servingsMatch = lower.match(/(?:serves|servings|yield)\s*:?\s*(\d+)/);
    const timeMatch = lower.match(/(\d+)\s*(?:min|mins|minutes)/);
    if (servingsMatch || timeMatch) {
      if (servingsMatch) servings = parseInt(servingsMatch[1], 10) || 4;
      if (timeMatch) prepMinutes = parseInt(timeMatch[1], 10);
      if (section === 'header') continue;
    }

    if (section === 'header' && title === 'Scanned Recipe') {
      title = line;
      continue;
    }

    if (section === 'ingredients') {
      ingredients.push(line.replace(/^[•\-*]\s*/, ''));
    } else if (section === 'steps') {
      steps.push(line.replace(/^\d+[.)]\s*/, ''));
    } else {
      // Heuristic when headers weren't printed on the recipe card
      if (/^(\d|½|¼|¾|⅓|⅔)/.test(line) && line.length < 75 && !/^\d+[.)]\s+[A-Z]/.test(line)) {
        ingredients.push(line);
      } else {
        steps.push(line.replace(/^\d+[.)]\s*/, ''));
      }
    }
  }

  const now = new Date().toISOString();
  return {
    id: createId('rec'),
    title,
    image: imageDataUrl,
    servings,
    prepMinutes,
    ingredients: ingredients.map((raw) => parseIngredient(raw)),
    steps: steps.length > 0 ? steps : ['Review scanned notes and add steps as needed.'],
    notes: '',
    sourceType: 'photo',
    createdAt: now,
    updatedAt: now,
  };
}
