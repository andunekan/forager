import { describe, expect, it } from 'vitest';
import type { Recipe } from '../../types/recipe';
import { parseIngredient } from '../ingredientParser';
import { applyRecipeTransform } from '../recipeTransforms';

const sampleRecipe: Recipe = {
  id: 'r1',
  title: 'Lemon Herb Orzo',
  servings: 4,
  prepMinutes: 25,
  ingredients: [
    parseIngredient('1 cup orzo pasta'),
    parseIngredient('2 tbsp unsalted butter'),
    parseIngredient('1/2 cup heavy cream'),
    parseIngredient('1/2 cup grated parmesan'),
    parseIngredient('2 cloves garlic, minced'),
    parseIngredient('1 lemon, zested'),
  ],
  steps: [
    'Melt butter in a skillet over medium heat and saute garlic.',
    'Stir in heavy cream and cooked orzo until glossy.',
    'Finish with parmesan and lemon zest.',
  ],
  notes: '',
  createdAt: '2026-11-25T00:00:00Z',
  updatedAt: '2026-11-25T00:00:00Z',
};

describe('recipeTransforms', () => {
  it('substitutes dairy ingredients and updates cooking steps', () => {
    const result = applyRecipeTransform(sampleRecipe, 'substitute the dairy');
    const names = result.recipe.ingredients.map((i) => i.name.toLowerCase());

    expect(names.some((n) => n.includes('butter') && !n.includes('vegan'))).toBe(false);
    expect(names.some((n) => n.includes('heavy cream'))).toBe(false);
    expect(names.some((n) => n.includes('parmesan'))).toBe(false);
    expect(names.some((n) => n.includes('olive oil') || n.includes('vegan butter'))).toBe(true);
    expect(names.some((n) => n.includes('coconut cream') || n.includes('oat cream'))).toBe(true);
    expect(names.some((n) => n.includes('nutritional yeast'))).toBe(true);
    expect(result.changes.length).toBeGreaterThanOrEqual(3);
    expect(result.recipe.steps.join(' ').toLowerCase()).not.toContain('heavy cream');
  });

  it('supports gluten-free transformation', () => {
    const result = applyRecipeTransform(sampleRecipe, 'make gluten-free');
    const names = result.recipe.ingredients.map((i) => i.name.toLowerCase());
    expect(names.some((n) => n.includes('gluten-free'))).toBe(true);
    expect(result.changes.length).toBeGreaterThanOrEqual(1);
  });

  it('supports custom natural-language swap commands', () => {
    const result = applyRecipeTransform(sampleRecipe, 'swap garlic for shallots');
    const names = result.recipe.ingredients.map((i) => i.name.toLowerCase());
    expect(names.some((n) => n.includes('shallots'))).toBe(true);
    expect(names.some((n) => n.includes('garlic'))).toBe(false);
    expect(result.recipe.steps[0].toLowerCase()).toContain('shallots');
  });

  it('supports scaling a single ingredient like double the garlic', () => {
    const result = applyRecipeTransform(sampleRecipe, 'double the garlic');
    const garlic = result.recipe.ingredients.find((i) => i.name.toLowerCase().includes('garlic'));
    expect(garlic?.quantity).toBe(4);
    expect(result.changes.length).toBe(1);
  });

  it('supports removing an ingredient like no parmesan', () => {
    const result = applyRecipeTransform(sampleRecipe, 'remove parmesan');
    const names = result.recipe.ingredients.map((i) => i.name.toLowerCase());
    expect(names.some((n) => n.includes('parmesan'))).toBe(false);
    expect(result.changes.length).toBe(1);
  });
});
