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

  it('sends all pages together when given multiple recipe photos and uses page 1 as cover', async () => {
    const mockModel = {
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              title: 'Two-Page Sourdough Focaccia',
              servings: 8,
              prepMinutes: 45,
              ingredients: ['500 g bread flour', '3 tbsp olive oil', '2 tsp flaky salt'],
              steps: [
                'Mix dough on page 1 and rest overnight.',
                'Dimple dough on page 2 and bake at 425F for 25 minutes.',
              ],
              notes: 'Great with rosemary.',
            }),
        },
      }),
    };

    const page1 = 'data:image/jpeg;base64,cGFnZTE=';
    const page2 = 'data:image/png;base64,cGFnZTI=';
    const recipe = await extractRecipeFromFirebaseModel([page1, page2], mockModel);

    expect(mockModel.generateContent).toHaveBeenCalledTimes(1);
    const sentParts = mockModel.generateContent.mock.calls[0][0] as Array<
      string | { type: string; inlineData: { mimeType: string; data: string } }
    >;
    const inlineParts = sentParts.filter((p) => typeof p !== 'string');
    expect(inlineParts).toHaveLength(2);
    expect(inlineParts[0]).toMatchObject({
      type: 'inlineData',
      inlineData: { mimeType: 'image/jpeg', data: 'cGFnZTE=' },
    });
    expect(inlineParts[1]).toMatchObject({
      type: 'inlineData',
      inlineData: { mimeType: 'image/png', data: 'cGFnZTI=' },
    });
    expect(recipe.image).toBe(page1);
    expect(recipe.title).toBe('Two-Page Sourdough Focaccia');
  });

  it('surfaces a helpful App Check message when Firebase AI rejects unverified requests', async () => {
    const mockModel = {
      generateContent: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'AI: Error fetching: [401 Unauthorized] Firebase App Check token is invalid. (AI/fetch-error)',
          ),
        ),
    };

    await expect(
      extractRecipeFromFirebaseModel(['data:image/jpeg;base64,ZmFrZQ=='], mockModel),
    ).rejects.toThrow(/App Check/i);
  });

  it('uses a culinary reverse-engineering prompt with optional hint when scanning a finished dish photo', async () => {
    const mockModel = {
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              title: 'Crispy Chili Garlic Ramen',
              servings: 2,
              prepMinutes: 25,
              ingredients: ['2 packs ramen noodles', '2 tbsp chili crisp', '2 soft-boiled eggs'],
              steps: ['Simmer savory garlic broth.', 'Top noodles with chili crisp and eggs.'],
              notes: 'Garnish with scallions and toasted sesame seeds.',
            }),
        },
      }),
    };

    const dishPhoto = 'data:image/jpeg;base64,ZGlzaA==';
    const recipe = await extractRecipeFromFirebaseModel([dishPhoto], mockModel, {
      mode: 'dish',
      hint: 'make it extra spicy',
    });

    expect(mockModel.generateContent).toHaveBeenCalledTimes(1);
    const sentParts = mockModel.generateContent.mock.calls[0][0] as Array<string | object>;
    const promptText = String(sentParts[0]);
    expect(promptText).toMatch(/finished meal|dish/i);
    expect(promptText).toContain('make it extra spicy');
    expect(recipe.title).toBe('Crispy Chili Garlic Ramen');
    expect(recipe.image).toBe(dishPhoto);
  });
});
