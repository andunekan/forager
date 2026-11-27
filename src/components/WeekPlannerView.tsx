import { useRef, useState } from 'react';
import { ArrowRight, ArrowUpDown, GripVertical, Minus, Plus, Sparkles, X } from 'lucide-react';
import { formatIngredient, parseIngredient } from '../domain/ingredientParser';
import {
  DAYS_OF_WEEK,
  findNextOpenDay,
  FULL_DAYS,
  suggestSerendipitousRecipe,
} from '../domain/mealPlanner';
import { groupRecipesByProtein } from '../domain/proteinClassifier';
import { applyRecipeTransform, PRESET_TRANSFORMS } from '../domain/recipeTransforms';
import type { PlannedMeal, Recipe } from '../types/recipe';

interface WeekPlannerViewProps {
  recipes: Recipe[];
  plan: PlannedMeal[];
  onAddMeal: (dayIndex: number, recipe: Recipe) => void;
  onUpdateMeal: (meal: PlannedMeal) => void;
  onRemoveMeal: (mealId: string) => void;
  onMoveMeal: (mealId: string, targetDayIndex: number) => void;
  onOpenRecipe: (recipe: Recipe) => void;
  onGoToList: () => void;
}

export function WeekPlannerView({
  recipes,
  plan,
  onAddMeal,
  onUpdateMeal,
  onRemoveMeal,
  onMoveMeal,
  onOpenRecipe,
  onGoToList,
}: WeekPlannerViewProps) {
  const [pickingDay, setPickingDay] = useState<number | null>(null);
  const [adjustingMealId, setAdjustingMealId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSortByProtein, setPickerSortByProtein] = useState(false);

  const [draggingMealId, setDraggingMealId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const touchDragMealRef = useRef<string | null>(null);
  const touchTargetDayRef = useRef<number | null>(null);

  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const suggestion = suggestSerendipitousRecipe(recipes, plan);

  const adjustingMeal = adjustingMealId ? plan.find((m) => m.id === adjustingMealId) ?? null : null;
  const adjustingBaseRecipe = adjustingMeal ? recipeMap.get(adjustingMeal.recipeId) ?? null : null;

  const handleInspireNextDay = () => {
    if (!suggestion) return;
    const openDay = findNextOpenDay(plan);
    onAddMeal(openDay, suggestion.recipe);
  };

  const filteredPickerRecipes = recipes.filter((r) =>
    r.title.toLowerCase().includes(pickerSearch.trim().toLowerCase()),
  );
  const pickerProteinGroups = pickerSortByProtein
    ? groupRecipesByProtein(filteredPickerRecipes)
    : [];

  const handleTouchMoveOnHandle = (e: React.TouchEvent) => {
    if (!touchDragMealRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const dayEl = el?.closest<HTMLElement>('[data-day-index]');
    if (dayEl) {
      const idx = Number(dayEl.dataset.dayIndex);
      if (Number.isFinite(idx)) {
        touchTargetDayRef.current = idx;
        setDragOverDay(idx);
      }
    }
  };

  const handleTouchEndOnHandle = () => {
    const mealId = touchDragMealRef.current;
    const targetDay = touchTargetDayRef.current;
    if (mealId && targetDay !== null) {
      onMoveMeal(mealId, targetDay);
    }
    touchDragMealRef.current = null;
    touchTargetDayRef.current = null;
    setDraggingMealId(null);
    setDragOverDay(null);
  };

  return (
    <section aria-label="Weekly meal planner">
      <div className="view-header">
        <div>
          <h1 className="view-title">Next week</h1>
          <p className="view-subtitle">
            {plan.length === 0
              ? 'Sketch out one meal for each day you plan to cook.'
              : `${plan.length} meal${plan.length === 1 ? '' : 's'} planned · drag to move days`}
          </p>
        </div>

        <div className="library-controls">
          {suggestion && (
            <button type="button" className="btn btn-blush" onClick={handleInspireNextDay}>
              <Sparkles size={15} />
              Inspire a meal
            </button>
          )}
          <button type="button" className="btn btn-sage" onClick={onGoToList}>
            Ingredients
            <ArrowRight size={15} />
          </button>
        </div>
      </div>

      <div className="week-grid">
        {DAYS_OF_WEEK.map((day, dayIndex) => {
          const dayMeals = plan.filter((m) => m.dayIndex === dayIndex);
          const isDropTarget = dragOverDay === dayIndex && draggingMealId !== null;

          return (
            <div
              key={day}
              data-day-index={dayIndex}
              aria-label={FULL_DAYS[dayIndex]}
              className={`day-column day-column-single ${isDropTarget ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverDay !== dayIndex) setDragOverDay(dayIndex);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setDragOverDay((prev) => (prev === dayIndex ? null : prev));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const mealId = draggingMealId || e.dataTransfer.getData('text/plain');
                if (mealId) {
                  onMoveMeal(mealId, dayIndex);
                }
                setDraggingMealId(null);
                setDragOverDay(null);
              }}
            >
              <div className="day-header">
                <span className="day-name">{day}</span>
              </div>

              <div className="day-meal-body">
                {dayMeals.map((meal) => {
                  const baseRecipe = recipeMap.get(meal.recipeId);
                  if (!baseRecipe) return null;
                  const displayTitle = meal.customTitle || baseRecipe.title;
                  const isDragging = draggingMealId === meal.id;

                  return (
                    <div
                      key={meal.id}
                      draggable
                      className={`planned-meal-card slot-dinner ${isDragging ? 'dragging' : ''}`}
                      onDragStart={(e) => {
                        setDraggingMealId(meal.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', meal.id);
                      }}
                      onDragEnd={() => {
                        setDraggingMealId(null);
                        setDragOverDay(null);
                      }}
                    >
                      <span
                        className="meal-drag-handle"
                        aria-label={`Drag ${displayTitle} to another day`}
                        title="Drag to another day"
                        onTouchStart={() => {
                          touchDragMealRef.current = meal.id;
                          touchTargetDayRef.current = meal.dayIndex;
                          setDraggingMealId(meal.id);
                          setDragOverDay(meal.dayIndex);
                        }}
                        onTouchMove={handleTouchMoveOnHandle}
                        onTouchEnd={handleTouchEndOnHandle}
                        onTouchCancel={handleTouchEndOnHandle}
                      >
                        <GripVertical size={14} />
                      </span>

                      <button
                        type="button"
                        className="planned-meal-media"
                        aria-label={`Open ${displayTitle}`}
                        onClick={() => onOpenRecipe(baseRecipe)}
                      >
                        {baseRecipe.image ? (
                          <img
                            src={baseRecipe.image}
                            alt=""
                            className="planned-meal-thumb"
                            decoding="sync"
                          />
                        ) : (
                          <span className="planned-meal-fallback" aria-hidden="true">
                            {displayTitle.slice(0, 1)}
                          </span>
                        )}
                      </button>

                      <div className="planned-meal-content">
                        <div className="planned-meal-top">
                          <button
                            type="button"
                            className="planned-meal-title"
                            onClick={() => onOpenRecipe(baseRecipe)}
                          >
                            {displayTitle}
                          </button>
                          <button
                            type="button"
                            className="planned-meal-remove"
                            aria-label={`Remove ${displayTitle}`}
                            onClick={() => onRemoveMeal(meal.id)}
                          >
                            <X size={13} />
                          </button>
                        </div>

                        <div className="planned-meal-footer">
                          <div className="servings-stepper" aria-label="Servings">
                            <button
                              type="button"
                              aria-label="Decrease servings"
                              onClick={() =>
                                onUpdateMeal({
                                  ...meal,
                                  servings: Math.max(1, meal.servings - 1),
                                })
                              }
                            >
                              <Minus size={11} />
                            </button>
                            <span>{meal.servings}</span>
                            <button
                              type="button"
                              aria-label="Increase servings"
                              onClick={() =>
                                onUpdateMeal({ ...meal, servings: meal.servings + 1 })
                              }
                            >
                              <Plus size={11} />
                            </button>
                          </div>

                          <button
                            type="button"
                            className="adjust-link"
                            onClick={() => setAdjustingMealId(meal.id)}
                          >
                            Adjust
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {dayMeals.length === 0 && (
                  <button
                    type="button"
                    className="slot-add-btn slot-add-day"
                    aria-label={`Add meal for ${FULL_DAYS[dayIndex]}`}
                    onClick={() => {
                      setPickerSearch('');
                      setPickingDay(dayIndex);
                    }}
                  >
                    <Plus size={14} />
                    <span>Add meal</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recipe Picker Modal */}
      {pickingDay !== null && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickingDay(null);
          }}
        >
          <div className="modal-sheet narrow" role="dialog" aria-modal="true" aria-label="Pick a recipe">
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize: '1.2rem' }}>{FULL_DAYS[pickingDay]}</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => setPickingDay(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  className="field-input"
                  placeholder="Find a recipe…"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className={`btn btn-sm ${pickerSortByProtein ? 'btn-sage' : 'btn-surface'}`}
                  aria-pressed={pickerSortByProtein}
                  style={{ flexShrink: 0 }}
                  onClick={() => setPickerSortByProtein((prev) => !prev)}
                >
                  <ArrowUpDown size={13} />
                  Protein
                </button>
              </div>

              {suggestion && !pickerSearch && (
                <button
                  type="button"
                  className="picker-item"
                  style={{
                    background: 'rgba(249, 232, 223, 0.5)',
                    borderColor: '#f0d8cb',
                  }}
                  onClick={() => {
                    onAddMeal(pickingDay, suggestion.recipe);
                    setPickingDay(null);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {suggestion.recipe.image && (
                      <img src={suggestion.recipe.image} alt="" className="picker-thumb" />
                    )}
                    <div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--blush-ink)' }}>
                        {suggestion.reason}
                      </div>
                      <div style={{ fontWeight: 500, fontSize: '0.92rem' }}>
                        {suggestion.recipe.title}
                      </div>
                    </div>
                  </div>
                  <Sparkles size={15} color="var(--blush-ink)" />
                </button>
              )}

              <div className="picker-list">
                {pickerSortByProtein
                  ? pickerProteinGroups.map((group) => (
                      <div key={group.protein} className="picker-protein-group">
                        <div className="picker-protein-label">{group.protein}</div>
                        {group.recipes.map((rec) => (
                          <button
                            key={rec.id}
                            type="button"
                            className="picker-item"
                            onClick={() => {
                              onAddMeal(pickingDay, rec);
                              setPickingDay(null);
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              {rec.image && <img src={rec.image} alt="" className="picker-thumb" />}
                              <div>
                                <div style={{ fontWeight: 500, fontSize: '0.92rem' }}>{rec.title}</div>
                                <div className="recipe-card-meta">
                                  {[
                                    rec.prepMinutes ? `${rec.prepMinutes} min` : null,
                                    `${rec.servings} servings`,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </div>
                              </div>
                            </div>
                            <Plus size={15} color="var(--ink-muted)" />
                          </button>
                        ))}
                      </div>
                    ))
                  : filteredPickerRecipes.map((rec) => (
                      <button
                        key={rec.id}
                        type="button"
                        className="picker-item"
                        onClick={() => {
                          onAddMeal(pickingDay, rec);
                          setPickingDay(null);
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {rec.image && <img src={rec.image} alt="" className="picker-thumb" />}
                          <div>
                            <div style={{ fontWeight: 500, fontSize: '0.92rem' }}>{rec.title}</div>
                            <div className="recipe-card-meta">
                              {[
                                rec.prepMinutes ? `${rec.prepMinutes} min` : null,
                                `${rec.servings} servings`,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          </div>
                        </div>
                        <Plus size={15} color="var(--ink-muted)" />
                      </button>
                    ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Per-Meal Adjustment Modal */}
      {adjustingMeal && adjustingBaseRecipe && (
        <AdjustPlannedMealModal
          meal={adjustingMeal}
          baseRecipe={adjustingBaseRecipe}
          onClose={() => setAdjustingMealId(null)}
          onSave={(updated) => {
            onUpdateMeal(updated);
            setAdjustingMealId(null);
          }}
        />
      )}
    </section>
  );
}

interface AdjustPlannedMealModalProps {
  meal: PlannedMeal;
  baseRecipe: Recipe;
  onClose: () => void;
  onSave: (updated: PlannedMeal) => void;
}

function AdjustPlannedMealModal({
  meal,
  baseRecipe,
  onClose,
  onSave,
}: AdjustPlannedMealModalProps) {
  const activeIngredients = meal.customIngredients ?? baseRecipe.ingredients;
  const [servings, setServings] = useState(meal.servings);
  const [ingredientsText, setIngredientsText] = useState(
    activeIngredients.map((i) => formatIngredient(i)).join('\n'),
  );
  const [notes, setNotes] = useState(meal.customNotes ?? baseRecipe.notes);
  const [customTransform, setCustomTransform] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const runMealTransform = (prompt: string) => {
    const tempRecipe: Recipe = {
      ...baseRecipe,
      ingredients: ingredientsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => parseIngredient(l)),
      notes,
    };
    const result = applyRecipeTransform(tempRecipe, prompt);
    setIngredientsText(result.recipe.ingredients.map((i) => formatIngredient(i)).join('\n'));
    setFeedback(result.summary);
    setCustomTransform('');
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-sheet narrow"
        role="dialog"
        aria-modal="true"
        aria-label={`Adjust ${baseRecipe.title}`}
      >
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>{baseRecipe.title}</h2>
            <p className="recipe-card-meta">{FULL_DAYS[meal.dayIndex]}</p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Servings for this meal</span>
            <div className="servings-stepper" style={{ padding: '0.25rem 0.5rem', gap: '0.6rem' }}>
              <button
                type="button"
                aria-label="Decrease meal servings"
                onClick={() => setServings((s) => Math.max(1, s - 1))}
              >
                <Minus size={13} />
              </button>
              <span style={{ fontSize: '0.9rem', minWidth: '18px', textAlign: 'center' }}>
                {servings}
              </span>
              <button
                type="button"
                aria-label="Increase meal servings"
                onClick={() => setServings((s) => s + 1)}
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          <div className="transform-panel">
            <div className="transform-presets">
              {PRESET_TRANSFORMS.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="transform-chip"
                  onClick={() => runMealTransform(p.prompt)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <form
              className="transform-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (customTransform.trim()) runMealTransform(customTransform);
              }}
            >
              <input
                type="text"
                className="field-input"
                value={customTransform}
                onChange={(e) => setCustomTransform(e.target.value)}
                placeholder='Adjust just this meal… e.g. "substitute the dairy"'
              />
              <button type="submit" className="btn btn-lavender btn-sm">
                Apply
              </button>
            </form>
            {feedback && (
              <div className="transform-feedback">
                <span>{feedback}</span>
              </div>
            )}
          </div>

          <div>
            <label className="field-label" htmlFor="meal-ingredients">
              Ingredients for this night (base recipe stays untouched)
            </label>
            <textarea
              id="meal-ingredients"
              rows={6}
              className="field-textarea"
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="meal-notes">
              Meal note
            </label>
            <input
              id="meal-notes"
              className="field-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Guests over — make dairy-free"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sage"
              onClick={() => {
                const parsedIngredients = ingredientsText
                  .split('\n')
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l) => parseIngredient(l));
                onSave({
                  ...meal,
                  servings,
                  customIngredients: parsedIngredients,
                  customNotes: notes,
                });
              }}
            >
              Save adjustments
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
