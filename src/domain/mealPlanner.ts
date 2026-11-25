import type { MealSlot, PlannedMeal, Recipe } from '../types/recipe';

export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const FULL_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const DEFAULT_MEAL_SLOT: MealSlot = 'dinner';

export interface SerendipitySuggestion {
  recipe: Recipe;
  sharedIngredients: string[];
  reason: string;
}

const PANTRY_IGNORE = new Set([
  'salt',
  'kosher salt',
  'sea salt',
  'flaky sea salt',
  'black pepper',
  'pepper',
  'water',
  'olive oil',
  'extra-virgin olive oil',
]);

function normalizeCoreName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fresh|dried|chopped|minced|sliced|diced|grated|shaved|unsalted|salted|organic|baby|whole|extra-virgin)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findNextOpenDay(plan: PlannedMeal[]): number {
  for (let d = 0; d < 7; d += 1) {
    if (!plan.some((m) => m.dayIndex === d)) {
      return d;
    }
  }
  return plan.length % 7;
}

export function suggestSerendipitousRecipe(
  library: Recipe[],
  currentPlan: PlannedMeal[],
  excludeRecipeId?: string,
): SerendipitySuggestion | null {
  if (library.length === 0) return null;

  const plannedIds = new Set(currentPlan.map((m) => m.recipeId));
  const plannedRecipes = library.filter((r) => plannedIds.has(r.id));

  const plannedIngredients = new Set<string>();
  for (const recipe of plannedRecipes) {
    for (const ing of recipe.ingredients) {
      const core = normalizeCoreName(ing.name);
      if (core && !PANTRY_IGNORE.has(core)) {
        plannedIngredients.add(core);
      }
    }
  }

  const candidates = library.filter(
    (r) => !plannedIds.has(r.id) && r.id !== excludeRecipeId,
  );
  const pool = candidates.length > 0 ? candidates : library.filter((r) => r.id !== excludeRecipeId);
  if (pool.length === 0) return null;

  const scored = pool.map((recipe) => {
    const shared: string[] = [];
    for (const ing of recipe.ingredients) {
      const core = normalizeCoreName(ing.name);
      if (core && plannedIngredients.has(core) && !shared.includes(core)) {
        shared.push(core);
      }
    }
    return { recipe, shared };
  });

  scored.sort((a, b) => b.shared.length - a.shared.length);
  const best = scored[0];

  if (best.shared.length > 0) {
    return {
      recipe: best.recipe,
      sharedIngredients: best.shared,
      reason: `Pairs with ${best.shared.slice(0, 2).join(' & ')} already on your week`,
    };
  }

  return {
    recipe: best.recipe,
    sharedIngredients: [],
    reason: 'A fresh change of pace for the week',
  };
}
