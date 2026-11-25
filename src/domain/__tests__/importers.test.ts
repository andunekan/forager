import { describe, expect, it } from 'vitest';
import {
  parseCsvRecipes,
  parseOcrRecipeText,
  parseRecipeFromHtml,
} from '../importers';

describe('importers', () => {
  describe('parseCsvRecipes (spreadsheet import)', () => {
    it('imports multiple recipes from CSV with semicolon-delimited ingredients and steps', () => {
      const csv = [
        'Title,Servings,Prep Minutes,Ingredients,Instructions,Notes',
        '"Spring Pea Risotto",4,30,"1 cup arborio rice; 1 cup green peas; 2 tbsp butter","Toast rice; Add broth gradually; Stir in peas and butter","Use warm broth"',
        '"Avocado Toast",2,10,"2 slices sourdough bread; 1 avocado; 1/2 lemon","Toast bread; Mash avocado with lemon","Add chili flakes"',
      ].join('\n');

      const recipes = parseCsvRecipes(csv);
      expect(recipes).toHaveLength(2);
      expect(recipes[0].title).toBe('Spring Pea Risotto');
      expect(recipes[0].servings).toBe(4);
      expect(recipes[0].prepMinutes).toBe(30);
      expect(recipes[0].ingredients).toHaveLength(3);
      expect(recipes[0].steps).toHaveLength(3);
      expect(recipes[0].notes).toBe('Use warm broth');
      expect(recipes[0].sourceType).toBe('spreadsheet');
    });
  });

  describe('parseRecipeFromHtml (link import)', () => {
    it('extracts JSON-LD schema.org/Recipe from HTML including @graph', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@graph": [
                  { "@type": "WebPage", "name": "Blog" },
                  {
                    "@type": "Recipe",
                    "name": "Roasted Garlic Tomato Soup",
                    "recipeYield": "4 servings",
                    "totalTime": "PT35M",
                    "image": "https://example.com/soup.jpg",
                    "recipeIngredient": [
                      "2 lbs roma tomatoes",
                      "1 head garlic",
                      "2 tbsp olive oil"
                    ],
                    "recipeInstructions": [
                      { "@type": "HowToStep", "text": "Roast tomatoes and garlic at 400F." },
                      { "@type": "HowToStep", "text": "Blend until velvety smooth." }
                    ]
                  }
                ]
              }
            </script>
          </head>
          <body></body>
        </html>
      `;

      const recipe = parseRecipeFromHtml(html, 'https://example.com/tomato-soup');
      expect(recipe).not.toBeNull();
      expect(recipe?.title).toBe('Roasted Garlic Tomato Soup');
      expect(recipe?.servings).toBe(4);
      expect(recipe?.prepMinutes).toBe(35);
      expect(recipe?.ingredients).toHaveLength(3);
      expect(recipe?.steps).toHaveLength(2);
      expect(recipe?.sourceUrl).toBe('https://example.com/tomato-soup');
      expect(recipe?.sourceType).toBe('url');
    });
  });

  describe('parseOcrRecipeText (photo import)', () => {
    it('parses structured recipe from photographed cookbook text', () => {
      const ocrText = `
        Honey Chamomile Pancakes
        Serves 3 | 20 mins

        Ingredients:
        1 1/2 cups all-purpose flour
        1 cup milk
        2 tbsp honey
        1 egg

        Directions:
        1. Whisk dry ingredients together in a bowl.
        2. Fold in milk, honey, and egg until just combined.
        3. Griddle over medium-low heat until golden.
      `;

      const recipe = parseOcrRecipeText(ocrText);
      expect(recipe.title).toBe('Honey Chamomile Pancakes');
      expect(recipe.servings).toBe(3);
      expect(recipe.prepMinutes).toBe(20);
      expect(recipe.ingredients).toHaveLength(4);
      expect(recipe.steps).toHaveLength(3);
      expect(recipe.sourceType).toBe('photo');
    });

    it('separates ingredients from wrapped steps even without headings and fixes OCR typos', () => {
      const messyOcr = `
        Weeknight Garlic Noodles
        Serves 4
        l lb spaghetti
        4 thsp unsalted butter
        6 cloves garlic, minced
        2 tbsp soy sauce
        Salt and pepper to taste
        Bring a large pot of salted water to a boil
        and cook spaghetti until al dente.
        Melt butter in a skillet over medium heat, add garlic,
        and toss with noodles and soy sauce.
      `;

      const recipe = parseOcrRecipeText(messyOcr);
      expect(recipe.title).toBe('Weeknight Garlic Noodles');
      expect(recipe.servings).toBe(4);
      expect(recipe.ingredients).toHaveLength(5);
      expect(recipe.ingredients[0].quantity).toBe(1);
      expect(recipe.ingredients[1].unit).toBe('tbsp');
      expect(recipe.steps).toHaveLength(2);
      expect(recipe.steps[0]).toContain('al dente');
    });
  });
});
