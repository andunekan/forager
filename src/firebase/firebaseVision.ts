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

const RECIPE_VISION_PROMPT = [
  'Transcribe the recipe shown in this photo into clean JSON with these exact keys:',
  '{"title": string, "servings": number, "prepMinutes": number | null, "ingredients": string[], "steps": string[], "notes": string}.',
  'Preserve exact ingredient quantities and fractions (e.g. "1 1/2 cups flour").',
  'Combine multi-line steps into complete sentences. Do not invent ingredients not in the photo.',
].join(' ');

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
  imageDataUrl: string,
  model: VisionModelLike,
): Promise<Recipe> {
  const imagePart = parseDataUrlToInlinePart(imageDataUrl);
  const result = await model.generateContent([RECIPE_VISION_PROMPT, imagePart]);
  const text = result.response.text();
  const recipe = parseGeminiRecipeJson(text, imageDataUrl);
  if (!recipe) {
    throw new Error('Could not parse structured recipe from Gemini Vision response.');
  }
  return recipe;
}

export async function extractRecipeWithFirebaseAi(imageDataUrl: string): Promise<Recipe> {
  const model = getFirebaseVisionModel();
  if (!model) {
    throw new Error('Firebase AI Logic is not configured.');
  }
  return extractRecipeFromFirebaseModel(imageDataUrl, model);
}
