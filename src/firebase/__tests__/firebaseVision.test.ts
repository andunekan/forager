import { describe, expect, it, vi } from 'vitest';
import {
  extractRecipeFromFirebaseModel,
  parseDataUrlToInlinePart,
} from '../firebaseVision';

describe('firebaseVision', () => {
  it('parses base64 data URLs into Gemini inlineData parts', () => {
    const part = parseDataUrlToInlinePart('data:image/jpeg;base64,ZmFrZWRhdGE=');
    expect(part.inlineData.mimeType).toBe('image/jpeg');
    expect(part.inlineData.data).toBe('ZmFrZWRhdGE=');

    expect(() => parseDataUrlToInlinePart('not-a-data-url')).toThrow();
  });

  it('parses structured recipe output returned by Firebase AI Logic model', async () => {
    const mockModel = {
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              title: 'Blueberry Cornmeal Muffins',
              servings: 12,
              prepMinutes: 35,
              ingredients: ['1 cup yellow cornmeal', '1 cup flour', '1 cup blueberries'],
              steps: ['Mix dry and wet ingredients.', 'Fold in blueberries and bake 20 minutes.'],
              notes: 'Best warm with butter.',
            }),
        },
      }),
    };

    const recipe = await extractRecipeFromFirebaseModel(
      'data:image/jpeg;base64,ZmFrZQ==',
      mockModel,
    );

    expect(mockModel.generateContent).toHaveBeenCalledTimes(1);
    expect(recipe.title).toBe('Blueberry Cornmeal Muffins');
    expect(recipe.servings).toBe(12);
    expect(recipe.ingredients).toHaveLength(3);
    expect(recipe.steps).toHaveLength(2);
    expect(recipe.sourceType).toBe('photo');
  });
});
