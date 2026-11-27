import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  CalendarPlus,
  Leaf,
  LogIn,
  Maximize2,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { AddRecipeModal } from './components/AddRecipeModal';
import { GroceryListView } from './components/GroceryListView';
import { RecipeDetailModal } from './components/RecipeDetailModal';
import { WeekPlannerView } from './components/WeekPlannerView';
import { SEED_PLAN, SEED_RECIPES } from './data/seedRecipes';
import { aggregateGroceries, categorizeAisle } from './domain/groceryAggregator';
import { createId, parseIngredient } from './domain/ingredientParser';
import {
  DEFAULT_MEAL_SLOT,
  findNextOpenDay,
  moveMealToDay,
  suggestSerendipitousRecipe,
} from './domain/mealPlanner';
import { groupRecipesByProtein } from './domain/proteinClassifier';
import type { WalmartFulfillment } from './domain/walmartCart';
import {
  mergePurchaseHistory,
  type WalmartPurchaseItem,
} from './domain/walmartOrderHistory';
import { isChromeExtension, openExtensionFullTab } from './extension/chromeBridge';
import {
  loadCloudState,
  mergeLocalAndCloudState,
  saveCloudState,
  subscribeCloudState,
  type ForagerUserState,
} from './firebase/cloudSync';
import {
  isFirebaseConfigured,
  signInWithGoogle,
  signOutUser,
  subscribeToAuth,
  type FirebaseUserSummary,
} from './firebase/firebaseClient';
import type { GroceryItem, PlannedMeal, Recipe } from './types/recipe';
import { loadFromStorage, saveToStorage } from './utils/storage';

type ActiveView = 'recipes' | 'week' | 'list';

const STORAGE_KEYS = {
  recipes: 'forager.recipes.v1',
  plan: 'forager.plan.v1',
  checked: 'forager.checked.v1',
  extras: 'forager.extras.v1',
  walmartIds: 'forager.walmartIds.v1',
  walmartHistory: 'forager.walmartHistory.v1',
  fulfillment: 'forager.walmartFulfillment.v1',
  storeId: 'forager.walmartStoreId.v1',
};

// Keep preloaded image bitmaps warm in memory so tab switches & recipe opens are instant
const preloadedImages = new Map<string, HTMLImageElement>();

function preloadImageUrls(urls: Array<string | undefined>) {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return;
  for (const url of urls) {
    if (!url || preloadedImages.has(url)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    preloadedImages.set(url, img);
  }
}

export default function App() {
  const [view, setView] = useState<ActiveView>('recipes');
  const [recipes, setRecipes] = useState<Recipe[]>(() =>
    loadFromStorage(STORAGE_KEYS.recipes, SEED_RECIPES, 'meadow.recipes.v1').map((r) =>
      r.image?.startsWith('/images/') ? { ...r, image: `.${r.image}` } : r,
    ),
  );
  const [plan, setPlan] = useState<PlannedMeal[]>(() =>
    loadFromStorage(STORAGE_KEYS.plan, SEED_PLAN, 'meadow.plan.v1'),
  );
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>(() =>
    loadFromStorage(STORAGE_KEYS.checked, {}, 'meadow.checked.v1'),
  );
  const [extraItems, setExtraItems] = useState<GroceryItem[]>(() =>
    loadFromStorage(STORAGE_KEYS.extras, [], 'meadow.extras.v1'),
  );
  const [walmartItemIds, setWalmartItemIds] = useState<Record<string, string>>(() =>
    loadFromStorage(STORAGE_KEYS.walmartIds, {}, 'meadow.walmartIds.v1'),
  );
  const [walmartHistory, setWalmartHistory] = useState<WalmartPurchaseItem[]>(() =>
    loadFromStorage(STORAGE_KEYS.walmartHistory, [], 'meadow.walmartHistory.v1'),
  );
  const [walmartFulfillment, setWalmartFulfillment] = useState<WalmartFulfillment>(() =>
    loadFromStorage(STORAGE_KEYS.fulfillment, 'pickup', 'meadow.walmartFulfillment.v1'),
  );
  const [walmartStoreId, setWalmartStoreId] = useState<string>(() =>
    loadFromStorage(STORAGE_KEYS.storeId, '', 'meadow.walmartStoreId.v1'),
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [sortByProtein, setSortByProtein] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUserSummary | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const applyingRemoteRef = useRef(false);
  const firebaseEnabled = isFirebaseConfigured();

  const currentUserStateRef = useRef<ForagerUserState>({
    recipes,
    plan,
    checkedMap,
    extraItems,
    walmartItemIds,
    walmartHistory,
    walmartFulfillment,
    walmartStoreId,
    updatedAt: '',
  });

  useEffect(() => {
    currentUserStateRef.current = {
      recipes,
      plan,
      checkedMap,
      extraItems,
      walmartItemIds,
      walmartHistory,
      walmartFulfillment,
      walmartStoreId,
      updatedAt: new Date().toISOString(),
    };
  }, [
    recipes,
    plan,
    checkedMap,
    extraItems,
    walmartItemIds,
    walmartHistory,
    walmartFulfillment,
    walmartStoreId,
  ]);

  useEffect(() => {
    preloadImageUrls(recipes.map((r) => r.image));
  }, [recipes]);

  useEffect(() => saveToStorage(STORAGE_KEYS.recipes, recipes), [recipes]);
  useEffect(() => saveToStorage(STORAGE_KEYS.plan, plan), [plan]);
  useEffect(() => saveToStorage(STORAGE_KEYS.checked, checkedMap), [checkedMap]);
  useEffect(() => saveToStorage(STORAGE_KEYS.extras, extraItems), [extraItems]);
  useEffect(() => saveToStorage(STORAGE_KEYS.walmartIds, walmartItemIds), [walmartItemIds]);
  useEffect(() => saveToStorage(STORAGE_KEYS.walmartHistory, walmartHistory), [walmartHistory]);
  useEffect(() => saveToStorage(STORAGE_KEYS.fulfillment, walmartFulfillment), [walmartFulfillment]);
  useEffect(() => saveToStorage(STORAGE_KEYS.storeId, walmartStoreId), [walmartStoreId]);

  // Subscribe to Firebase Auth state
  useEffect(() => {
    if (!firebaseEnabled) return;
    return subscribeToAuth((user) => {
      setFirebaseUser(user);
      if (!user) setCloudReady(false);
    });
  }, [firebaseEnabled]);

  // Load, merge, and subscribe to private Firestore state when signed in
  useEffect(() => {
    if (!firebaseUser) return;
    let active = true;
    let unsubscribeSnapshot: (() => void) | null = null;

    const applyState = (next: ForagerUserState) => {
      applyingRemoteRef.current = true;
      setRecipes(
        next.recipes.map((r) => (r.image?.startsWith('/images/') ? { ...r, image: `.${r.image}` } : r)),
      );
      setPlan(next.plan);
      setCheckedMap(next.checkedMap || {});
      setExtraItems(next.extraItems || []);
      setWalmartItemIds(next.walmartItemIds || {});
      setWalmartHistory(next.walmartHistory || []);
      setWalmartFulfillment(next.walmartFulfillment || 'pickup');
      setWalmartStoreId(next.walmartStoreId || '');
      window.setTimeout(() => {
        applyingRemoteRef.current = false;
      }, 50);
    };

    void (async () => {
      try {
        const cloud = await loadCloudState(firebaseUser.uid);
        if (!active) return;
        if (cloud) {
          const merged = mergeLocalAndCloudState(currentUserStateRef.current, cloud);
          applyState(merged);
          await saveCloudState(firebaseUser.uid, merged);
        } else {
          await saveCloudState(firebaseUser.uid, currentUserStateRef.current);
        }
        if (!active) return;
        setCloudReady(true);

        unsubscribeSnapshot = subscribeCloudState(firebaseUser.uid, (remote) => {
          if (!active) return;
          applyState(remote);
        });
      } catch {
        if (active) setCloudReady(false);
      }
    })();

    return () => {
      active = false;
      unsubscribeSnapshot?.();
    };
  }, [firebaseUser]);

  // Debounced sync to private Firestore document on any local edit while signed in
  useEffect(() => {
    if (!firebaseUser || !cloudReady || applyingRemoteRef.current) return;
    const timer = window.setTimeout(() => {
      void saveCloudState(firebaseUser.uid, currentUserStateRef.current).catch(() => {
        // Offline edits remain safe in localStorage and sync next time
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    firebaseUser,
    cloudReady,
    recipes,
    plan,
    checkedMap,
    extraItems,
    walmartItemIds,
    walmartHistory,
    walmartFulfillment,
    walmartStoreId,
  ]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((current) => (current === message ? null : current));
    }, 2400);
  };

  const handleGoogleSignIn = async () => {
    try {
      const user = await signInWithGoogle();
      if (user) {
        showToast(`Signed in as ${user.displayName || user.email || 'Google user'}`);
      }
    } catch {
      showToast('Sign-in was cancelled or unavailable');
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutUser();
    showToast('Signed out — data stays saved locally');
  };

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.id === selectedRecipeId) ?? null,
    [recipes, selectedRecipeId],
  );

  const groceryItems = useMemo(() => {
    const aggregated = aggregateGroceries(plan, recipes, checkedMap, walmartItemIds);
    const extrasWithState = extraItems.map((item) => ({
      ...item,
      checked: Boolean(checkedMap[item.id]),
      walmartItemId: walmartItemIds[item.id] ?? item.walmartItemId,
    }));
    return [...aggregated, ...extrasWithState];
  }, [plan, recipes, checkedMap, extraItems, walmartItemIds]);

  const remainingGroceryCount = useMemo(
    () => groceryItems.filter((item) => !item.checked).length,
    [groceryItems],
  );

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q)) ||
        r.notes.toLowerCase().includes(q),
    );
  }, [recipes, searchQuery]);

  const proteinGroups = useMemo(
    () => (sortByProtein ? groupRecipesByProtein(filteredRecipes) : []),
    [filteredRecipes, sortByProtein],
  );

  const spotlightRecipe = useMemo(
    () => (spotlightId ? recipes.find((r) => r.id === spotlightId) ?? null : null),
    [recipes, spotlightId],
  );

  const handleSurpriseMe = () => {
    const suggestion = suggestSerendipitousRecipe(recipes, plan, spotlightId ?? undefined);
    if (suggestion) {
      setSpotlightId(suggestion.recipe.id);
    }
  };

  const handleQuickPlanRecipe = (recipe: Recipe) => {
    const targetDay = findNextOpenDay(plan);
    const meal: PlannedMeal = {
      id: createId('meal'),
      dayIndex: targetDay,
      slot: DEFAULT_MEAL_SLOT,
      recipeId: recipe.id,
      servings: recipe.servings,
    };
    setPlan((prev) => [...prev, meal]);
    showToast(`Added "${recipe.title}" to your week`);
  };

  const handleAddRecipes = (incoming: Recipe[], addToWeek: boolean) => {
    setRecipes((prev) => [...incoming, ...prev]);

    if (addToWeek && incoming.length > 0) {
      setPlan((prev) => {
        const nextPlan = [...prev];
        for (const recipe of incoming) {
          const openDay = findNextOpenDay(nextPlan);
          nextPlan.push({
            id: createId('meal'),
            dayIndex: openDay,
            slot: DEFAULT_MEAL_SLOT,
            recipeId: recipe.id,
            servings: recipe.servings,
          });
        }
        return nextPlan;
      });
    }

    showToast(
      incoming.length === 1
        ? addToWeek
          ? `Added "${incoming[0].title}" to library & week`
          : `Added "${incoming[0].title}"`
        : `Imported ${incoming.length} recipes`,
    );
  };

  const handleUpdateRecipe = (updated: Recipe) => {
    setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleDeleteRecipe = (id: string) => {
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    setPlan((prev) => prev.filter((m) => m.recipeId !== id));
    if (spotlightId === id) setSpotlightId(null);
  };

  const handleAddMeal = (dayIndex: number, recipe: Recipe) => {
    const newMeal: PlannedMeal = {
      id: createId('meal'),
      dayIndex,
      slot: DEFAULT_MEAL_SLOT,
      recipeId: recipe.id,
      servings: recipe.servings,
    };
    setPlan((prev) => [...prev, newMeal]);
  };

  const handleUpdateMeal = (updated: PlannedMeal) => {
    setPlan((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  };

  const handleRemoveMeal = (mealId: string) => {
    setPlan((prev) => prev.filter((m) => m.id !== mealId));
  };

  const handleMoveMeal = (mealId: string, targetDayIndex: number) => {
    setPlan((prev) => moveMealToDay(prev, mealId, targetDayIndex));
  };

  const handleToggleGrocery = (id: string) => {
    setCheckedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddExtraItem = (rawText: string) => {
    const parsed = parseIngredient(rawText);
    const extra: GroceryItem = {
      id: createId('extra'),
      name: parsed.name,
      quantity: parsed.quantity,
      unit: parsed.unit,
      aisle: categorizeAisle(parsed.name),
      checked: false,
      sources: [],
      custom: true,
    };
    setExtraItems((prev) => [...prev, extra]);
  };

  const handleRemoveExtraItem = (id: string) => {
    setExtraItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleSetWalmartItemId = (groceryId: string, itemId: string) => {
    setWalmartItemIds((prev) => ({ ...prev, [groceryId]: itemId }));
    showToast('Linked Walmart product');
  };

  const handleImportWalmartHistory = (incoming: WalmartPurchaseItem[]) => {
    if (incoming.length === 0) return;
    setWalmartHistory((prev) => mergePurchaseHistory(prev, incoming));
    showToast(`Saved ${incoming.length} Walmart item${incoming.length === 1 ? '' : 's'} from your orders`);
  };

  const handleRemoveWalmartHistoryItem = (walmartItemId: string) => {
    setWalmartHistory((prev) => prev.filter((item) => item.walmartItemId !== walmartItemId));
  };

  const handleClearWalmartHistory = () => {
    setWalmartHistory([]);
    showToast('Cleared saved Walmart order history');
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-inner">
          <button
            type="button"
            className="brand"
            onClick={() => setView('recipes')}
            aria-label="Forager home"
          >
            <span className="brand-mark" aria-hidden="true">
              <Leaf size={14} />
            </span>
            forager
          </button>

          <nav className="nav-tabs" aria-label="Main navigation">
            <button
              type="button"
              className={`nav-tab ${view === 'recipes' ? 'active' : ''}`}
              onClick={() => setView('recipes')}
            >
              Recipes
            </button>
            <button
              type="button"
              className={`nav-tab ${view === 'week' ? 'active' : ''}`}
              onClick={() => setView('week')}
            >
              Week
              {plan.length > 0 && <span className="nav-count">{plan.length}</span>}
            </button>
            <button
              type="button"
              className={`nav-tab ${view === 'list' ? 'active' : ''}`}
              onClick={() => setView('list')}
            >
              List
              {remainingGroceryCount > 0 && (
                <span className="nav-count">{remainingGroceryCount}</span>
              )}
            </button>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            {firebaseEnabled &&
              (firebaseUser ? (
                <button
                  type="button"
                  className="avatar-btn"
                  title={`${firebaseUser.displayName || firebaseUser.email || 'Account'} · synced privately (click to sign out)`}
                  aria-label="Sign out"
                  onClick={() => void handleGoogleSignOut()}
                >
                  {firebaseUser.photoURL ? (
                    <img src={firebaseUser.photoURL} alt="" className="avatar-img" />
                  ) : (
                    <span>{(firebaseUser.displayName || firebaseUser.email || 'U')[0].toUpperCase()}</span>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-surface btn-sm"
                  onClick={() => void handleGoogleSignIn()}
                >
                  <LogIn size={14} />
                  Sign in
                </button>
              ))}
            {isChromeExtension() && (
              <button
                type="button"
                className="icon-btn"
                aria-label="Open Forager in full tab"
                title="Open in full tab"
                onClick={() => void openExtensionFullTab()}
              >
                <Maximize2 size={15} />
              </button>
            )}
            <button
              type="button"
              className="btn btn-sage"
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={15} />
              Add
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* Keep Recipes mounted with `hidden` so decoded photos stay cached and switch instantaneously */}
        <section aria-label="Recipe library" hidden={view !== 'recipes'}>
          <div className="view-header">
            <div>
              <h1 className="view-title">Your table</h1>
              <p className="view-subtitle">{recipes.length} recipes collected</p>
            </div>

            <div className="library-controls">
              <div className="search-wrap">
                <Search size={15} />
                <input
                  type="search"
                  className="search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search recipes or ingredients…"
                  aria-label="Search recipes"
                />
              </div>
              <button
                type="button"
                className={`btn ${sortByProtein ? 'btn-sage' : 'btn-surface'}`}
                aria-pressed={sortByProtein}
                onClick={() => setSortByProtein((prev) => !prev)}
              >
                <ArrowUpDown size={14} />
                By protein
              </button>
              <button
                type="button"
                className="btn btn-lavender"
                onClick={handleSurpriseMe}
              >
                <Sparkles size={15} />
                Surprise me
              </button>
            </div>
          </div>

          {spotlightRecipe && (
            <div className="discovery-whisper">
              <div className="discovery-left">
                {spotlightRecipe.image && (
                  <img
                    src={spotlightRecipe.image}
                    alt={spotlightRecipe.title}
                    className="discovery-thumb"
                    decoding="sync"
                  />
                )}
                <div>
                  <p className="discovery-eyebrow">A quiet idea for this week</p>
                  <p className="discovery-title">{spotlightRecipe.title}</p>
                </div>
              </div>
              <div className="discovery-actions">
                <button
                  type="button"
                  className="btn btn-surface btn-sm"
                  onClick={() => setSelectedRecipeId(spotlightRecipe.id)}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="btn btn-sage btn-sm"
                  onClick={() => {
                    handleQuickPlanRecipe(spotlightRecipe);
                    setSpotlightId(null);
                  }}
                >
                  Add to week
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Dismiss suggestion"
                  onClick={() => setSpotlightId(null)}
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          )}

          {filteredRecipes.length === 0 ? (
            <div className="empty-state">
              <h2>Nothing matched &ldquo;{searchQuery}&rdquo;</h2>
              <p>Try another ingredient or add something new to your library.</p>
            </div>
          ) : sortByProtein ? (
            <div className="protein-groups">
              {proteinGroups.map((group) => (
                <div key={group.protein} className="protein-group">
                  <div className="protein-group-header">
                    <h2 className="protein-group-heading">{group.protein}</h2>
                    <span className="protein-group-count">{group.recipes.length}</span>
                  </div>
                  <div className="recipe-grid">
                    {group.recipes.map((recipe) => (
                      <article
                        key={recipe.id}
                        className="recipe-card"
                        onClick={() => setSelectedRecipeId(recipe.id)}
                      >
                        <div className="recipe-card-media">
                          {recipe.image ? (
                            <img src={recipe.image} alt={recipe.title} decoding="sync" />
                          ) : (
                            <div className="recipe-card-fallback" aria-hidden="true">
                              {recipe.title.slice(0, 1)}
                            </div>
                          )}
                        </div>

                        <div className="recipe-card-body">
                          <h3 className="recipe-card-title">{recipe.title}</h3>
                          <p className="recipe-card-meta">
                            {[
                              recipe.prepMinutes ? `${recipe.prepMinutes} min` : null,
                              `${recipe.servings} servings`,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>

                        <button
                          type="button"
                          className="recipe-quick-plan"
                          aria-label={`Add ${recipe.title} to week`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickPlanRecipe(recipe);
                          }}
                        >
                          <CalendarPlus size={14} />
                          <span>Plan</span>
                        </button>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="recipe-grid">
              {filteredRecipes.map((recipe) => (
                <article
                  key={recipe.id}
                  className="recipe-card"
                  onClick={() => setSelectedRecipeId(recipe.id)}
                >
                  <div className="recipe-card-media">
                    {recipe.image ? (
                      <img src={recipe.image} alt={recipe.title} decoding="sync" />
                    ) : (
                      <div className="recipe-card-fallback" aria-hidden="true">
                        {recipe.title.slice(0, 1)}
                      </div>
                    )}
                  </div>

                  <div className="recipe-card-body">
                    <h2 className="recipe-card-title">{recipe.title}</h2>
                    <p className="recipe-card-meta">
                      {[
                        recipe.prepMinutes ? `${recipe.prepMinutes} min` : null,
                        `${recipe.servings} servings`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="recipe-quick-plan"
                    aria-label={`Add ${recipe.title} to week`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickPlanRecipe(recipe);
                    }}
                  >
                    <CalendarPlus size={14} />
                    <span>Plan</span>
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        {view === 'week' && (
          <WeekPlannerView
            recipes={recipes}
            plan={plan}
            onAddMeal={handleAddMeal}
            onUpdateMeal={handleUpdateMeal}
            onRemoveMeal={handleRemoveMeal}
            onMoveMeal={handleMoveMeal}
            onOpenRecipe={(recipe) => setSelectedRecipeId(recipe.id)}
            onGoToList={() => setView('list')}
          />
        )}

        {view === 'list' && (
          <GroceryListView
            items={groceryItems}
            fulfillment={walmartFulfillment}
            storeId={walmartStoreId}
            purchaseHistory={walmartHistory}
            onFulfillmentChange={setWalmartFulfillment}
            onStoreIdChange={setWalmartStoreId}
            onImportHistory={handleImportWalmartHistory}
            onRemoveHistoryItem={handleRemoveWalmartHistoryItem}
            onClearHistory={handleClearWalmartHistory}
            onToggleChecked={handleToggleGrocery}
            onAddExtraItem={handleAddExtraItem}
            onRemoveExtraItem={handleRemoveExtraItem}
            onSetWalmartItemId={handleSetWalmartItemId}
            onGoToWeek={() => setView('week')}
          />
        )}
      </main>

      {selectedRecipe && (
        <RecipeDetailModal
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipeId(null)}
          onUpdate={handleUpdateRecipe}
          onDelete={handleDeleteRecipe}
          onAddToWeek={(rec) => {
            handleQuickPlanRecipe(rec);
            setSelectedRecipeId(null);
          }}
        />
      )}

      {showAddModal && (
        <AddRecipeModal
          firebaseEnabled={firebaseEnabled}
          firebaseUser={firebaseUser}
          onSignInWithGoogle={handleGoogleSignIn}
          onClose={() => setShowAddModal(false)}
          onAddRecipes={handleAddRecipes}
        />
      )}

      {toast && (
        <div className="quiet-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
