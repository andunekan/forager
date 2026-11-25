import * as XLSX from 'xlsx';

export interface WalmartPurchaseItem {
  walmartItemId: string;
  productName: string;
  packageLabel?: string;
  purchaseCount: number;
  lastPurchasedAt?: string;
}

const MATCH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'of',
  'for',
  'with',
  'in',
  'to',
  'or',
  'by',
  'each',
  'oz',
  'fl',
  'lb',
  'lbs',
  'ct',
  'count',
  'pack',
  'pkg',
  'package',
  'packages',
  'can',
  'cans',
  'jar',
  'jars',
  'bag',
  'bags',
  'box',
  'boxes',
  'bottle',
  'bottles',
  'pouch',
  'packet',
  'envelope',
  'ounce',
  'ounces',
  'pound',
  'pounds',
  'cup',
  'cups',
  'tbsp',
  'tsp',
  'fresh',
  'dried',
  'organic',
  'great',
  'value',
  'marketside',
  'original',
  'classic',
  'pure',
  'all',
  'natural',
  'real',
  'finely',
  'roughly',
  'thinly',
  'chopped',
  'minced',
  'diced',
  'sliced',
  'grated',
  'shredded',
  'drained',
  'rinsed',
  'softened',
  'melted',
  'mix',
]);

function normalizeToken(word: string): string {
  const lower = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!lower) return '';
  if (lower.length > 4 && lower.endsWith('ies')) {
    return `${lower.slice(0, -3)}y`;
  }
  if (lower.length > 4 && lower.endsWith('es') && /(s|x|z|ch|sh|o)es$/.test(lower)) {
    return lower.slice(0, -2);
  }
  if (lower.length > 3 && lower.endsWith('s') && !lower.endsWith('ss')) {
    return lower.slice(0, -1);
  }
  return lower;
}

export function cleanIngredientForMatching(raw: string): string {
  let cleaned = raw.trim().toLowerCase();
  // Remove parenthetical packaging/weights like "(1 1/4 ounce)" or "(15 oz)"
  cleaned = cleaned.replace(/\([^)]*\)/g, ' ');
  // Remove preparation suffix after comma (", drained", ", chopped")
  cleaned = cleaned.replace(/,.*$/, '');
  // Remove leading numbers/fractions and packaging words ("1 package", "2 cans")
  cleaned = cleaned.replace(
    /^\s*(?:\d+(?:\s+\d+\/\d+|\.\d+|\/\d+)?\s*)?(?:package|packages|pkg|can|cans|jar|jars|bag|bags|box|boxes|bottle|bottles|pouch|packet|envelope|bunch|bunches|head|heads|clove|cloves|slice|slices|sprig|sprigs|cup|cups|tbsp|tsp|oz|ounce|ounces|lb|lbs)\b\s*(?:of\s+)?/i,
    '',
  );
  // Strip any leftover leading bare number
  cleaned = cleaned.replace(/^\s*\d+(?:\.\d+|\/\d+)?\s+/, '');
  return cleaned.replace(/\s+/g, ' ').trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(normalizeToken)
    .filter((t) => t.length > 1 && !MATCH_STOP_WORDS.has(t) && !/^\d+$/.test(t));
}

function extractItemId(input: unknown): string | null {
  if (typeof input === 'number' && Number.isInteger(input)) {
    const str = String(input);
    return /^\d{5,14}$/.test(str) ? str : null;
  }
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^\d{5,14}$/.test(trimmed)) return trimmed;
  const urlMatch = trimmed.match(/\/ip\/(?:[^/?#]+\/)?(\d{5,14})(?:[/?#]|$)/i);
  if (urlMatch) return urlMatch[1];
  const paramMatch = trimmed.match(/[?&]itemId=(\d{5,14})/i);
  if (paramMatch) return paramMatch[1];
  return null;
}

function slugToProductName(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPackageFromName(name: string): string | undefined {
  const match = name.match(
    /\b(\d+(?:\.\d+)?\s*(?:fl\s*oz|oz|lb|lbs|gal|ct|count|pack|pk|qt|pt|ml|l|g|kg))\b/i,
  );
  return match ? match[1] : undefined;
}

export function mergePurchaseHistory(
  existing: WalmartPurchaseItem[],
  incoming: WalmartPurchaseItem[],
): WalmartPurchaseItem[] {
  const map = new Map<string, WalmartPurchaseItem>();

  for (const item of existing) {
    if (!item.walmartItemId) continue;
    map.set(item.walmartItemId, { ...item });
  }

  for (const item of incoming) {
    if (!item.walmartItemId) continue;
    const prev = map.get(item.walmartItemId);
    const cleanName = item.productName.trim();
    if (!prev) {
      map.set(item.walmartItemId, {
        walmartItemId: item.walmartItemId,
        productName: cleanName || `Walmart item #${item.walmartItemId}`,
        packageLabel: item.packageLabel ?? extractPackageFromName(cleanName),
        purchaseCount: Math.max(1, item.purchaseCount || 1),
        lastPurchasedAt: item.lastPurchasedAt,
      });
    } else {
      const bestName =
        cleanName.length > prev.productName.length ? cleanName : prev.productName;
      map.set(item.walmartItemId, {
        walmartItemId: prev.walmartItemId,
        productName: bestName,
        packageLabel: prev.packageLabel ?? item.packageLabel ?? extractPackageFromName(bestName),
        purchaseCount: prev.purchaseCount + Math.max(1, item.purchaseCount || 1),
        lastPurchasedAt: item.lastPurchasedAt || prev.lastPurchasedAt,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.purchaseCount !== a.purchaseCount) return b.purchaseCount - a.purchaseCount;
    return a.productName.localeCompare(b.productName);
  });
}

function collectFromJsonNode(node: unknown, out: WalmartPurchaseItem[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) collectFromJsonNode(child, out);
    return;
  }
  if (typeof node !== 'object') return;

  const obj = node as Record<string, unknown>;
  const idCandidate =
    obj.walmartItemId ??
    obj.usItemId ??
    obj.itemId ??
    obj.catalogItemId ??
    obj.productId ??
    obj.canonicalUrl ??
    obj.url;
  const itemId = extractItemId(idCandidate);

  const rawName =
    (typeof obj.productName === 'string' && obj.productName) ||
    (typeof obj.name === 'string' && obj.name) ||
    (typeof obj.title === 'string' && obj.title) ||
    (typeof obj.description === 'string' && obj.description) ||
    (obj.productInfo &&
    typeof obj.productInfo === 'object' &&
    typeof (obj.productInfo as Record<string, unknown>).name === 'string'
      ? ((obj.productInfo as Record<string, unknown>).name as string)
      : '');

  if (itemId && rawName && rawName.trim().length >= 3) {
    const qtyRaw = obj.purchaseCount ?? obj.quantity ?? obj.qty ?? 1;
    const qty = Math.max(1, parseInt(String(qtyRaw), 10) || 1);
    const dateVal =
      (typeof obj.lastPurchasedAt === 'string' && obj.lastPurchasedAt) ||
      (typeof obj.orderDate === 'string' && obj.orderDate) ||
      undefined;

    out.push({
      walmartItemId: itemId,
      productName: rawName.trim(),
      packageLabel:
        typeof obj.packageLabel === 'string'
          ? obj.packageLabel
          : extractPackageFromName(rawName),
      purchaseCount: qty,
      lastPurchasedAt: dateVal,
    });
  }

  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      collectFromJsonNode(val, out);
    }
  }
}

export function parseWalmartOrdersJson(jsonText: string): WalmartPurchaseItem[] {
  try {
    const data = JSON.parse(jsonText);
    const collected: WalmartPurchaseItem[] = [];
    collectFromJsonNode(data, collected);
    return mergePurchaseHistory([], collected);
  } catch {
    return [];
  }
}

export function parseWalmartOrdersHtml(html: string): WalmartPurchaseItem[] {
  const collected: WalmartPurchaseItem[] = [];

  // 1. Extract from Walmart's Next.js embedded state (__NEXT_DATA__)
  const nextDataRegex = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = nextDataRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(scriptMatch[1].trim());
      collectFromJsonNode(json, collected);
    } catch {
      // Ignore invalid JSON script blocks
    }
  }

  // 2. Extract from standard /ip/<slug>/<id> product anchor links
  const anchorRegex =
    /<a\b[^>]*href=["']([^"']*\/ip\/([^"'/?#]+)\/(\d{5,14})[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let anchorMatch: RegExpExecArray | null;
  while ((anchorMatch = anchorRegex.exec(html)) !== null) {
    const slug = anchorMatch[2];
    const itemId = anchorMatch[3];
    const innerText = anchorMatch[4]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    const productName = innerText.length >= 4 ? innerText : slugToProductName(slug);
    if (productName) {
      collected.push({
        walmartItemId: itemId,
        productName,
        packageLabel: extractPackageFromName(productName),
        purchaseCount: 1,
      });
    }
  }

  return mergePurchaseHistory([], collected);
}

function parseCsvMatrix(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

function rowsToPurchaseItems(rows: string[][]): WalmartPurchaseItem[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.toLowerCase().trim());

  const findCol = (aliases: string[]) =>
    headers.findIndex((h) => aliases.some((a) => h.includes(a)));

  const nameCol = findCol(['product', 'item name', 'title', 'name', 'description']);
  const idCol = findCol(['item id', 'itemid', 'usitemid', 'product id', 'sku', 'url', 'link', 'id']);
  const qtyCol = findCol(['qty', 'quantity', 'count']);
  const dateCol = findCol(['date', 'purchased']);

  const collected: WalmartPurchaseItem[] = [];

  for (const row of rows.slice(1)) {
    const rawId = idCol >= 0 ? row[idCol] : '';
    let itemId = extractItemId(rawId);

    // Fallback: scan any cell in the row for a Walmart /ip/ URL or numeric ID
    if (!itemId) {
      for (const cell of row) {
        const found = extractItemId(cell);
        if (found) {
          itemId = found;
          break;
        }
      }
    }
    if (!itemId) continue;

    const productName =
      (nameCol >= 0 ? row[nameCol] : '')?.trim() ||
      row.find((cell) => cell.length > 4 && !extractItemId(cell) && !/^\d{4}-\d{2}-\d{2}/.test(cell)) ||
      `Walmart item #${itemId}`;

    const qty = qtyCol >= 0 ? Math.max(1, parseInt(row[qtyCol], 10) || 1) : 1;
    const lastPurchasedAt = dateCol >= 0 ? row[dateCol]?.trim() || undefined : undefined;

    collected.push({
      walmartItemId: itemId,
      productName,
      packageLabel: extractPackageFromName(productName),
      purchaseCount: qty,
      lastPurchasedAt,
    });
  }

  return mergePurchaseHistory([], collected);
}

export function parseWalmartOrdersCsv(csvText: string): WalmartPurchaseItem[] {
  return rowsToPurchaseItems(parseCsvMatrix(csvText));
}

export function parseWalmartOrdersSpreadsheet(buffer: ArrayBuffer): WalmartPurchaseItem[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
  });
  const matrix = rawRows.map((r) =>
    (Array.isArray(r) ? r : []).map((cell) => String(cell ?? '').trim()),
  );
  return rowsToPurchaseItems(matrix);
}

export function parseWalmartOrdersText(rawText: string): WalmartPurchaseItem[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const fromJson = parseWalmartOrdersJson(trimmed);
    if (fromJson.length > 0) return fromJson;
  }

  if (/<a\b|<script\b|<html\b/i.test(trimmed)) {
    const fromHtml = parseWalmartOrdersHtml(trimmed);
    if (fromHtml.length > 0) return fromHtml;
  }

  const collected: WalmartPurchaseItem[] = [];
  const urlRegex = /https?:\/\/(?:www\.)?walmart\.com\/ip\/([^/\s?#"']+)\/(\d{5,14})/gi;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(trimmed)) !== null) {
    const productName = slugToProductName(match[1]);
    collected.push({
      walmartItemId: match[2],
      productName,
      packageLabel: extractPackageFromName(productName),
      purchaseCount: 1,
    });
  }

  if (collected.length > 0) {
    return mergePurchaseHistory([], collected);
  }

  return parseWalmartOrdersCsv(trimmed);
}

export function matchFromPurchaseHistory(
  ingredientName: string,
  history: WalmartPurchaseItem[],
): WalmartPurchaseItem | null {
  if (history.length === 0) return null;

  const cleanedQuery = cleanIngredientForMatching(ingredientName);
  const queryTokens = tokenize(cleanedQuery);
  if (queryTokens.length === 0) return null;

  let bestItem: WalmartPurchaseItem | null = null;
  let bestScore = 0;

  for (const item of history) {
    const prodLower = item.productName.toLowerCase();
    const prodTokens = tokenize(item.productName);
    if (prodTokens.length === 0) continue;

    const prodTokenSet = new Set(prodTokens);
    let matchedCount = 0;
    for (const qt of queryTokens) {
      if (prodTokenSet.has(qt) || prodTokens.some((pt) => pt.includes(qt) || qt.includes(pt))) {
        matchedCount += 1;
      }
    }

    if (matchedCount === 0) continue;

    const recall = matchedCount / queryTokens.length;
    const precision = matchedCount / prodTokens.length;
    const exactPhraseBonus = cleanedQuery.length >= 4 && prodLower.includes(cleanedQuery) ? 0.35 : 0;

    // Require strong recall so generic 1-word partial overlaps don't falsely match unrelated products
    const minRecall = queryTokens.length === 1 ? 1.0 : queryTokens.length === 2 ? 0.75 : 0.6;
    if (recall < minRecall && exactPhraseBonus === 0) continue;

    const frequencyBonus = Math.min(0.18, Math.log2(item.purchaseCount + 1) * 0.05);
    const score = recall * 0.72 + precision * 0.2 + exactPhraseBonus + frequencyBonus;

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return bestScore >= 0.58 ? bestItem : null;
}

export const SAMPLE_WALMART_ORDERS_CSV = [
  'Order Date,Product Name,Item ID,Quantity',
  '2026-11-12,"Good Seasons Italian Salad Dressing & Recipe Mix, 0.7 oz",10291641,3',
  '2026-11-12,"Kerrygold Pure Irish Unsalted Butter, 8 oz",17777211,4',
  '2026-11-05,"Horizon Organic Whole Vitamin D Milk, 64 fl oz",10450114,5',
  '2026-11-05,"Raos Homemade Marinara Sauce, 24 oz",31008715,2',
  '2026-10-28,"Marketside Sliced Sourdough Loaf, 24 oz",46652451,3',
].join('\n');

// Clean, user-run snippet for walmart.com/orders or walmart.com/my-items
export const WALMART_BOOKMARKLET_CODE = `(()=>{const m=new Map();const add=(id,n)=>{if(!id||!n)return;const s=String(id).trim(),t=String(n).replace(/\\s+/g,' ').trim();if(!/^\\d{5,14}$/.test(s)||t.length<3)return;const p=m.get(s);m.set(s,{walmartItemId:s,productName:p&&p.productName.length>t.length?p.productName:t,purchaseCount:(p?p.purchaseCount:0)+1})};const walk=o=>{if(!o||typeof o!=='object')return;if(Array.isArray(o)){o.forEach(walk);return}const id=o.usItemId||o.itemId||o.productId;const n=o.name||o.productName||(o.productInfo&&o.productInfo.name);if(id&&typeof n==='string')add(id,n);Object.values(o).forEach(walk)};const nd=document.getElementById('__NEXT_DATA__');if(nd){try{walk(JSON.parse(nd.textContent||''))}catch{}}document.querySelectorAll('a[href*="/ip/"]').forEach(a=>{const h=a.getAttribute('href')||'';const x=h.match(/\\/ip\\/([^/?#]+)\\/(\\d{5,14})/);if(x){const t=(a.textContent||'').trim()||x[1].replace(/-/g,' ');add(x[2],t)}});const out=[...m.values()];if(!out.length){alert('No Walmart items found on this page. Open walmart.com/orders or walmart.com/my-items first.');return}const b=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});const u=URL.createObjectURL(b);const l=document.createElement('a');l.href=u;l.download='walmart-past-orders.json';l.click();URL.revokeObjectURL(u);alert('Exported '+out.length+' Walmart items to walmart-past-orders.json — drop it into Forager!')})();`;

export const WALMART_BOOKMARKLET_HREF = `javascript:${WALMART_BOOKMARKLET_CODE}`;
