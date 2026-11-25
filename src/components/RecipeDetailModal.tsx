import { useState } from 'react';
import { CalendarPlus, Pencil, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { formatIngredient, parseIngredient } from '../domain/ingredientParser';
import { applyRecipeTransform, PRESET_TRANSFORMS } from '../domain/recipeTransforms';
import type { Recipe } from '../types/recipe';

interface RecipeDetailModalProps {
  recipe: Recipe;
  onClose: () => void;
  onUpdate: (updated: Recipe) => void;
  onDelete: (id: string) => void;
  onAddToWeek: (recipe: Recipe) => void;
}

export function RecipeDetailModal({
  recipe,
  onClose,
  onUpdate,
  onDelete,
  onAddToWeek,
}: RecipeDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(recipe.title);
  const [servings, setServings] = useState(String(recipe.servings));
  const [prepMinutes, setPrepMinutes] = useState(recipe.prepMinutes ? String(recipe.prepMinutes) : '');
  const [ingredientsText, setIngredientsText] = useState(
    recipe.ingredients.map((i) => formatIngredient(i)).join('\n'),
  );
  const [stepsText, setStepsText] = useState(recipe.steps.join('\n'));

  const [transformInput, setTransformInput] = useState('');
  const [transformSummary, setTransformSummary] = useState<string | null>(null);
  const [previousSnapshot, setPreviousSnapshot] = useState<Recipe | null>(null);

  const handleSaveEdit = () => {
    const nextIngredients = ingredientsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseIngredient(line));

    const nextSteps = stepsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const parsedServings = Math.max(1, parseInt(servings, 10) || recipe.servings);
    const parsedPrep = parseInt(prepMinutes, 10);

    onUpdate({
      ...recipe,
      title: title.trim() || recipe.title,
      servings: parsedServings,
      prepMinutes: Number.isFinite(parsedPrep) && parsedPrep > 0 ? parsedPrep : undefined,
      ingredients: nextIngredients,
      steps: nextSteps,
      updatedAt: new Date().toISOString(),
    });
    setIsEditing(false);
  };

  const handleTransform = (instruction: string) => {
    const result = applyRecipeTransform(recipe, instruction);
    if (result.changes.length > 0) {
      setPreviousSnapshot(recipe);
      onUpdate(result.recipe);
      setIngredientsText(result.recipe.ingredients.map((i) => formatIngredient(i)).join('\n'));
      setStepsText(result.recipe.steps.join('\n'));
    }
    setTransformSummary(result.summary);
    setTransformInput('');
  };

  const handleUndoTransform = () => {
    if (!previousSnapshot) return;
    onUpdate(previousSnapshot);
    setIngredientsText(previousSnapshot.ingredients.map((i) => formatIngredient(i)).join('\n'));
    setStepsText(previousSnapshot.steps.join('\n'));
    setPreviousSnapshot(null);
    setTransformSummary(null);
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-label={recipe.title}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '1.35rem' }}>{recipe.title}</h2>
            <p className="recipe-card-meta" style={{ marginTop: '0.15rem' }}>
              {[
                recipe.prepMinutes ? `${recipe.prepMinutes} min` : null,
                `${recipe.servings} servings`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              type="button"
              className="btn btn-sage btn-sm"
              onClick={() => onAddToWeek(recipe)}
            >
              <CalendarPlus size={14} />
              Plan
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={isEditing ? 'Cancel edit' : 'Edit recipe'}
              onClick={() => {
                setTitle(recipe.title);
                setServings(String(recipe.servings));
                setPrepMinutes(recipe.prepMinutes ? String(recipe.prepMinutes) : '');
                setIngredientsText(recipe.ingredients.map((i) => formatIngredient(i)).join('\n'));
                setStepsText(recipe.steps.join('\n'));
                setIsEditing(!isEditing);
              }}
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Delete recipe"
              onClick={() => {
                onDelete(recipe.id);
                onClose();
              }}
            >
              <Trash2 size={16} />
            </button>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          {recipe.image && !isEditing && (
            <img
              src={recipe.image}
              alt={recipe.title}
              className="recipe-hero-img"
              decoding="sync"
            />
          )}

          {!isEditing ? (
            <>
              {/* Calm Transform Studio */}
              <div className="transform-panel">
                <div className="transform-presets">
                  {PRESET_TRANSFORMS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="transform-chip"
                      onClick={() => handleTransform(preset.prompt)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <form
                  className="transform-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (transformInput.trim()) handleTransform(transformInput);
                  }}
                >
                  <input
                    type="text"
                    className="field-input"
                    value={transformInput}
                    onChange={(e) => setTransformInput(e.target.value)}
                    placeholder='Transform… e.g. "substitute the dairy", "double the garlic", "swap butter for olive oil"'
                    aria-label="Transform recipe"
                  />
                  <button type="submit" className="btn btn-lavender btn-sm">
                    <Sparkles size={14} />
                    Apply
                  </button>
                </form>

                {transformSummary && (
                  <div className="transform-feedback">
                    <span>{transformSummary}</span>
                    {previousSnapshot && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={handleUndoTransform}
                      >
                        <RotateCcw size={13} />
                        Undo
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="recipe-columns">
                <div>
                  <h3 className="section-heading">Ingredients</h3>
                  <ul className="ingredient-list">
                    {recipe.ingredients.map((ing) => (
                      <li key={ing.id}>{formatIngredient(ing)}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="section-heading">Method</h3>
                  <ol className="step-list">
                    {recipe.steps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="notes-box">
                <label htmlFor={`notes-${recipe.id}`}>Notes</label>
                <textarea
                  id={`notes-${recipe.id}`}
                  value={recipe.notes}
                  onChange={(e) =>
                    onUpdate({
                      ...recipe,
                      notes: e.target.value,
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  placeholder="Jot down tweaks, pairings, or memories…"
                />
              </div>

              {recipe.sourceUrl && (
                <a
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-link"
                  style={{ alignSelf: 'flex-start' }}
                >
                  Original recipe ↗
                </a>
              )}
            </>
          ) : (
            <div className="form-grid">
              <div>
                <label className="field-label" htmlFor="edit-title">
                  Title
                </label>
                <input
                  id="edit-title"
                  className="field-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div>
                  <label className="field-label" htmlFor="edit-servings">
                    Servings
                  </label>
                  <input
                    id="edit-servings"
                    type="number"
                    min={1}
                    className="field-input"
                    value={servings}
                    onChange={(e) => setServings(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="edit-prep">
                    Minutes
                  </label>
                  <input
                    id="edit-prep"
                    type="number"
                    min={1}
                    className="field-input"
                    value={prepMinutes}
                    onChange={(e) => setPrepMinutes(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="edit-ingredients">
                  Ingredients (one per line)
                </label>
                <textarea
                  id="edit-ingredients"
                  rows={6}
                  className="field-textarea"
                  value={ingredientsText}
                  onChange={(e) => setIngredientsText(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="edit-steps">
                  Steps (one per line)
                </label>
                <textarea
                  id="edit-steps"
                  rows={5}
                  className="field-textarea"
                  value={stepsText}
                  onChange={(e) => setStepsText(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </button>
                <button type="button" className="btn btn-sage" onClick={handleSaveEdit}>
                  Save changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
