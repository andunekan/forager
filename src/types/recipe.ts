export interface Ingredient {
  id: string;
  quantity: number | null;
  unit: string;
  name: string;
  preparation?: string;
  raw: string;
}

export interface Recipe {
  id: string;
  title: string;
  image?: string;
  servings: number;
  prepMinutes?: number;
  ingredients: Ingredient[];
  steps: string[];
  notes: string;
  sourceUrl?: string;
  sourceType?: 'manual' | 'url' | 'spreadsheet' | 'photo';
  createdAt: string;
  updatedAt: string;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface PlannedMeal {
  id: string;
  dayIndex: number; // 0 = Monday .. 6 = Sunday
  slot: MealSlot;
  recipeId: string;
  servings: number;
  customTitle?: string;
  customIngredients?: Ingredient[];
  customNotes?: string;
}

export type GroceryAisle =
  | 'Produce'
  | 'Dairy & Eggs'
  | 'Protein'
  | 'Bakery'
  | 'Pantry'
  | 'Other';

export interface GroceryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  aisle: GroceryAisle;
  checked: boolean;
  sources: string[];
  custom?: boolean;
  walmartItemId?: string;
}

export interface TransformChange {
  original: string;
  replacement: string;
  reason: string;
}

export interface TransformResult {
  recipe: Recipe;
  changes: TransformChange[];
  summary: string;
}
