import type { GroceryAisle, GroceryItem, Ingredient, PlannedMeal, Recipe } from '../types/recipe';
import { scaleIngredient } from './ingredientParser';

const VOLUME_TO_TSP: Record<string, number> = {
  tsp: 1,
  tbsp: 3,
  cup: 48,
};

const WEIGHT_TO_OZ: Record<string, number> = {
  oz: 1,
  lb: 16,
};

const AISLE_KEYWORDS: Array<{ aisle: GroceryAisle; pattern: RegExp }> = [
  {
    aisle: 'Produce',
    pattern:
      /\b(garlic|lemon|lime|orange|asparagus|dill|basil|thyme|cilantro|mint|parsley|kale|spinach|arugula|tomato|tomatoes|avocado|radish|edamame|onion|shallot|ginger|strawberr|blueberr|berr|pea|fennel|cucumber|carrot|broccoli|mushroom|herb|scallion|chive|pepper)\b/i,
  },
  {
    aisle: 'Dairy & Eggs',
    pattern:
      /\b(milk|butter|cream|parmesan|ricotta|cheese|yogurt|egg|eggs|sour cream|mozzarella|cheddar|feta|oat milk|almond milk)\b/i,
  },
  {
    aisle: 'Protein',
    pattern: /\b(salmon|chicken|beef|pork|turkey|shrimp|tofu|tempeh|cod|fish|bacon|sausage)\b/i,
  },
  {
    aisle: 'Bakery',
    pattern: /\b(bread|sourdough|baguette|tortilla|bun|roll|pita|brioche)\b/i,
  },
  {
    aisle: 'Pantry',
    pattern:
      /\b(orzo|pasta|rice|oats|bean|beans|chickpea|lentil|broth|stock|oil|miso|soy sauce|tamari|honey|maple|vinegar|flour|sugar|salt|spice|curry|turmeric|cumin|almond|walnut|nut|seed|sesame|chia|coconut|yeast|panko|breadcrumb)\b/i,
  },
];

export function categorizeAisle(ingredientName: string): GroceryAisle {
  for (const entry of AISLE_KEYWORDS) {
    if (entry.pattern.test(ingredientName)) {
      return entry.aisle;
    }
  }
  return 'Other';
}

function normalizeKeyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(grated|shaved|shredded|minced|chopped|diced|sliced|freshly|toasted|softened|melted|cooked|rinsed|drained)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function addCompatibleQuantities(
  qtyA: number | null,
  unitA: string,
  qtyB: number | null,
  unitB: string,
): { quantity: number | null; unit: string } | null {
  if (qtyA === null && qtyB === null) {
    return { quantity: null, unit: unitA || unitB };
  }
  if (qtyA === null || qtyB === null) {
    return { quantity: qtyA ?? qtyB, unit: unitA || unitB };
  }

  // Exact same unit
  if (unitA === unitB) {
    return { quantity: Math.round((qtyA + qtyB) * 1000) / 1000, unit: unitA };
  }

  // Volume conversions (tsp, tbsp, cup)
  if (unitA in VOLUME_TO_TSP && unitB in VOLUME_TO_TSP) {
    const totalTsp = qtyA * VOLUME_TO_TSP[unitA] + qtyB * VOLUME_TO_TSP[unitB];
    if (totalTsp >= 12) {
      return { quantity: Math.round((totalTsp / 48) * 1000) / 1000, unit: 'cup' };
    }
    if (totalTsp >= 3) {
      return { quantity: Math.round((totalTsp / 3) * 1000) / 1000, unit: 'tbsp' };
    }
    return { quantity: Math.round(totalTsp * 1000) / 1000, unit: 'tsp' };
  }

  // Weight conversions (oz, lb)
  if (unitA in WEIGHT_TO_OZ && unitB in WEIGHT_TO_OZ) {
    const totalOz = qtyA * WEIGHT_TO_OZ[unitA] + qtyB * WEIGHT_TO_OZ[unitB];
    if (totalOz >= 16) {
      return { quantity: Math.round((totalOz / 16) * 1000) / 1000, unit: 'lb' };
    }
    return { quantity: Math.round(totalOz * 1000) / 1000, unit: 'oz' };
  }

  return null;
}

export const AISLE_ORDER: GroceryAisle[] = [
  'Produce',
  'Dairy & Eggs',
  'Protein',
  'Bakery',
  'Pantry',
  'Other',
];

export function aggregateGroceries(
  plan: PlannedMeal[],
  recipes: Recipe[],
  checkedMap: Record<string, boolean> = {},
  customItemIds: Record<string, string> = {},
): GroceryItem[] {
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const items: GroceryItem[] = [];

  for (const meal of plan) {
    const recipe = recipeById.get(meal.recipeId);
    if (!recipe) continue;

    const baseServings = recipe.servings > 0 ? recipe.servings : 1;
    const factor = meal.servings / baseServings;
    const ingredients: Ingredient[] = meal.customIngredients ?? recipe.ingredients;
    const sourceTitle = meal.customTitle || recipe.title;

    for (const ing of ingredients) {
      const scaled = scaleIngredient(ing, factor);
      const normName = normalizeKeyName(scaled.name);
      if (!normName) continue;

      let merged = false;
      for (const existing of items) {
        if (normalizeKeyName(existing.name) === normName) {
          const combined = addCompatibleQuantities(
            existing.quantity,
            existing.unit,
            scaled.quantity,
            scaled.unit,
          );
          if (combined) {
            existing.quantity = combined.quantity;
            existing.unit = combined.unit;
            if (!existing.sources.includes(sourceTitle)) {
              existing.sources.push(sourceTitle);
            }
            merged = true;
            break;
          }
        }
      }

      if (!merged) {
        const id = `gro-${normName.replace(/[^a-z0-9]+/g, '-')}-${scaled.unit || 'ea'}`;
        items.push({
          id,
          name: normName,
          quantity: scaled.quantity,
          unit: scaled.unit,
          aisle: categorizeAisle(normName),
          checked: Boolean(checkedMap[id]),
          sources: [sourceTitle],
          walmartItemId: customItemIds[id],
        });
      }
    }
  }

  items.sort((a, b) => {
    const aisleDiff = AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle);
    if (aisleDiff !== 0) return aisleDiff;
    return a.name.localeCompare(b.name);
  });

  return items;
}
