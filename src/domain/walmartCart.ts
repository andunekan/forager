import type { GroceryItem } from '../types/recipe';
import {
  cleanIngredientForMatching,
  matchFromPurchaseHistory,
  type WalmartPurchaseItem,
} from './walmartOrderHistory';

export type WalmartFulfillment = 'pickup' | 'delivery';
export type WalmartMatchSource = 'linked' | 'history' | 'catalog' | 'none';

export const WALMART_BATCH_LIMIT = 10;

export interface WalmartCatalogEntry {
  keywords: string[];
  walmartItemId: string;
  productName: string;
  packageLabel: string;
}

export interface WalmartCartLine {
  groceryId: string;
  groceryName: string;
  neededLabel: string;
  walmartItemId: string | null;
  productName: string;
  packageLabel: string;
  packageQuantity: number;
  searchUrl: string;
  productUrl: string | null;
  matchSource: WalmartMatchSource;
}

export interface WalmartCartOptions {
  fulfillment?: WalmartFulfillment;
  storeId?: string;
}

export interface WalmartCartBatch {
  index: number;
  totalBatches: number;
  lines: WalmartCartLine[];
  url: string;
}

// Comprehensive Walmart Grocery catalog of common household & recipe staples
const WALMART_CATALOG: WalmartCatalogEntry[] = [
  // Dairy & Eggs
  { keywords: ['whole milk', 'milk'], walmartItemId: '10450114', productName: 'Great Value Whole Vitamin D Milk', packageLabel: '1 gal' },
  { keywords: ['buttermilk'], walmartItemId: '10450134', productName: 'Great Value Cultured Buttermilk', packageLabel: '32 fl oz' },
  { keywords: ['oat milk'], walmartItemId: '886259827', productName: 'Oatly Original Oatmilk', packageLabel: '64 fl oz' },
  { keywords: ['almond milk'], walmartItemId: '16777281', productName: 'Almond Breeze Unsweetened Almondmilk', packageLabel: '64 fl oz' },
  { keywords: ['unsalted butter', 'salted butter', 'butter'], walmartItemId: '10315055', productName: 'Great Value Sweet Cream Unsalted Butter', packageLabel: '16 oz' },
  { keywords: ['heavy cream', 'whipping cream', 'cream'], walmartItemId: '10450339', productName: 'Great Value Heavy Whipping Cream', packageLabel: '16 fl oz' },
  { keywords: ['half and half', 'half-and-half'], walmartItemId: '10450335', productName: 'Great Value Half & Half', packageLabel: '32 fl oz' },
  { keywords: ['sour cream'], walmartItemId: '10452380', productName: 'Great Value Original Sour Cream', packageLabel: '16 oz' },
  { keywords: ['cream cheese'], walmartItemId: '10452354', productName: 'Philadelphia Original Cream Cheese', packageLabel: '8 oz' },
  { keywords: ['parmesan'], walmartItemId: '10315426', productName: 'BelGioioso Shaved Parmesan Cheese', packageLabel: '5 oz' },
  { keywords: ['ricotta'], walmartItemId: '10452383', productName: 'Galbani Whole Milk Ricotta Cheese', packageLabel: '15 oz' },
  { keywords: ['mozzarella', 'burrata'], walmartItemId: '10452375', productName: 'BelGioioso Fresh Mozzarella Cheese', packageLabel: '8 oz' },
  { keywords: ['cheddar'], walmartItemId: '10452467', productName: 'Great Value Sharp Cheddar Cheese', packageLabel: '8 oz' },
  { keywords: ['feta'], walmartItemId: '10452492', productName: 'Athenos Traditional Crumbled Feta', packageLabel: '6 oz' },
  { keywords: ['goat cheese'], walmartItemId: '44391278', productName: 'Marketside Original Goat Cheese Log', packageLabel: '4 oz' },
  { keywords: ['greek yogurt', 'yogurt'], walmartItemId: '19863421', productName: 'Chobani Plain Whole Milk Greek Yogurt', packageLabel: '32 oz' },
  { keywords: ['egg', 'eggs'], walmartItemId: '145051970', productName: 'Great Value Large White Eggs, 12 Count', packageLabel: '12 ct' },

  // Produce & Herbs
  { keywords: ['garlic'], walmartItemId: '44390949', productName: 'Fresh Garlic Bulb', packageLabel: '1 bulb' },
  { keywords: ['yellow onion', 'white onion', 'onion', 'onions'], walmartItemId: '44390993', productName: 'Fresh Yellow Onion', packageLabel: 'each' },
  { keywords: ['red onion'], walmartItemId: '44390994', productName: 'Fresh Red Onion', packageLabel: 'each' },
  { keywords: ['shallot', 'shallots'], walmartItemId: '44391005', productName: 'Fresh Shallots', packageLabel: 'each' },
  { keywords: ['green onion', 'scallion', 'scallions'], walmartItemId: '51259212', productName: 'Fresh Green Onions Bunch', packageLabel: '1 bunch' },
  { keywords: ['lemon', 'lemons'], walmartItemId: '44390948', productName: 'Fresh Lemons', packageLabel: 'each' },
  { keywords: ['lime', 'limes'], walmartItemId: '44390947', productName: 'Fresh Limes', packageLabel: 'each' },
  { keywords: ['orange', 'oranges'], walmartItemId: '44390954', productName: 'Fresh Navel Oranges', packageLabel: 'each' },
  { keywords: ['asparagus'], walmartItemId: '44391068', productName: 'Fresh Asparagus Bunch', packageLabel: '1 lb bunch' },
  { keywords: ['broccoli'], walmartItemId: '44391066', productName: 'Fresh Broccoli Crowns', packageLabel: '1 bunch' },
  { keywords: ['cauliflower'], walmartItemId: '44391067', productName: 'Fresh Cauliflower Head', packageLabel: '1 head' },
  { keywords: ['carrot', 'carrots'], walmartItemId: '10451314', productName: 'Fresh Whole Carrots', packageLabel: '1 lb bag' },
  { keywords: ['celery'], walmartItemId: '44390955', productName: 'Fresh Celery Stalks', packageLabel: '1 bunch' },
  { keywords: ['cucumber', 'cucumbers'], walmartItemId: '44390956', productName: 'Fresh English Cucumber', packageLabel: 'each' },
  { keywords: ['zucchini'], walmartItemId: '44391085', productName: 'Fresh Green Zucchini', packageLabel: 'each' },
  { keywords: ['bell pepper', 'red pepper', 'green pepper', 'yellow pepper'], walmartItemId: '44390963', productName: 'Fresh Red Bell Pepper', packageLabel: 'each' },
  { keywords: ['jalapeno', 'jalapeño'], walmartItemId: '44390969', productName: 'Fresh Jalapeno Peppers', packageLabel: 'each' },
  { keywords: ['mushroom', 'mushrooms', 'cremini'], walmartItemId: '44391421', productName: 'Fresh Whole Baby Bella Mushrooms', packageLabel: '8 oz' },
  { keywords: ['potato', 'potatoes', 'yukon'], walmartItemId: '44390979', productName: 'Fresh Yukon Gold Potatoes', packageLabel: '3 lb bag' },
  { keywords: ['sweet potato', 'sweet potatoes'], walmartItemId: '44390984', productName: 'Fresh Sweet Potatoes', packageLabel: 'each' },
  { keywords: ['butternut squash', 'squash'], walmartItemId: '44391089', productName: 'Fresh Butternut Squash', packageLabel: 'each' },
  { keywords: ['corn'], walmartItemId: '44391071', productName: 'Fresh Sweet Corn', packageLabel: 'each' },
  { keywords: ['green beans'], walmartItemId: '44391408', productName: 'Marketside Fresh Trimmed Green Beans', packageLabel: '12 oz' },
  { keywords: ['peas', 'green peas'], walmartItemId: '10451500', productName: 'Great Value Frozen Sweet Peas', packageLabel: '12 oz' },
  { keywords: ['dill'], walmartItemId: '51259219', productName: 'Fresh Organic Dill', packageLabel: '0.5 oz' },
  { keywords: ['basil'], walmartItemId: '51259216', productName: 'Fresh Organic Basil', packageLabel: '0.5 oz' },
  { keywords: ['thyme'], walmartItemId: '51259224', productName: 'Fresh Organic Thyme', packageLabel: '0.5 oz' },
  { keywords: ['rosemary'], walmartItemId: '51259222', productName: 'Fresh Organic Rosemary', packageLabel: '0.5 oz' },
  { keywords: ['parsley'], walmartItemId: '44391115', productName: 'Fresh Italian Flat Leaf Parsley', packageLabel: '1 bunch' },
  { keywords: ['mint'], walmartItemId: '51259220', productName: 'Fresh Organic Mint', packageLabel: '0.5 oz' },
  { keywords: ['cilantro'], walmartItemId: '44391114', productName: 'Fresh Cilantro Bunch', packageLabel: '1 bunch' },
  { keywords: ['chives'], walmartItemId: '51259218', productName: 'Fresh Organic Chives', packageLabel: '0.5 oz' },
  { keywords: ['baby kale', 'kale'], walmartItemId: '44391439', productName: 'Marketside Organic Baby Kale', packageLabel: '5 oz' },
  { keywords: ['spinach'], walmartItemId: '44391432', productName: 'Marketside Organic Baby Spinach', packageLabel: '5 oz' },
  { keywords: ['arugula'], walmartItemId: '44391435', productName: 'Marketside Organic Baby Arugula', packageLabel: '5 oz' },
  { keywords: ['lettuce', 'romaine'], walmartItemId: '44391428', productName: 'Marketside Romaine Hearts', packageLabel: '3 ct' },
  { keywords: ['cabbage'], walmartItemId: '44391069', productName: 'Fresh Green Cabbage', packageLabel: '1 head' },
  { keywords: ['cherry tomatoes', 'heirloom cherry tomatoes', 'grape tomatoes'], walmartItemId: '44391015', productName: 'Fresh Heirloom Cherry Tomatoes', packageLabel: '10 oz' },
  { keywords: ['roma tomatoes', 'tomato', 'tomatoes'], walmartItemId: '44391013', productName: 'Fresh Roma Tomatoes', packageLabel: 'each' },
  { keywords: ['avocado', 'avocados'], walmartItemId: '44390946', productName: 'Fresh Hass Avocado', packageLabel: 'each' },
  { keywords: ['radish', 'radishes'], walmartItemId: '44391142', productName: 'Fresh Red Radishes', packageLabel: '1 bunch' },
  { keywords: ['fennel'], walmartItemId: '44391119', productName: 'Fresh Fennel Bulb', packageLabel: 'each' },
  { keywords: ['edamame'], walmartItemId: '49609471', productName: 'Birds Eye Steamfresh Shelled Edamame', packageLabel: '12 oz' },
  { keywords: ['strawberries', 'strawberry'], walmartItemId: '44391461', productName: 'Fresh Strawberries', packageLabel: '1 lb' },
  { keywords: ['blueberries', 'blueberry'], walmartItemId: '44391454', productName: 'Fresh Blueberries', packageLabel: '1 pint' },
  { keywords: ['raspberries', 'raspberry'], walmartItemId: '44391459', productName: 'Fresh Raspberries', packageLabel: '6 oz' },
  { keywords: ['banana', 'bananas'], walmartItemId: '44390948', productName: 'Fresh Bananas', packageLabel: '1 bunch' },
  { keywords: ['apple', 'apples'], walmartItemId: '44390942', productName: 'Fresh Honeycrisp Apples', packageLabel: 'each' },
  { keywords: ['peach', 'peaches'], walmartItemId: '44390960', productName: 'Fresh Yellow Peaches', packageLabel: 'each' },
  { keywords: ['ginger'], walmartItemId: '44391127', productName: 'Fresh Ginger Root', packageLabel: '1 root' },

  // Protein
  { keywords: ['salmon'], walmartItemId: '51259050', productName: 'Marketside Fresh Atlantic Salmon Fillets', packageLabel: '1 lb' },
  { keywords: ['shrimp'], walmartItemId: '10451588', productName: 'Great Value Raw Peeled Deveined Shrimp', packageLabel: '12 oz' },
  { keywords: ['chicken breast', 'chicken breasts', 'chicken'], walmartItemId: '27935840', productName: 'Tyson Fresh Boneless Skinless Chicken Breasts', packageLabel: '2.25 lb' },
  { keywords: ['chicken thigh', 'chicken thighs'], walmartItemId: '27935842', productName: 'Tyson Fresh Boneless Skinless Chicken Thighs', packageLabel: '2 lb' },
  { keywords: ['ground beef', 'beef'], walmartItemId: '51259129', productName: '85% Lean / 15% Fat Ground Beef', packageLabel: '1 lb' },
  { keywords: ['ground turkey', 'turkey'], walmartItemId: '10451423', productName: 'Butterball 93% Lean Ground Turkey', packageLabel: '1 lb' },
  { keywords: ['bacon'], walmartItemId: '10292646', productName: 'Wright Brand Hickory Smoked Bacon', packageLabel: '24 oz' },
  { keywords: ['sausage'], walmartItemId: '10292670', productName: 'Johnsonville Mild Italian Sausage', packageLabel: '19 oz' },
  { keywords: ['tofu'], walmartItemId: '10452246', productName: 'Nasoya Organic Extra Firm Tofu', packageLabel: '14 oz' },

  // Bakery & Grains & Pasta
  { keywords: ['sourdough', 'crusty bread', 'artisan bread', 'bread'], walmartItemId: '46652451', productName: 'Marketside Sliced Sourdough Loaf', packageLabel: '24 oz' },
  { keywords: ['tortilla', 'tortillas'], walmartItemId: '10291401', productName: 'Mission Soft Taco Flour Tortillas', packageLabel: '10 ct' },
  { keywords: ['orzo'], walmartItemId: '10309184', productName: 'DeLallo Orzo Pasta', packageLabel: '16 oz' },
  { keywords: ['spaghetti'], walmartItemId: '10309190', productName: 'Barilla Spaghetti Pasta', packageLabel: '16 oz' },
  { keywords: ['penne', 'rigatoni', 'fusilli', 'pasta', 'macaroni'], walmartItemId: '10309188', productName: 'Barilla Penne Pasta', packageLabel: '16 oz' },
  { keywords: ['arborio rice', 'risotto'], walmartItemId: '10315400', productName: 'RiceSelect Arborio Rice', packageLabel: '32 oz' },
  { keywords: ['jasmine rice', 'basmati rice', 'white rice', 'brown rice', 'rice'], walmartItemId: '10315395', productName: 'Mahatma Jasmine White Rice', packageLabel: '2 lb' },
  { keywords: ['quinoa'], walmartItemId: '10315401', productName: 'Great Value Organic Quinoa', packageLabel: '16 oz' },
  { keywords: ['rolled oats', 'oats'], walmartItemId: '10312439', productName: 'Quaker Old Fashioned Rolled Oats', packageLabel: '18 oz' },
  { keywords: ['breadcrumbs', 'panko'], walmartItemId: '10308795', productName: 'Kikkoman Panko Bread Crumbs', packageLabel: '8 oz' },
  { keywords: ['all-purpose flour', 'flour'], walmartItemId: '10315169', productName: 'Gold Medal All-Purpose Flour', packageLabel: '5 lb' },

  // Canned, Beans & Pantry
  { keywords: ['cannellini beans', 'white beans'], walmartItemId: '10452095', productName: 'Goya Cannellini White Kidney Beans', packageLabel: '15.5 oz can' },
  { keywords: ['black beans'], walmartItemId: '10452091', productName: 'Goya Black Beans', packageLabel: '15.5 oz can' },
  { keywords: ['kidney beans', 'pinto beans', 'beans'], walmartItemId: '10452092', productName: 'Goya Red Kidney Beans', packageLabel: '15.5 oz can' },
  { keywords: ['chickpeas', 'garbanzo'], walmartItemId: '10452096', productName: 'Goya Chick Peas Garbanzos', packageLabel: '15.5 oz can' },
  { keywords: ['lentils'], walmartItemId: '10315398', productName: 'Great Value Dried Lentils', packageLabel: '16 oz' },
  { keywords: ['diced tomatoes', 'crushed tomatoes', 'tomato sauce'], walmartItemId: '10295055', productName: 'Hunts Crushed Tomatoes', packageLabel: '28 oz can' },
  { keywords: ['tomato paste'], walmartItemId: '10295050', productName: 'Hunts Tomato Paste', packageLabel: '6 oz can' },
  { keywords: ['marinara', 'pasta sauce'], walmartItemId: '31008715', productName: 'Raos Homemade Marinara Sauce', packageLabel: '24 oz' },
  { keywords: ['coconut milk', 'coconut cream'], walmartItemId: '10318541', productName: 'Thai Kitchen Organic Unsweetened Coconut Milk', packageLabel: '13.66 fl oz' },
  { keywords: ['vegetable broth', 'vegetable stock'], walmartItemId: '10294462', productName: 'Swanson Organic Vegetable Broth', packageLabel: '32 oz' },
  { keywords: ['chicken broth', 'chicken stock', 'broth', 'stock'], walmartItemId: '10294460', productName: 'Swanson Chicken Broth', packageLabel: '32 oz' },
  { keywords: ['olive oil'], walmartItemId: '10315103', productName: 'California Olive Ranch Extra Virgin Olive Oil', packageLabel: '16.9 fl oz' },
  { keywords: ['sesame oil'], walmartItemId: '10318535', productName: 'Kadoya Pure Sesame Oil', packageLabel: '5.5 fl oz' },
  { keywords: ['avocado oil', 'vegetable oil', 'canola oil', 'oil'], walmartItemId: '10315101', productName: 'Great Value Pure Vegetable Oil', packageLabel: '48 fl oz' },
  { keywords: ['balsamic vinegar'], walmartItemId: '10315118', productName: 'Pompeian Balsamic Vinegar', packageLabel: '16 fl oz' },
  { keywords: ['apple cider vinegar'], walmartItemId: '10315115', productName: 'Bragg Organic Apple Cider Vinegar', packageLabel: '16 fl oz' },
  { keywords: ['rice vinegar', 'red wine vinegar', 'white wine vinegar', 'vinegar'], walmartItemId: '10318530', productName: 'Marukan Seasoned Rice Vinegar', packageLabel: '12 fl oz' },
  { keywords: ['white miso', 'miso'], walmartItemId: '10452699', productName: 'Miso Master Organic Mellow White Miso', packageLabel: '16 oz' },
  { keywords: ['soy sauce', 'tamari'], walmartItemId: '10291663', productName: 'Kikkoman Less Sodium Soy Sauce', packageLabel: '15 fl oz' },
  { keywords: ['dijon', 'mustard'], walmartItemId: '10294290', productName: 'Grey Poupon Dijon Mustard', packageLabel: '8 oz' },
  { keywords: ['honey'], walmartItemId: '10315260', productName: 'Great Value Organic Raw Honey', packageLabel: '16 oz' },
  { keywords: ['maple syrup'], walmartItemId: '10315262', productName: 'Great Value 100% Pure Maple Syrup', packageLabel: '12.5 fl oz' },
  { keywords: ['brown sugar'], walmartItemId: '10315165', productName: 'Great Value Light Brown Sugar', packageLabel: '2 lb' },
  { keywords: ['sugar'], walmartItemId: '10315162', productName: 'Great Value Pure Granulated Sugar', packageLabel: '4 lb' },
  { keywords: ['peanut butter'], walmartItemId: '10315411', productName: 'Jif Creamy Peanut Butter', packageLabel: '16 oz' },
  { keywords: ['tahini'], walmartItemId: '10452701', productName: 'Joyva Sesame Tahini', packageLabel: '15 oz' },
  { keywords: ['salsa'], walmartItemId: '10294311', productName: 'Pace Chunky Mild Salsa', packageLabel: '16 oz' },
  { keywords: ['almonds'], walmartItemId: '10315403', productName: 'Blue Diamond Sliced Almonds', packageLabel: '6 oz' },
  { keywords: ['walnuts', 'pecans', 'cashews', 'pine nuts'], walmartItemId: '10315405', productName: 'Great Value Chopped Walnuts', packageLabel: '8 oz' },
  { keywords: ['pumpkin seeds', 'sunflower seeds'], walmartItemId: '44391502', productName: 'Great Value Roasted Pumpkin Seeds', packageLabel: '8 oz' },
  { keywords: ['chia seeds'], walmartItemId: '35518889', productName: 'BetterBody Foods Organic Chia Seeds', packageLabel: '12 oz' },
  { keywords: ['sesame seeds'], walmartItemId: '10308949', productName: 'McCormick Sesame Seed', packageLabel: '1.62 oz' },
  { keywords: ['nutritional yeast'], walmartItemId: '38216328', productName: 'Bragg Premium Nutritional Yeast', packageLabel: '4.5 oz' },

  // Spices & Seasonings
  { keywords: ['kosher salt', 'flaky sea salt', 'sea salt', 'salt'], walmartItemId: '10316830', productName: 'Morton Coarse Kosher Salt', packageLabel: '48 oz' },
  { keywords: ['black pepper', 'peppercorn', 'pepper'], walmartItemId: '10308930', productName: 'McCormick Pure Ground Black Pepper', packageLabel: '3 oz' },
  { keywords: ['curry powder'], walmartItemId: '10308935', productName: 'McCormick Curry Powder', packageLabel: '1.75 oz' },
  { keywords: ['cumin'], walmartItemId: '10308934', productName: 'McCormick Ground Cumin', packageLabel: '1.5 oz' },
  { keywords: ['paprika'], walmartItemId: '10308941', productName: 'McCormick Smoked Paprika', packageLabel: '1.75 oz' },
  { keywords: ['turmeric'], walmartItemId: '10308952', productName: 'McCormick Ground Turmeric', packageLabel: '0.95 oz' },
  { keywords: ['cinnamon'], walmartItemId: '10308933', productName: 'McCormick Ground Cinnamon', packageLabel: '2.37 oz' },
  { keywords: ['nutmeg'], walmartItemId: '10308939', productName: 'McCormick Ground Nutmeg', packageLabel: '1.1 oz' },
  { keywords: ['oregano'], walmartItemId: '10308940', productName: 'McCormick Oregano Leaves', packageLabel: '0.75 oz' },
  { keywords: ['chili powder', 'red pepper flakes', 'chili flakes'], walmartItemId: '10308932', productName: 'McCormick Crushed Red Pepper', packageLabel: '1.5 oz' },
  { keywords: ['vanilla'], walmartItemId: '10308955', productName: 'McCormick Pure Vanilla Extract', packageLabel: '2 fl oz' },
  { keywords: ['baking powder'], walmartItemId: '10315175', productName: 'Clabber Girl Baking Powder', packageLabel: '8.1 oz' },
  { keywords: ['baking soda'], walmartItemId: '10291032', productName: 'Arm & Hammer Pure Baking Soda', packageLabel: '16 oz' },
];

export function buildWalmartSearchUrl(
  query: string,
  fulfillment: WalmartFulfillment = 'pickup',
): string {
  const facet =
    fulfillment === 'delivery'
      ? 'fulfillment_method%3ADelivery'
      : 'fulfillment_method%3APickup';
  return `https://www.walmart.com/search?q=${encodeURIComponent(query.trim())}&facet=${facet}`;
}

export function extractWalmartItemId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{5,14}$/.test(trimmed)) return trimmed;
  const urlMatch = trimmed.match(/\/ip\/(?:[^/]+\/)?(\d{5,14})(?:[/?#]|$)/i);
  if (urlMatch) return urlMatch[1];
  const paramMatch = trimmed.match(/[?&]itemId=(\d{5,14})/i);
  if (paramMatch) return paramMatch[1];
  return null;
}

function findCatalogMatch(name: string): WalmartCatalogEntry | null {
  const lower = cleanIngredientForMatching(name) || name.toLowerCase();
  let best: WalmartCatalogEntry | null = null;
  let bestLen = 0;

  for (const entry of WALMART_CATALOG) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw) && kw.length > bestLen) {
        best = entry;
        bestLen = kw.length;
      }
    }
  }
  return best;
}

function estimatePackageQty(item: GroceryItem): number {
  if (!item.quantity) return 1;
  if (item.unit === 'can' || item.unit === 'bag' || item.unit === 'package' || item.unit === 'bunch') {
    return Math.max(1, Math.ceil(item.quantity));
  }
  if (!item.unit && item.quantity > 1 && item.quantity <= 8) {
    return Math.ceil(item.quantity);
  }
  return 1;
}

export function matchWalmartProducts(
  items: GroceryItem[],
  fulfillment: WalmartFulfillment = 'pickup',
  personalHistory: WalmartPurchaseItem[] = [],
): WalmartCartLine[] {
  return items
    .filter((item) => !item.checked)
    .map((item) => {
      const cleanedQuery = cleanIngredientForMatching(item.name) || item.name;
      const historyMatch = !item.walmartItemId
        ? matchFromPurchaseHistory(item.name, personalHistory)
        : null;
      const catalogMatch =
        !item.walmartItemId && !historyMatch ? findCatalogMatch(cleanedQuery) : null;

      let itemId: string | null = null;
      let productName = item.name;
      let packageLabel = '1 item';
      let matchSource: WalmartMatchSource = 'none';

      if (item.walmartItemId) {
        itemId = item.walmartItemId;
        const known = personalHistory.find((h) => h.walmartItemId === item.walmartItemId);
        productName = known?.productName ?? `Linked Walmart item #${item.walmartItemId}`;
        packageLabel = known?.packageLabel ?? '1 item';
        matchSource = 'linked';
      } else if (historyMatch) {
        itemId = historyMatch.walmartItemId;
        productName = historyMatch.productName;
        packageLabel = historyMatch.packageLabel ?? '1 item';
        matchSource = 'history';
      } else if (catalogMatch) {
        itemId = catalogMatch.walmartItemId;
        productName = catalogMatch.productName;
        packageLabel = catalogMatch.packageLabel;
        matchSource = 'catalog';
      }

      const neededLabel = [item.quantity ?? '', item.unit, item.name]
        .filter((part) => String(part).trim().length > 0)
        .join(' ');

      return {
        groceryId: item.id,
        groceryName: item.name,
        neededLabel,
        walmartItemId: itemId,
        productName,
        packageLabel,
        packageQuantity: estimatePackageQty(item),
        searchUrl: buildWalmartSearchUrl(cleanedQuery, fulfillment),
        productUrl: itemId ? `https://www.walmart.com/ip/${itemId}` : null,
        matchSource,
      };
    });
}

function formatCartUrlForLines(
  mapped: WalmartCartLine[],
  options: WalmartCartOptions = {},
): string {
  const fulfillment = options.fulfillment ?? 'pickup';
  const itemsParam = mapped
    .map((line) =>
      line.packageQuantity > 1
        ? `${line.walmartItemId}_${line.packageQuantity}`
        : `${line.walmartItemId}`,
    )
    .join(',');

  const params = new URLSearchParams();
  params.set('items', itemsParam);
  params.set('fulfillmentIntent', fulfillment === 'delivery' ? 'DELIVERY' : 'PICKUP');
  const cleanStoreId = options.storeId?.trim();
  if (cleanStoreId && /^\d+$/.test(cleanStoreId)) {
    params.set('storeId', cleanStoreId);
  }

  return `https://www.walmart.com/sc/cart/addToCart?${params.toString()}`;
}

export function buildWalmartCartBatches(
  lines: WalmartCartLine[],
  options: WalmartCartOptions = {},
): WalmartCartBatch[] {
  const mapped = lines.filter((line) => Boolean(line.walmartItemId) && line.packageQuantity > 0);
  if (mapped.length === 0) return [];

  const chunks: WalmartCartLine[][] = [];
  for (let i = 0; i < mapped.length; i += WALMART_BATCH_LIMIT) {
    chunks.push(mapped.slice(i, i + WALMART_BATCH_LIMIT));
  }

  return chunks.map((chunk, idx) => ({
    index: idx,
    totalBatches: chunks.length,
    lines: chunk,
    url: formatCartUrlForLines(chunk, options),
  }));
}

export function buildWalmartCartUrl(
  lines: WalmartCartLine[],
  options: WalmartCartOptions = {},
): string | null {
  const batches = buildWalmartCartBatches(lines, options);
  return batches[0]?.url ?? null;
}
