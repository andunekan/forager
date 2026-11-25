import type { Ingredient } from '../types/recipe';

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2',
  '⅓': '1/3',
  '⅔': '2/3',
  '¼': '1/4',
  '¾': '3/4',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};

const UNIT_ALIASES: Record<string, string> = {
  cup: 'cup',
  cups: 'cup',
  c: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbs: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  clove: 'clove',
  cloves: 'clove',
  can: 'can',
  cans: 'can',
  slice: 'slice',
  slices: 'slice',
  bunch: 'bunch',
  bunches: 'bunch',
  sprig: 'sprig',
  sprigs: 'sprig',
  head: 'head',
  heads: 'head',
  pinch: 'pinch',
  pinches: 'pinch',
  stalk: 'stalk',
  stalks: 'stalk',
  package: 'package',
  packages: 'package',
  pkg: 'package',
  bag: 'bag',
  bags: 'bag',
  fillet: 'fillet',
  fillets: 'fillet',
};

const PLURAL_UNITS: Record<string, string> = {
  cup: 'cups',
  clove: 'cloves',
  can: 'cans',
  slice: 'slices',
  bunch: 'bunches',
  sprig: 'sprigs',
  head: 'heads',
  pinch: 'pinches',
  stalk: 'stalks',
  package: 'packages',
  bag: 'bags',
  fillet: 'fillets',
  lb: 'lbs',
};

let counter = 0;

export function createId(prefix = 'id'): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

function normalizeFractions(input: string): string {
  let out = input.trim();
  for (const [glyph, ascii] of Object.entries(UNICODE_FRACTIONS)) {
    out = out.replace(new RegExp(`(\\d)\\s*${glyph}`, 'g'), `$1 ${ascii}`);
    out = out.replace(new RegExp(glyph, 'g'), ascii);
  }
  return out;
}

function parseNumberToken(token: string): number | null {
  const cleaned = token.trim();
  if (!cleaned) return null;

  // Handle ranges like 2-3 -> use average or upper? Use average so grocery list is realistic
  const rangeMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
  }

  // Handle mixed number "1 1/2"
  const mixedMatch = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    return den > 0 ? whole + num / den : whole;
  }

  // Handle simple fraction "3/4"
  const fracMatch = cleaned.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    return den > 0 ? num / den : null;
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function parseIngredient(rawInput: string, id?: string): Ingredient {
  const raw = rawInput.trim().replace(/^[•\-*]\s*/, '');
  const normalized = normalizeFractions(raw);

  // Match leading quantity: mixed number, fraction, range, or decimal
  const qtyRegex = /^((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?)|(?:\d+(?:\.\d+)?))\s+(.*)$/;
  const qtyMatch = normalized.match(qtyRegex);

  let quantity: number | null = null;
  let rest = normalized;

  if (qtyMatch) {
    quantity = parseNumberToken(qtyMatch[1]);
    rest = qtyMatch[2].trim();
  }

  // Split optional preparation after comma
  let preparation: string | undefined;
  const commaIdx = rest.indexOf(',');
  if (commaIdx > 0) {
    preparation = rest.slice(commaIdx + 1).trim() || undefined;
    rest = rest.slice(0, commaIdx).trim();
  }

  // Check if first word is a known unit
  let unit = '';
  const words = rest.split(/\s+/);
  if (words.length > 1) {
    const candidate = words[0].toLowerCase().replace(/\.$/, '');
    if (UNIT_ALIASES[candidate]) {
      unit = UNIT_ALIASES[candidate];
      rest = words.slice(1).join(' ');
      // Strip leading "of " (e.g. "2 cups of milk")
      rest = rest.replace(/^of\s+/i, '');
    }
  }

  return {
    id: id ?? createId('ing'),
    quantity,
    unit,
    name: rest.trim() || raw,
    preparation,
    raw,
  };
}

export function scaleIngredient(ingredient: Ingredient, factor: number): Ingredient {
  if (ingredient.quantity === null || !Number.isFinite(factor) || factor <= 0) {
    return { ...ingredient };
  }
  const scaledQty = Math.round(ingredient.quantity * factor * 1000) / 1000;
  const updated: Ingredient = {
    ...ingredient,
    quantity: scaledQty,
  };
  return {
    ...updated,
    raw: formatIngredient(updated),
  };
}

const FRACTION_DISPLAY: Array<[number, string]> = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [3 / 8, '⅜'],
  [1 / 2, '½'],
  [5 / 8, '⅝'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [7 / 8, '⅞'],
];

export function formatQuantity(qty: number | null): string {
  if (qty === null || !Number.isFinite(qty)) return '';
  const whole = Math.floor(qty + 0.0001);
  const remainder = qty - whole;

  if (remainder < 0.04) {
    return whole > 0 ? String(whole) : '';
  }

  for (const [val, glyph] of FRACTION_DISPLAY) {
    if (Math.abs(remainder - val) < 0.045) {
      return whole > 0 ? `${whole}${glyph}` : glyph;
    }
  }

  if (remainder > 0.95) {
    return String(whole + 1);
  }

  const rounded = Math.round(qty * 10) / 10;
  return String(rounded);
}

export function formatUnit(unit: string, quantity: number | null): string {
  if (!unit) return '';
  if (quantity !== null && quantity > 1 && PLURAL_UNITS[unit]) {
    return PLURAL_UNITS[unit];
  }
  return unit;
}

export function formatIngredient(ingredient: Ingredient): string {
  const parts: string[] = [];
  if (ingredient.quantity !== null) {
    const qtyStr = formatQuantity(ingredient.quantity);
    if (qtyStr) parts.push(qtyStr);
  }
  if (ingredient.unit) {
    parts.push(formatUnit(ingredient.unit, ingredient.quantity));
  }
  parts.push(ingredient.name);
  const base = parts.join(' ').trim();
  return ingredient.preparation ? `${base}, ${ingredient.preparation}` : base;
}
