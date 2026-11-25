import { describe, expect, it } from 'vitest';
import type { PlannedMeal, Recipe } from '../../types/recipe';
import { aggregateGroceries } from '../groceryAggregator';
import { parseIngredient } from '../ingredientParser';

const recipes: Recipe[] = [
  {
    id: 'r-orzo',
    title: 'Lemon Herb Orzo',
    servings: 2,
    ingredients: [
      parseIngredient('1 cup orzo'),
      parseIngredient('2 tbsp unsalted butter'),
      parseIngredient('2 cloves garlic, minced'),
      parseIngredient('1 lemon'),
    ],
    steps: ['Cook'],
    notes: '',
    createdAt: '2026-11-25T00:00:00Z',
    updatedAt: '2026-11-25T00:00:00Z',
  },
  {
    id: 'r-beans',
    title: 'Creamy Tuscan Beans',
    servings: 4,
    ingredients: [
      parseIngredient('1/4 cup unsalted butter'),
      parseIngredient('4 cloves garlic, sliced'),
      parseIngredient('1 lb baby kale'),
    ],
    steps: ['Simmer'],
    notes: '',
    createdAt: '2026-11-25T00:00:00Z',
    updatedAt: '2026-11-25T00:00:00Z',
  },
];

describe('groceryAggregator', () => {
  it('scales ingredients by planned servings and combines matching items across recipes', () => {
    const plan: PlannedMeal[] = [
      { id: 'm1', dayIndex: 0, slot: 'dinner', recipeId: 'r-orzo', servings: 4 }, // 2x -> 4 tbsp butter (1/4 cup), 4 cloves garlic
      { id: 'm2', dayIndex: 2, slot: 'dinner', recipeId: 'r-beans', servings: 4 }, // 1x -> 1/4 cup butter, 4 cloves garlic
    ];

    const list = aggregateGroceries(plan, recipes);

    const garlic = list.find((i) => i.name.toLowerCase() === 'garlic');
    expect(garlic?.quantity).toBe(8);
    expect(garlic?.unit).toBe('clove');
    expect(garlic?.sources).toContain('Lemon Herb Orzo');
    expect(garlic?.sources).toContain('Creamy Tuscan Beans');

    // 4 tbsp (0.25 cup) + 0.25 cup = 0.5 cup butter
    const butter = list.find((i) => i.name.toLowerCase().includes('butter'));
    expect(butter?.quantity).toBeCloseTo(0.5, 2);
    expect(butter?.unit).toBe('cup');
    expect(butter?.aisle).toBe('Dairy & Eggs');
  });

  it('respects per-meal custom ingredient adjustments from planning mode', () => {
    const plan: PlannedMeal[] = [
      {
        id: 'm1',
        dayIndex: 0,
        slot: 'dinner',
        recipeId: 'r-orzo',
        servings: 2,
        customIngredients: [
          parseIngredient('1 cup gluten-free orzo'),
          parseIngredient('2 tbsp olive oil'),
        ],
      },
    ];

    const list = aggregateGroceries(plan, recipes);
    expect(list.some((i) => i.name.toLowerCase().includes('olive oil'))).toBe(true);
    expect(list.some((i) => i.name.toLowerCase().includes('butter'))).toBe(false);
  });
});
