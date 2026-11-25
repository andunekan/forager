import type { Ingredient, Recipe, TransformChange, TransformResult } from '../types/recipe';
import { formatIngredient, scaleIngredient } from './ingredientParser';

interface SubstitutionRule {
  pattern: RegExp;
  replaceIngredient: string;
  replaceStep: string;
  reason: string;
}

const DAIRY_RULES: SubstitutionRule[] = [
  {
    pattern: /\b(unsalted |salted )?butter\b/i,
    replaceIngredient: 'olive oil',
    replaceStep: 'olive oil',
    reason: 'dairy-free fat',
  },
  {
    pattern: /\b(heavy |whipping )?cream\b/i,
    replaceIngredient: 'full-fat coconut cream',
    replaceStep: 'coconut cream',
    reason: 'dairy-free richness',
  },
  {
    pattern: /\b(whole |2% |skim |dairy )?milk\b/i,
    replaceIngredient: 'unsweetened oat milk',
    replaceStep: 'oat milk',
    reason: 'dairy-free milk',
  },
  {
    pattern: /\b(grated |shaved |shredded )?parmesan( cheese)?\b/i,
    replaceIngredient: 'nutritional yeast',
    replaceStep: 'nutritional yeast',
    reason: 'savory dairy-free finish',
  },
  {
    pattern: /\bricotta( cheese)?\b/i,
    replaceIngredient: 'whipped almond ricotta',
    replaceStep: 'almond ricotta',
    reason: 'plant-based ricotta',
  },
  {
    pattern: /\b(greek |plain )?yogurt\b/i,
    replaceIngredient: 'unsweetened coconut yogurt',
    replaceStep: 'coconut yogurt',
    reason: 'dairy-free yogurt',
  },
  {
    pattern: /\bsour cream\b/i,
    replaceIngredient: 'cashew cream',
    replaceStep: 'cashew cream',
    reason: 'dairy-free cream',
  },
  {
    pattern: /\b(mozzarella|cheddar|feta|goat cheese|gruyere|cream cheese)\b/i,
    replaceIngredient: 'dairy-free cheese',
    replaceStep: 'dairy-free cheese',
    reason: 'dairy-free cheese',
  },
];

const VEGETARIAN_RULES: SubstitutionRule[] = [
  {
    pattern: /\b(salmon|cod|halibut|fish)( fillets?)?\b/i,
    replaceIngredient: 'extra-firm tofu',
    replaceStep: 'tofu',
    reason: 'plant protein',
  },
  {
    pattern: /\b(chicken|turkey)( breasts?| thighs?)?\b/i,
    replaceIngredient: 'roasted chickpeas',
    replaceStep: 'chickpeas',
    reason: 'vegetarian protein',
  },
  {
    pattern: /\b(beef|pork|sausage|bacon|pancetta)\b/i,
    replaceIngredient: 'cremini mushrooms',
    replaceStep: 'mushrooms',
    reason: 'savory plant swap',
  },
  {
    pattern: /\b(chicken|beef) (broth|stock)\b/i,
    replaceIngredient: 'vegetable broth',
    replaceStep: 'vegetable broth',
    reason: 'vegetarian broth',
  },
  {
    pattern: /\bshrimp\b/i,
    replaceIngredient: 'king oyster mushrooms',
    replaceStep: 'mushrooms',
    reason: 'vegetarian swap',
  },
];

const VEGAN_EXTRA_RULES: SubstitutionRule[] = [
  {
    pattern: /\bhoney\b/i,
    replaceIngredient: 'pure maple syrup',
    replaceStep: 'maple syrup',
    reason: 'plant-based sweetener',
  },
  {
    pattern: /\beggs?\b/i,
    replaceIngredient: 'flax egg',
    replaceStep: 'flax egg',
    reason: 'plant-based binder',
  },
];

const GLUTEN_FREE_RULES: SubstitutionRule[] = [
  {
    pattern: /\borzo( pasta)?\b/i,
    replaceIngredient: 'gluten-free orzo',
    replaceStep: 'gluten-free orzo',
    reason: 'gluten-free pasta',
  },
  {
    pattern: /\b(pasta|spaghetti|penne|rigatoni|fusilli|macaroni)\b/i,
    replaceIngredient: 'gluten-free pasta',
    replaceStep: 'gluten-free pasta',
    reason: 'gluten-free pasta',
  },
  {
    pattern: /\b(all-purpose |wheat |bread )?flour\b/i,
    replaceIngredient: '1:1 gluten-free flour',
    replaceStep: 'gluten-free flour',
    reason: 'gluten-free flour',
  },
  {
    pattern: /\bsoy sauce\b/i,
    replaceIngredient: 'gluten-free tamari',
    replaceStep: 'tamari',
    reason: 'gluten-free seasoning',
  },
  {
    pattern: /\b(sourdough |crusty |artisan )?bread\b/i,
    replaceIngredient: 'gluten-free sourdough bread',
    replaceStep: 'gluten-free bread',
    reason: 'gluten-free bread',
  },
  {
    pattern: /\b(breadcrumbs|panko)\b/i,
    replaceIngredient: 'gluten-free panko',
    replaceStep: 'gluten-free panko',
    reason: 'gluten-free crumb',
  },
];

const NUT_FREE_RULES: SubstitutionRule[] = [
  {
    pattern: /\b(sliced |slivered |toasted )?almonds\b/i,
    replaceIngredient: 'toasted pumpkin seeds',
    replaceStep: 'pumpkin seeds',
    reason: 'nut-free crunch',
  },
  {
    pattern: /\balmond milk\b/i,
    replaceIngredient: 'oat milk',
    replaceStep: 'oat milk',
    reason: 'nut-free milk',
  },
  {
    pattern: /\b(walnuts|pecans|pine nuts|cashews|pistachios|peanuts)\b/i,
    replaceIngredient: 'sunflower seeds',
    replaceStep: 'sunflower seeds',
    reason: 'nut-free swap',
  },
];

function applyRules(
  recipe: Recipe,
  rules: SubstitutionRule[],
  label: string,
): TransformResult {
  const changes: TransformChange[] = [];
  let updatedSteps = [...recipe.steps];

  const updatedIngredients: Ingredient[] = recipe.ingredients.map((ing) => {
    for (const rule of rules) {
      if (rule.pattern.test(ing.name)) {
        const nextName = ing.name.replace(rule.pattern, rule.replaceIngredient).trim();
        if (nextName.toLowerCase() !== ing.name.toLowerCase()) {
          changes.push({
            original: ing.name,
            replacement: nextName,
            reason: rule.reason,
          });
          updatedSteps = updatedSteps.map((step) =>
            step.replace(new RegExp(rule.pattern.source, 'gi'), rule.replaceStep),
          );
          const nextIng: Ingredient = { ...ing, name: nextName };
          return { ...nextIng, raw: formatIngredient(nextIng) };
        }
      }
    }
    return ing;
  });

  const noteLine =
    changes.length > 0
      ? `Transformed (${label}): ${changes.map((c) => `${c.original} → ${c.replacement}`).join(', ')}.`
      : '';

  const updatedRecipe: Recipe = {
    ...recipe,
    ingredients: updatedIngredients,
    steps: updatedSteps,
    notes: noteLine
      ? recipe.notes
        ? `${recipe.notes}\n${noteLine}`
        : noteLine
      : recipe.notes,
    updatedAt: new Date().toISOString(),
  };

  return {
    recipe: updatedRecipe,
    changes,
    summary:
      changes.length > 0
        ? `Updated ${changes.length} ingredient${changes.length === 1 ? '' : 's'} for ${label}`
        : `Already looks ${label}`,
  };
}

export const PRESET_TRANSFORMS = [
  { id: 'dairy-free', label: 'Substitute dairy', prompt: 'substitute the dairy' },
  { id: 'gluten-free', label: 'Gluten-free', prompt: 'make gluten-free' },
  { id: 'vegetarian', label: 'Vegetarian', prompt: 'make vegetarian' },
  { id: 'vegan', label: 'Plant-based', prompt: 'make vegan' },
  { id: 'nut-free', label: 'Nut-free', prompt: 'make nut-free' },
] as const;

export function applyRecipeTransform(recipe: Recipe, instruction: string): TransformResult {
  const prompt = instruction.trim();
  const lower = prompt.toLowerCase();

  if (!lower) {
    return { recipe, changes: [], summary: 'No transform applied' };
  }

  // Preset matching
  if (lower.includes('dairy') || lower.includes('lactose') || lower.includes('milk-free')) {
    return applyRules(recipe, DAIRY_RULES, 'dairy-free');
  }
  if (lower.includes('vegan') || lower.includes('plant-based') || lower.includes('plant based')) {
    return applyRules(
      recipe,
      [...VEGETARIAN_RULES, ...DAIRY_RULES, ...VEGAN_EXTRA_RULES],
      'plant-based',
    );
  }
  if (lower.includes('vegetarian') || lower.includes('meatless')) {
    return applyRules(recipe, VEGETARIAN_RULES, 'vegetarian');
  }
  if (lower.includes('gluten')) {
    return applyRules(recipe, GLUTEN_FREE_RULES, 'gluten-free');
  }
  if (lower.includes('nut-free') || lower.includes('nut free') || lower.includes('no nuts')) {
    return applyRules(recipe, NUT_FREE_RULES, 'nut-free');
  }

  // Custom swap: "swap X for Y" / "replace X with Y" / "substitute X with Y"
  const swapMatch = prompt.match(
    /^(?:swap|replace|substitute|change)\s+(?:the\s+)?(.+?)\s+(?:for|with|to)\s+(.+)$/i,
  );
  if (swapMatch) {
    const source = swapMatch[1].trim();
    const target = swapMatch[2].trim();
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rule: SubstitutionRule = {
      pattern: new RegExp(escaped, 'i'),
      replaceIngredient: target,
      replaceStep: target,
      reason: 'custom swap',
    };
    return applyRules(recipe, [rule], `${source} → ${target}`);
  }

  // Scale a single ingredient: "double the garlic" / "halve the salt" / "more garlic" / "less butter"
  const scaleMatch = prompt.match(/^(double|triple|halve|more|less)\s+(?:the\s+)?(.+)$/i);
  if (scaleMatch) {
    const verb = scaleMatch[1].toLowerCase();
    const target = scaleMatch[2].trim().toLowerCase();
    const factor =
      verb === 'double'
        ? 2
        : verb === 'triple'
          ? 3
          : verb === 'halve'
            ? 0.5
            : verb === 'more'
              ? 1.5
              : 0.5;

    const changes: TransformChange[] = [];
    const updatedIngredients = recipe.ingredients.map((ing) => {
      if (ing.name.toLowerCase().includes(target)) {
        const scaled = scaleIngredient(ing, factor);
        changes.push({
          original: formatIngredient(ing),
          replacement: formatIngredient(scaled),
          reason: `${verb} quantity`,
        });
        return scaled;
      }
      return ing;
    });

    return {
      recipe: {
        ...recipe,
        ingredients: updatedIngredients,
        updatedAt: new Date().toISOString(),
      },
      changes,
      summary:
        changes.length > 0
          ? `Adjusted ${target}`
          : `Couldn't find "${target}" in this recipe`,
    };
  }

  // Remove ingredient: "remove X" / "omit X" / "no X" / "without X"
  const removeMatch = prompt.match(/^(?:remove|omit|skip|no|without)\s+(?:the\s+)?(.+)$/i);
  if (removeMatch) {
    const target = removeMatch[1].trim().toLowerCase();
    const changes: TransformChange[] = [];
    const updatedIngredients = recipe.ingredients.filter((ing) => {
      if (ing.name.toLowerCase().includes(target)) {
        changes.push({
          original: formatIngredient(ing),
          replacement: 'omitted',
          reason: 'removed',
        });
        return false;
      }
      return true;
    });

    return {
      recipe: {
        ...recipe,
        ingredients: updatedIngredients,
        updatedAt: new Date().toISOString(),
      },
      changes,
      summary:
        changes.length > 0
          ? `Removed ${target}`
          : `Couldn't find "${target}" in this recipe`,
    };
  }

  return {
    recipe,
    changes: [],
    summary: `Try "substitute the dairy", "swap butter for olive oil", "double the garlic", or "remove onion"`,
  };
}
