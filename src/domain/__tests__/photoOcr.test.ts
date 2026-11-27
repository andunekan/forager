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
    expect(String(fetchMock.mock.calls[0][0])).toContain('/models/gemini-4-hydrogen:generateContent');
    expect(recipe.title).toBe('Crispy Chickpea Tacos');
    expect(recipe.ingredients).toHaveLength(3);
    expect(recipe.steps).toHaveLength(2);
  });

  it('sends multiple recipe page photos together in a single Gemini Vision request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: 'Multipage Braised Short Ribs',
                    servings: 6,
                    prepMinutes: 150,
                    ingredients: ['3 lbs beef short ribs', '2 cups red wine'],
                    steps: ['Sear ribs from page 1.', 'Braise covered from page 2.'],
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

    const page1 = 'data:image/jpeg;base64,cGFnZTE=';
    const page2 = 'data:image/jpeg;base64,cGFnZTI=';
    const recipe = await extractRecipeWithGeminiVision([page1, page2], 'test-api-key');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      contents: Array<{ parts: Array<{ text?: string; inline_data?: { data: string } }> }>;
    };
    const imageParts = body.contents[0].parts.filter((p) => p.inline_data);
    expect(imageParts).toHaveLength(2);
    expect(imageParts[0].inline_data?.data).toBe('cGFnZTE=');
    expect(imageParts[1].inline_data?.data).toBe('cGFnZTI=');
    expect(recipe.image).toBe(page1);
    expect(recipe.title).toBe('Multipage Braised Short Ribs');
  });

  it('creates a recipe from a finished dish photo when mode is dish', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: 'Charred Street Corn Elote Bowl',
                    servings: 4,
                    prepMinutes: 20,
                    ingredients: ['4 ears sweet corn', '1/3 cup cotija cheese', '1 lime'],
                    steps: ['Char corn in a hot skillet.', 'Toss with lime, crema, and cotija.'],
                    notes: 'Finish with Tajin or chili powder.',
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const dishPhoto = 'data:image/jpeg;base64,ZWxvdGU=';
    const recipe = await extractRecipeWithGeminiVision([dishPhoto], 'test-api-key', {
      mode: 'dish',
      hint: 'vegetarian',
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      contents: Array<{ parts: Array<{ text?: string }> }>;
    };
    expect(body.contents[0].parts[0].text).toMatch(/finished meal|dish/i);
    expect(body.contents[0].parts[0].text).toContain('vegetarian');
    expect(recipe.title).toBe('Charred Street Corn Elote Bowl');
    expect(recipe.image).toBe(dishPhoto);
  });
});
