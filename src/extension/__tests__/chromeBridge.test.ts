import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  importRecipeFromActiveTab,
  isChromeExtension,
  openWalmartCartBatchesInChrome,
  syncWalmartOrdersFromActiveTab,
} from '../chromeBridge';

type MockChrome = {
  runtime?: { id?: string };
  tabs?: {
    query: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  scripting?: {
    executeScript: ReturnType<typeof vi.fn>;
  };
};

const g = globalThis as unknown as { chrome?: MockChrome };

describe('chromeBridge', () => {
  afterEach(() => {
    delete g.chrome;
  });

  it('detects web vs Chrome extension environment', () => {
    expect(isChromeExtension()).toBe(false);

    g.chrome = {
      runtime: { id: 'forager-ext-id' },
      tabs: { query: vi.fn(), create: vi.fn() },
      scripting: { executeScript: vi.fn() },
    };
    expect(isChromeExtension()).toBe(true);
  });

  it('imports a structured recipe directly from the active browser tab', async () => {
    const sampleHtml = `
      <html><head>
        <script type="application/ld+json">
          {
            "@type": "Recipe",
            "name": "Brown Butter Sage Gnocchi",
            "recipeYield": "4",
            "totalTime": "PT20M",
            "recipeIngredient": ["1 lb potato gnocchi", "3 tbsp unsalted butter", "10 fresh sage leaves"],
            "recipeInstructions": ["Pan-fry gnocchi in browned butter with crisp sage."]
          }
        </script>
      </head><body></body></html>
    `;

    g.chrome = {
      runtime: { id: 'forager-ext-id' },
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 42, url: 'https://cooking.example.com/gnocchi' }]),
        create: vi.fn(),
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([
          { result: { html: sampleHtml, url: 'https://cooking.example.com/gnocchi' } },
        ]),
      },
    };

    const result = await importRecipeFromActiveTab();
    expect(result.error).toBeUndefined();
    expect(result.recipe?.title).toBe('Brown Butter Sage Gnocchi');
    expect(result.recipe?.ingredients).toHaveLength(3);
    expect(result.recipe?.sourceUrl).toBe('https://cooking.example.com/gnocchi');
  });

  it('syncs past Walmart orders directly from an active walmart.com tab', async () => {
    const walmartHtml = `
      <html><body>
        <a href="/ip/Good-Seasons-Italian-Salad-Dressing-Mix/10291641">
          Good Seasons Italian Salad Dressing Mix, 0.7 oz
        </a>
        <a href="/ip/Kerrygold-Unsalted-Butter/17777211">
          Kerrygold Pure Irish Unsalted Butter, 8 oz
        </a>
      </body></html>
    `;

    g.chrome = {
      runtime: { id: 'forager-ext-id' },
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 9, url: 'https://www.walmart.com/orders' }]),
        create: vi.fn(),
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([{ result: { html: walmartHtml } }]),
      },
    };

    const result = await syncWalmartOrdersFromActiveTab();
    expect(result.error).toBeUndefined();
    expect(result.items).toHaveLength(2);
    expect(result.items[0].walmartItemId).toBeTruthy();
  });

  it('guides the user cleanly if Sync Walmart Orders is clicked on a non-Walmart tab', async () => {
    g.chrome = {
      runtime: { id: 'forager-ext-id' },
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 7, url: 'https://example.com/blog' }]),
        create: vi.fn(),
      },
      scripting: { executeScript: vi.fn() },
    };

    const result = await syncWalmartOrdersFromActiveTab();
    expect(result.items).toHaveLength(0);
    expect(result.error).toMatch(/walmart\.com/i);
  });

  it('opens multiple Walmart cart batch URLs in Chrome tabs without popup blocking', async () => {
    const createMock = vi.fn().mockResolvedValue({ id: 1 });
    g.chrome = {
      runtime: { id: 'forager-ext-id' },
      tabs: { query: vi.fn(), create: createMock },
      scripting: { executeScript: vi.fn() },
    };

    const urls = [
      'https://www.walmart.com/sc/cart/addToCart?items=1,2&fulfillmentIntent=PICKUP',
      'https://www.walmart.com/sc/cart/addToCart?items=3,4&fulfillmentIntent=PICKUP',
    ];
    await openWalmartCartBatchesInChrome(urls, 0);

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock).toHaveBeenNthCalledWith(1, { url: urls[0], active: false });
    expect(createMock).toHaveBeenNthCalledWith(2, { url: urls[1], active: true });
  });
});
