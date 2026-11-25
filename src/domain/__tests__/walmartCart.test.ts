import { describe, expect, it } from 'vitest';
import type { GroceryItem } from '../../types/recipe';
import {
  buildWalmartCartBatches,
  buildWalmartCartUrl,
  buildWalmartSearchUrl,
  extractWalmartItemId,
  matchWalmartProducts,
  WALMART_BATCH_LIMIT,
} from '../walmartCart';

describe('walmartCart', () => {
  const items: GroceryItem[] = [
    {
      id: 'g1',
      name: 'whole milk',
      quantity: 2,
      unit: 'cup',
      aisle: 'Dairy & Eggs',
      checked: false,
      sources: ['Oats'],
    },
    {
      id: 'g2',
      name: 'garlic',
      quantity: 4,
      unit: 'clove',
      aisle: 'Produce',
      checked: false,
      sources: ['Orzo'],
    },
    {
      id: 'g3',
      name: 'kosher salt',
      quantity: 1,
      unit: 'tsp',
      aisle: 'Pantry',
      checked: true, // already have it!
      sources: ['Orzo'],
    },
  ];

  it('matches unchecked grocery items to Walmart products and excludes checked items', () => {
    const matched = matchWalmartProducts(items);
    expect(matched).toHaveLength(2);
    expect(matched[0].walmartItemId).toBeTruthy();
    expect(matched[0].packageQuantity).toBeGreaterThanOrEqual(1);
  });

  it('builds a valid Walmart Pickup addToCart URL by default', () => {
    const matched = matchWalmartProducts(items);
    const url = buildWalmartCartUrl(matched);
    expect(url).toMatch(/^https:\/\/www\.walmart\.com\/sc\/cart\/addToCart\?items=/);
    expect(url).toContain('fulfillmentIntent=PICKUP');
  });

  it('chunks large grocery lists into batches of at most 10 items so Walmart does not drop items', () => {
    const manyNames = [
      'whole milk', 'unsalted butter', 'eggs', 'garlic', 'yellow onion',
      'carrots', 'celery', 'olive oil', 'kosher salt', 'black pepper',
      'chicken breast', 'cherry tomatoes', 'baby spinach', 'lemons', 'orzo',
      'jasmine rice', 'chickpeas', 'coconut milk', 'sourdough bread', 'parmesan',
      'ricotta', 'avocado', 'strawberries', 'blueberries', 'honey',
    ];
    const largeList: GroceryItem[] = manyNames.map((name, idx) => ({
      id: `item-${idx}`,
      name,
      quantity: 1,
      unit: '',
      aisle: 'Pantry',
      checked: false,
      sources: ['Week'],
    }));

    const matched = matchWalmartProducts(largeList);
    const mapped = matched.filter((m) => Boolean(m.walmartItemId));
    expect(mapped.length).toBeGreaterThanOrEqual(22);

    const batches = buildWalmartCartBatches(matched, { fulfillment: 'pickup' });
    expect(WALMART_BATCH_LIMIT).toBe(10);
    expect(batches.length).toBe(Math.ceil(mapped.length / 10));
    for (const batch of batches) {
      expect(batch.lines.length).toBeLessThanOrEqual(10);
      expect(batch.url).toContain('fulfillmentIntent=PICKUP');
    }
    const totalBatched = batches.reduce((acc, b) => acc + b.lines.length, 0);
    expect(totalBatched).toBe(mapped.length);
  });

  it('includes Pickup fulfillment facet on Walmart search URLs by default', () => {
    const pickupUrl = buildWalmartSearchUrl('heirloom cherry tomatoes');
    expect(pickupUrl).toContain('https://www.walmart.com/search?q=heirloom%20cherry%20tomatoes');
    expect(pickupUrl).toContain('facet=fulfillment_method%3APickup');

    const deliveryUrl = buildWalmartSearchUrl('heirloom cherry tomatoes', 'delivery');
    expect(deliveryUrl).toContain('facet=fulfillment_method%3ADelivery');
  });

  it('prioritizes personal Walmart order history over the default catalog and matches specialty items', () => {
    const personalHistory = [
      {
        walmartItemId: '99900011',
        productName: 'Horizon Organic Whole Milk, 64 fl oz',
        purchaseCount: 6,
      },
      {
        walmartItemId: '10291641',
        productName: 'Good Seasons Italian Salad Dressing & Recipe Mix, 0.7 oz',
        purchaseCount: 3,
      },
    ];

    const list: GroceryItem[] = [
      ...items.slice(0, 1),
      {
        id: 'g-dressing',
        name: '(1 1/4 ounce) package dried italian salad dressing mix',
        quantity: 1,
        unit: '',
        aisle: 'Pantry',
        checked: false,
        sources: ['Roast'],
      },
    ];

    const matched = matchWalmartProducts(list, 'pickup', personalHistory);
    expect(matched[0].walmartItemId).toBe('99900011');
    expect(matched[0].matchSource).toBe('history');
    expect(matched[1].walmartItemId).toBe('10291641');
    expect(matched[1].matchSource).toBe('history');
  });

  it('extracts a Walmart item ID from a product URL or raw ID string', () => {
    expect(extractWalmartItemId('https://www.walmart.com/ip/Great-Value-Whole-Milk/10450114')).toBe('10450114');
    expect(extractWalmartItemId('10450114')).toBe('10450114');
    expect(extractWalmartItemId('invalid')).toBeNull();
  });
});
