import { describe, expect, it } from 'vitest';
import {
  formatIngredient,
  formatQuantity,
  parseIngredient,
  scaleIngredient,
} from '../ingredientParser';

describe('ingredientParser', () => {
  it('parses simple quantity, unit, and ingredient name', () => {
    const result = parseIngredient('2 cups whole milk');
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe('cup');
    expect(result.name).toBe('whole milk');
  });

  it('parses mixed fractions and unicode fractions', () => {
    const mixed = parseIngredient('1 1/2 tbsp unsalted butter, softened');
    expect(mixed.quantity).toBe(1.5);
    expect(mixed.unit).toBe('tbsp');
    expect(mixed.name).toBe('unsalted butter');
    expect(mixed.preparation).toBe('softened');

    const unicode = parseIngredient('¾ tsp kosher salt');
    expect(unicode.quantity).toBe(0.75);
    expect(unicode.unit).toBe('tsp');
    expect(unicode.name).toBe('kosher salt');
  });

  it('handles countable items without explicit units', () => {
    const result = parseIngredient('3 cloves garlic, minced');
    expect(result.quantity).toBe(3);
    expect(result.unit).toBe('clove');
    expect(result.name).toBe('garlic');
    expect(result.preparation).toBe('minced');

    const lemon = parseIngredient('2 lemons, zested');
    expect(lemon.quantity).toBe(2);
    expect(lemon.unit).toBe('');
    expect(lemon.name).toBe('lemons');
    expect(lemon.preparation).toBe('zested');
  });

  it('handles quantity-less ingredients gracefully', () => {
    const result = parseIngredient('Flaky sea salt to taste');
    expect(result.quantity).toBeNull();
    expect(result.unit).toBe('');
    expect(result.name).toBe('Flaky sea salt to taste');
  });

  it('scales ingredient quantities accurately', () => {
    const ing = parseIngredient('1 1/2 cups orzo');
    const scaled = scaleIngredient(ing, 2);
    expect(scaled.quantity).toBe(3);
    expect(formatIngredient(scaled)).toBe('3 cups orzo');
  });

  it('formats quantities as clean culinary fractions', () => {
    expect(formatQuantity(0.5)).toBe('½');
    expect(formatQuantity(1.25)).toBe('1¼');
    expect(formatQuantity(0.333)).toBe('⅓');
    expect(formatQuantity(2)).toBe('2');
  });
});
