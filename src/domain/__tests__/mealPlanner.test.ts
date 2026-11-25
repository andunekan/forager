import { describe, expect, it } from 'vitest';
import type { PlannedMeal, Recipe } from '../../types/recipe';
import { parseIngredient } from '../ingredientParser';
import { suggestSerendipitousRecipe } from '../mealPlanner';

const makeRecipe = (id: string, title: string, ingredients: string[]): Recipe => ({
  id,
  title,
  servings: 2,
  ingredients: ingredients.map((i) => parseIngredient(i)),
  steps: ['Prepare'],
  notes: '',
  createdAt: '2026-11-25T00:00:00Z',
  updatedAt: '2026-11-25T00:00:00Z',
});

describe('mealPlanner serendipity', () => {
  it('prefers an unplanned recipe that shares ingredients with the current week', () => {
    const library = [
      makeRecipe('r1', 'Lemon Orzo', ['1 cup orzo', '2 cloves garlic', '1 lemon']),
      makeRecipe('r2', 'Tuscan Beans', ['1 can white beans', '2 cloves garlic', '1 lemon']),
      makeRecipe('r3', 'Matcha Oats', ['1 cup rolled oats', '1 cup almond milk']),
    ];
    const plan: PlannedMeal[] = [
      { id: 'm1', dayIndex: 0, slot: 'dinner', recipeId: 'r1', servings: 2 },
    ];

    const suggestion = suggestSerendipitousRecipe(library, plan);
    expect(suggestion?.recipe.id).toBe('r2');
    expect(suggestion?.sharedIngredients.length).toBeGreaterThanOrEqual(2);
  });
});
