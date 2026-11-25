import { describe, expect, it } from 'vitest';
import {
  cleanIngredientForMatching,
  matchFromPurchaseHistory,
  mergePurchaseHistory,
  parseWalmartOrdersCsv,
  parseWalmartOrdersHtml,
  parseWalmartOrdersJson,
  parseWalmartOrdersText,
  WALMART_BOOKMARKLET_HREF,
  type WalmartPurchaseItem,
} from '../walmartOrderHistory';

describe('walmartOrderHistory', () => {
  it('cleans noisy parenthetical package sizes from recipe ingredient names', () => {
    expect(cleanIngredientForMatching('(1 1/4 ounce) package dried italian salad dressing mix')).toBe(
      'dried italian salad dressing mix',
    );
    expect(cleanIngredientForMatching('1 (15 oz) can chickpeas, drained')).toBe('chickpeas');
  });

  it('parses a saved Walmart HTML order page via __NEXT_DATA__ and /ip/ links', () => {
    const html = `
      <html>
        <body>
          <script id="__NEXT_DATA__" type="application/json">
            {
              "props": {
                "pageProps": {
                  "orders": [
                    {
                      "items": [
                        { "usItemId": "10291641", "name": "Good Seasons Italian Salad Dressing & Recipe Mix, 0.7 oz" },
                        { "usItemId": "10450114", "name": "Horizon Organic Whole Milk, 64 fl oz" }
                      ]
                    }
                  ]
                }
              }
            }
          </script>
          <a href="https://www.walmart.com/ip/Kerrygold-Pure-Irish-Unsalted-Butter-8-oz/17777211">
            Kerrygold Pure Irish Unsalted Butter, 8 oz
          </a>
        </body>
      </html>
    `;

    const items = parseWalmartOrdersHtml(html);
    expect(items).toHaveLength(3);
    expect(items.find((i) => i.walmartItemId === '10291641')?.productName).toContain(
      'Italian Salad Dressing',
    );
    expect(items.find((i) => i.walmartItemId === '17777211')?.productName).toContain('Kerrygold');
  });

  it('parses CSV and JSON Walmart order exports', () => {
    const csv = [
      'Order Date,Product Name,Item ID,Quantity',
      '2026-10-12,"Good Seasons Italian Salad Dressing Mix, 0.7 oz",10291641,2',
      '2026-11-01,"Kerrygold Unsalted Butter, 8 oz",https://www.walmart.com/ip/Kerrygold/17777211,1',
    ].join('\n');

    const csvItems = parseWalmartOrdersCsv(csv);
    expect(csvItems).toHaveLength(2);
    expect(csvItems[0].walmartItemId).toBe('10291641');
    expect(csvItems[0].purchaseCount).toBe(2);
    expect(csvItems[1].walmartItemId).toBe('17777211');

    const json = JSON.stringify([
      { walmartItemId: '10291641', productName: 'Good Seasons Italian Salad Dressing Mix', purchaseCount: 3 },
    ]);
    const jsonItems = parseWalmartOrdersJson(json);
    expect(jsonItems).toHaveLength(1);
    expect(jsonItems[0].purchaseCount).toBe(3);
  });

  it('parses pasted Walmart product URLs from receipts', () => {
    const pasted = `
      https://www.walmart.com/ip/Good-Seasons-Italian-Salad-Dressing-Mix/10291641
      https://www.walmart.com/ip/Kerrygold-Unsalted-Butter/17777211
    `;
    const items = parseWalmartOrdersText(pasted);
    expect(items).toHaveLength(2);
    expect(items[0].productName.toLowerCase()).toContain('italian salad dressing');
  });

  it('merges duplicate purchases and ranks frequently bought personal items highest', () => {
    const first: WalmartPurchaseItem[] = [
      { walmartItemId: '10450114', productName: 'Great Value Whole Milk', purchaseCount: 1 },
      { walmartItemId: '99900011', productName: 'Horizon Organic Whole Milk', purchaseCount: 5 },
    ];
    const second: WalmartPurchaseItem[] = [
      { walmartItemId: '10291641', productName: 'Good Seasons Italian Salad Dressing Mix, 0.7 oz', purchaseCount: 2 },
      { walmartItemId: '99900011', productName: 'Horizon Organic Whole Milk', purchaseCount: 2 },
    ];

    const merged = mergePurchaseHistory(first, second);
    expect(merged.find((i) => i.walmartItemId === '99900011')?.purchaseCount).toBe(7);

    // Prefers the milk bought 7 times over the one bought once
    const bestMilk = matchFromPurchaseHistory('whole milk', merged);
    expect(bestMilk?.walmartItemId).toBe('99900011');

    // Matches the specialty salad dressing packet even with noisy recipe text
    const dressing = matchFromPurchaseHistory(
      '(1 1/4 ounce) package dried italian salad dressing mix',
      merged,
    );
    expect(dressing?.walmartItemId).toBe('10291641');
  });

  it('exposes a valid javascript: bookmarklet for walmart.com/orders', () => {
    expect(WALMART_BOOKMARKLET_HREF.startsWith('javascript:')).toBe(true);
    expect(WALMART_BOOKMARKLET_HREF).toContain('walmart-past-orders.json');
  });
});
