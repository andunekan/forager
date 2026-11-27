import type { Recipe } from '../types/recipe';

export type ProteinType =
  | 'Poultry'
  | 'Beef & Pork'
  | 'Seafood'
  | 'Plant-based'
  | 'Eggs & Cheese'
  | 'Other';

export const PROTEIN_ORDER: readonly ProteinType[] = [
  'Poultry',
  'Beef & Pork',
  'Seafood',
  'Plant-based',
  'Eggs & Cheese',
  'Other',
];

const BROTH_OR_CONDIMENT_RE =
  /\b(?:chicken|turkey|beef|pork|bone|fish|oyster|clam|crab|shrimp)\s+(?:broth|stock|bouillon|base|sauce|paste|fat|drippings|seasoning|flavoring)\b/gi;

const POULTRY_RE =
  /\b(?:chicken|turkey|duck|cornish\s+hen|quail|rotisserie|poultry|drumsticks?|chicken\s+breasts?|chicken\s+thighs?|chicken\s+wings?)\b/i;

const BEEF_PORK_RE =
  /\b(?:beef|steak|sirloin|ribeye|brisket|chuck\s+roast|short\s+ribs?|ground\s+beef|flank\s+steak|skirt\s+steak|filet\s+mignon|pork|bacon|pancetta|prosciutto|ham|sausage|chorizo|bratwurst|andouille|kielbasa|salami|pepperoni|carnitas|pork\s+chops?|tenderloin|lamb|veal|venison|bison|meatballs?|meatloaf|ribs)\b/i;

const SEAFOOD_RE =
  /\b(?:salmon|tuna|cod|halibut|tilapia|trout|mahi|snapper|sea\s*bass|haddock|swordfish|catfish|mackerel|sardines?|anchov(?:y|ies)|shrimp|prawns?|scallops?|crab|lobster|mussels?|clams?|oysters?|calamari|squid|octopus|fish\s+fillets?|white\s+fish|seafood)\b/i;

const PLANT_PROTEIN_RE =
  /\b(?:tofu|tempeh|seitan|edamame|chickpeas?|garbanzo|lentils?|cannellini|black\s+beans?|pinto\s+beans?|kidney\s+beans?|white\s+beans?|navy\s+beans?|great\s+northern\s+beans?|butter\s+beans?|lima\s+beans?|fava\s+beans?|split\s+peas?|black-eyed\s+peas?|falafel|hummus|quinoa|beans)\b/i;

const EGGS_CHEESE_RE =
  /\b(?:eggs?|egg\s+whites?|egg\s+yolks?|frittata|shakshuka|omelet(?:te)?|quiche|ricotta|burrata|halloumi|paneer|feta|mozzarella|cheddar|gruyere|parmesan|goat\s+cheese|cottage\s+cheese|greek\s+yogurt)\b/i;

function stripModifiers(text: string): string {
  return text.replace(BROTH_OR_CONDIMENT_RE, ' ');
}

function matchProteinInText(text: string): ProteinType | null {
  const cleaned = stripModifiers(text);
  if (POULTRY_RE.test(cleaned)) return 'Poultry';
  if (BEEF_PORK_RE.test(cleaned)) return 'Beef & Pork';
  if (SEAFOOD_RE.test(cleaned)) return 'Seafood';
  if (PLANT_PROTEIN_RE.test(cleaned)) return 'Plant-based';
  if (EGGS_CHEESE_RE.test(cleaned)) return 'Eggs & Cheese';
  return null;
}

export function classifyRecipeProtein(recipe: Recipe): ProteinType {
  // Check the title first so primary proteins beat minor accompaniments
  const fromTitle = matchProteinInText(recipe.title);
  if (fromTitle) return fromTitle;

  const ingredientBlob = recipe.ingredients.map((i) => `${i.name} ${i.raw}`).join(' ; ');
  const fromIngredients = matchProteinInText(ingredientBlob);
  if (fromIngredients) return fromIngredients;

  return 'Other';
}

export function sortRecipesByProtein(recipes: Recipe[]): Recipe[] {
  const orderMap = new Map(PROTEIN_ORDER.map((type, idx) => [type, idx]));
  return [...recipes].sort((a, b) => {
    const pa = orderMap.get(classifyRecipeProtein(a)) ?? PROTEIN_ORDER.length;
    const pb = orderMap.get(classifyRecipeProtein(b)) ?? PROTEIN_ORDER.length;
    if (pa !== pb) return pa - pb;
    return a.title.localeCompare(b.title);
  });
}

export interface ProteinRecipeGroup {
  protein: ProteinType;
  recipes: Recipe[];
}

export function groupRecipesByProtein(recipes: Recipe[]): ProteinRecipeGroup[] {
  const buckets = new Map<ProteinType, Recipe[]>();
  for (const type of PROTEIN_ORDER) {
    buckets.set(type, []);
  }

  for (const recipe of recipes) {
    const protein = classifyRecipeProtein(recipe);
    buckets.get(protein)?.push(recipe);
  }

  const groups: ProteinRecipeGroup[] = [];
  for (const type of PROTEIN_ORDER) {
    const list = buckets.get(type) ?? [];
    if (list.length > 0) {
      list.sort((a, b) => a.title.localeCompare(b.title));
      groups.push({ protein: type, recipes: list });
    }
  }
  return groups;
}
