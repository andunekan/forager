import { describe, expect, it } from 'vitest';
import type { Recipe } from '../../types/recipe';
import { parseIngredient } from '../ingredientParser';
import {
  classifyRecipeProtein,
  groupRecipesByProtein,
  sortRecipesByProtein,
} from '../proteinClassifier';

const makeRecipe = (id: string, title: string, ingredients: string[]): Recipe => ({
  id,
  title,
  servings: 4,
  ingredients: ingredients.map((i) => parseIngredient(i)),
  steps: ['Cook'],
  notes: '',
  createdAt: '2026-11-26T00:00:00Z',
  updatedAt: '2026-11-26T00:00:00Z',
});

describe('proteinClassifier', () => {
  it('classifies recipes accurately across poultry, beef & pork, seafood, plant-based, eggs & cheese, and other', () => {
    expect(
      classifyRecipeProtein(makeRecipe('1', 'Herb Roasted Chicken', ['2 lbs chicken thighs', '1 lemon'])),
    ).toBe('Poultry');

    expect(
      classifyRecipeProtein(makeRecipe('2', 'Weeknight Beef Tacos', ['1 lb ground beef', '8 tortillas'])),
    ).toBe('Beef & Pork');

    expect(
      classifyRecipeProtein(makeRecipe('3', 'Miso Glazed Salmon Bowl', ['2 fillets salmon', '1 cup edamame'])),
    ).toBe('Seafood');

    expect(
      classifyRecipeProtein(makeRecipe('4', 'Golden Chickpea Curry', ['2 cans chickpeas', '1 can coconut milk'])),
    ).toBe('Plant-based');

    expect(
      classifyRecipeProtein(makeRecipe('5', 'Spinach Feta Frittata', ['6 eggs', '1/2 cup feta cheese'])),
    ).toBe('Eggs & Cheese');

    expect(
      classifyRecipeProtein(makeRecipe('6', 'Garlic Herb Focaccia', ['3 cups flour', '2 tbsp olive oil'])),
    ).toBe('Other');
  });

  it('ignores broth, stock, and fish sauce modifiers so vegetarian recipes are not misclassified as meat or seafood', () => {
    const lentilSoup = makeRecipe('soup', 'Warm Red Lentil Soup', [
      '1 cup red lentils',
      '4 cups chicken broth',
      '2 carrots',
    ]);
    expect(classifyRecipeProtein(lentilSoup)).toBe('Plant-based');

    const tofuPadThai = makeRecipe('padthai', 'Crispy Tofu Pad Thai', [
      '14 oz firm tofu',
      '1 tbsp fish sauce',
      '8 oz rice noodles',
    ]);
    expect(classifyRecipeProtein(tofuPadThai)).toBe('Plant-based');
  });

  it('sorts and groups recipes cleanly in protein order without empty groups', () => {
    const recipes = [
      makeRecipe('c', 'Chickpea Curry', ['2 cans chickpeas']),
      makeRecipe('s', 'Garlic Shrimp Pasta', ['1 lb shrimp', '1 lb linguine']),
      makeRecipe('p', 'Lemon Chicken', ['1 lb chicken breast']),
      makeRecipe('b', 'Pork Carnitas', ['2 lbs pork shoulder']),
      makeRecipe('t', 'Crispy Tofu Stir Fry', ['14 oz tofu']),
    ];

    const sorted = sortRecipesByProtein(recipes);
    expect(sorted.map((r) => r.id)).toEqual(['p', 'b', 's', 'c', 't']);

    const groups = groupRecipesByProtein(recipes);
    expect(groups.map((g) => g.protein)).toEqual([
      'Poultry',
      'Beef & Pork',
      'Seafood',
      'Plant-based',
    ]);
    expect(groups[3].recipes.map((r) => r.id)).toEqual(['c', 't']);
  });
});
