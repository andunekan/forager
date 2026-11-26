import { describe, expect, it } from 'vitest';
import { parseIngredient } from '../../domain/ingredientParser';
import type { Recipe } from '../../types/recipe';
import {
  mergeLocalAndCloudState,
  sanitizeForFirestore,
  type ForagerUserState,
} from '../cloudSync';

const makeRecipe = (id: string, title: string, updatedAt: string): Recipe => ({
  id,
  title,
  servings: 4,
  prepMinutes: undefined, // intentionally undefined to verify Firestore sanitization
  ingredients: [parseIngredient('1 cup rice')],
  steps: ['Cook'],
  notes: '',
  createdAt: '2026-11-20T00:00:00Z',
  updatedAt,
});

describe('cloudSync', () => {
  it('recursively removes undefined fields so Firestore setDoc never rejects', () => {
    const dirty = {
      title: 'Soup',
      prepMinutes: undefined,
      nested: { a: 1, b: undefined, list: [{ x: 'ok', y: undefined }] },
    };

    const clean = sanitizeForFirestore(dirty);
    expect('prepMinutes' in clean).toBe(false);
    expect('b' in clean.nested).toBe(false);
    expect('y' in clean.nested.list[0]).toBe(false);
    expect(clean.nested.list[0].x).toBe('ok');
  });

  it('merges local and cloud recipes, Walmart history, and store preferences cleanly without data loss', () => {
    const local: ForagerUserState = {
      recipes: [
        makeRecipe('r1', 'Orzo Old', '2026-11-20T10:00:00Z'),
        makeRecipe('r-local', 'Local Curry', '2026-11-24T10:00:00Z'),
      ],
      plan: [{ id: 'm1', dayIndex: 0, slot: 'dinner', recipeId: 'r-local', servings: 2 }],
      checkedMap: { 'gro-garlic-clove': true },
      extraItems: [],
      walmartItemIds: { 'gro-milk-cup': '10450114' },
      walmartHistory: [
        { walmartItemId: '10291641', productName: 'Good Seasons Italian Dressing', purchaseCount: 2 },
      ],
      walmartFulfillment: 'pickup',
      walmartStoreId: '5435',
      updatedAt: '2026-11-24T10:00:00Z',
    };

    const cloud: ForagerUserState = {
      recipes: [
        makeRecipe('r1', 'Orzo Updated', '2026-11-25T10:00:00Z'),
        makeRecipe('r-cloud', 'Cloud Salmon', '2026-11-23T10:00:00Z'),
      ],
      plan: [{ id: 'm2', dayIndex: 2, slot: 'dinner', recipeId: 'r-cloud', servings: 4 }],
      checkedMap: { 'gro-lemon-ea': true },
      extraItems: [],
      walmartItemIds: { 'gro-butter-tbsp': '17777211' },
      walmartHistory: [
        { walmartItemId: '10291641', productName: 'Good Seasons Italian Dressing Mix', purchaseCount: 3 },
        { walmartItemId: '17777211', productName: 'Kerrygold Butter', purchaseCount: 4 },
      ],
      walmartFulfillment: 'pickup',
      walmartStoreId: '',
      updatedAt: '2026-11-25T10:00:00Z',
    };

    const merged = mergeLocalAndCloudState(local, cloud);

    // Keeps all 3 unique recipes, picking newer version of r1
    expect(merged.recipes).toHaveLength(3);
    expect(merged.recipes.find((r) => r.id === 'r1')?.title).toBe('Orzo Updated');
    expect(merged.recipes.some((r) => r.id === 'r-local')).toBe(true);
    expect(merged.recipes.some((r) => r.id === 'r-cloud')).toBe(true);

    // Combines Walmart purchase history without losing either side
    expect(merged.walmartHistory).toHaveLength(2);
    expect(merged.walmartHistory.find((i) => i.walmartItemId === '10291641')?.purchaseCount).toBe(5);

    // Combines linked IDs and preserves non-empty store ID
    expect(merged.walmartItemIds['gro-milk-cup']).toBe('10450114');
    expect(merged.walmartItemIds['gro-butter-tbsp']).toBe('17777211');
    expect(merged.walmartStoreId).toBe('5435');
  });
});
