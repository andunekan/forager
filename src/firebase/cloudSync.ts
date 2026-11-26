import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import type { WalmartFulfillment } from '../domain/walmartCart';
import {
  mergePurchaseHistory,
  type WalmartPurchaseItem,
} from '../domain/walmartOrderHistory';
import type { GroceryItem, PlannedMeal, Recipe } from '../types/recipe';
import { getFirebaseDb } from './firebaseClient';

export interface ForagerUserState {
  recipes: Recipe[];
  plan: PlannedMeal[];
  checkedMap: Record<string, boolean>;
  extraItems: GroceryItem[];
  walmartItemIds: Record<string, string>;
  walmartHistory: WalmartPurchaseItem[];
  walmartFulfillment: WalmartFulfillment;
  walmartStoreId: string;
  updatedAt: string;
}

/**
 * Firestore rejects documents containing explicit `undefined` values.
 * Recursively strips any `undefined` object properties before writing.
 */
export function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== undefined) {
        cleaned[key] = sanitizeForFirestore(val);
      }
    }
    return cleaned as T;
  }
  return value;
}

export function mergeLocalAndCloudState(
  local: ForagerUserState,
  cloud: ForagerUserState,
): ForagerUserState {
  // Merge recipes by ID, keeping whichever version has the newer updatedAt timestamp
  const recipeMap = new Map<string, Recipe>();
  for (const r of cloud.recipes) {
    recipeMap.set(r.id, r);
  }
  for (const r of local.recipes) {
    const existing = recipeMap.get(r.id);
    if (!existing) {
      recipeMap.set(r.id, r);
    } else if (new Date(r.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      recipeMap.set(r.id, r);
    }
  }

  // Merge extra items by ID
  const extraMap = new Map<string, GroceryItem>();
  for (const item of [...cloud.extraItems, ...local.extraItems]) {
    extraMap.set(item.id, item);
  }

  // Merge Walmart purchase history without losing items from either device
  const mergedHistory = mergePurchaseHistory(cloud.walmartHistory, local.walmartHistory);

  // Prefer cloud plan when cloud is newer and non-empty; otherwise keep local plan
  const cloudNewer =
    new Date(cloud.updatedAt || 0).getTime() >= new Date(local.updatedAt || 0).getTime();
  const mergedPlan =
    cloudNewer && cloud.plan.length > 0
      ? cloud.plan
      : local.plan.length > 0
        ? local.plan
        : cloud.plan;

  return {
    recipes: Array.from(recipeMap.values()),
    plan: mergedPlan,
    checkedMap: { ...local.checkedMap, ...cloud.checkedMap },
    extraItems: Array.from(extraMap.values()),
    walmartItemIds: { ...local.walmartItemIds, ...cloud.walmartItemIds },
    walmartHistory: mergedHistory,
    walmartFulfillment: cloud.walmartFulfillment || local.walmartFulfillment || 'pickup',
    walmartStoreId: cloud.walmartStoreId || local.walmartStoreId || '',
    updatedAt: new Date().toISOString(),
  };
}

function getUserStateDocRef(uid: string) {
  const db = getFirebaseDb();
  if (!db) return null;
  return doc(db, 'users', uid, 'private', 'foragerState');
}

export async function loadCloudState(uid: string): Promise<ForagerUserState | null> {
  const ref = getUserStateDocRef(uid);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as ForagerUserState;
}

export async function saveCloudState(uid: string, state: ForagerUserState): Promise<void> {
  const ref = getUserStateDocRef(uid);
  if (!ref) return;
  const payload = sanitizeForFirestore({
    ...state,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(ref, payload, { merge: true });
}

export function subscribeCloudState(
  uid: string,
  onRemoteState: (state: ForagerUserState) => void,
): () => void {
  const ref = getUserStateDocRef(uid);
  if (!ref) return () => {};
  return onSnapshot(ref, (snap) => {
    if (snap.exists() && !snap.metadata.hasPendingWrites) {
      onRemoteState(snap.data() as ForagerUserState);
    }
  });
}
