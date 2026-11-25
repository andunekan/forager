import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanOcrText,
  extractRecipeWithGeminiVision,
  parseGeminiRecipeJson,
} from '../photoOcr';

describe('photoOcr', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('repairs common culinary OCR misreads like l cup, thsp, 0z, and 35O°F', () => {
    const noisy = [
      '~ |',
      'l 1/2 cups all-purpose flour',
      '2 thsp unsalted butter',
      '8 0z cream cheese',
      'I tsp vanilla extract',
      'Bake at 35O°F for 25 mins.',
    ].join('\n');

    const cleaned = cleanOcrText(noisy);
    expect(cleaned).toContain('1 1/2 cups all-purpose flour');
    expect(cleaned).toContain('2 tbsp unsalted butter');
    expect(cleaned).toContain('8 oz cream cheese');
    expect(cleaned).toContain('1 tsp vanilla extract');
    expect(cleaned).toContain('350°F');
    expect(cleaned).not.toContain('~ |');
  });

  it('parses structured JSON returned by Gemini Vision into a Recipe', () => {
    const jsonText = JSON.stringify({
      title: 'Grandma Lemon Loaf',
      servings: 8,
      prepMinutes: 55,
      ingredients: ['1 1/2 cups flour', '1 cup sugar', '2 lemons, zested', '1/2 cup buttermilk'],
      steps: ['Preheat oven to 350F.', 'Whisk wet and dry ingredients and bake 45 minutes.'],
      notes: 'Glaze while still warm.',
    });

    const recipe = parseGeminiRecipeJson(jsonText, 'data:image/jpeg;base64,abc');
    expect(recipe?.title).toBe('Grandma Lemon Loaf');
    expect(recipe?.servings).toBe(8);
    expect(recipe?.prepMinutes).toBe(55);
    expect(recipe?.ingredients).toHaveLength(4);
    expect(recipe?.steps).toHaveLength(2);
    expect(recipe?.notes).toBe('Glaze while still warm.');
    expect(recipe?.sourceType).toBe('photo');
  });

  it('calls Gemini Vision API cleanly with the photo and returns a structured Recipe', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: 'Crispy Chickpea Tacos',
                    servings: 4,
                    prepMinutes: 20,
                    ingredients: ['2 cans chickpeas', '8 corn tortillas', '1 lime'],
                    steps: ['Roast chickpeas with spices.', 'Serve in warm tortillas with lime.'],
                    notes: '',
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const recipe = await extractRecipeWithGeminiVision(
      'data:image/jpeg;base64,ZmFrZQ==',
      'test-api-key',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recipe.title).toBe('Crispy Chickpea Tacos');
    expect(recipe.ingredients).toHaveLength(3);
    expect(recipe.steps).toHaveLength(2);
  });
});
