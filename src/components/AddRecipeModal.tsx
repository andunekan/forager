import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Download,
  FileSpreadsheet,
  Globe,
  Link2,
  RotateCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  parseCsvRecipes,
  parseOcrRecipeText,
  parseRecipeFromHtml,
  parseSpreadsheetBuffer,
  SAMPLE_SPREADSHEET_CSV,
} from '../domain/importers';
import { createId, formatIngredient, parseIngredient } from '../domain/ingredientParser';
import {
  extractRecipeWithGeminiVision,
  preprocessPhotoForOcr,
} from '../domain/photoOcr';
import { importRecipeFromActiveTab, isChromeExtension } from '../extension/chromeBridge';
import type { Recipe } from '../types/recipe';
import { loadFromStorage, saveToStorage } from '../utils/storage';

type ImportTab = 'write' | 'link' | 'photo' | 'spreadsheet';

const GEMINI_KEY_STORAGE = 'forager.geminiApiKey.v1';

interface AddRecipeModalProps {
  onClose: () => void;
  onAddRecipes: (recipes: Recipe[], addToWeek: boolean) => void;
}

export function AddRecipeModal({ onClose, onAddRecipes }: AddRecipeModalProps) {
  const [tab, setTab] = useState<ImportTab>('write');
  const [addToWeek, setAddToWeek] = useState(true);

  // Manual write form state
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState('4');
  const [prepMinutes, setPrepMinutes] = useState('25');
  const [ingredientsText, setIngredientsText] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [notes, setNotes] = useState('');

  // Link import state
  const [urlInput, setUrlInput] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [urlPreview, setUrlPreview] = useState<Recipe | null>(null);
  const [fallbackPaste, setFallbackPaste] = useState('');

  // Photo / Camera OCR & Vision state
  const [rawPhotoUrl, setRawPhotoUrl] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoRotation, setPhotoRotation] = useState(0);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [scannedTitle, setScannedTitle] = useState('');
  const [scannedServings, setScannedServings] = useState('4');
  const [scannedMinutes, setScannedMinutes] = useState('');
  const [scannedIngredients, setScannedIngredients] = useState('');
  const [scannedSteps, setScannedSteps] = useState('');
  const [scannedNotes, setScannedNotes] = useState('');
  const [hasScannedResult, setHasScannedResult] = useState(false);

  const [geminiApiKey, setGeminiApiKey] = useState<string>(() =>
    loadFromStorage(GEMINI_KEY_STORAGE, ''),
  );
  const [showVisionSettings, setShowVisionSettings] = useState(false);

  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Spreadsheet state
  const [sheetPreview, setSheetPreview] = useState<Recipe[]>([]);
  const [sheetError, setSheetError] = useState<string | null>(null);

  useEffect(() => {
    saveToStorage(GEMINI_KEY_STORAGE, geminiApiKey.trim());
  }, [geminiApiKey]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const applyScannedRecipeToFields = (rec: Recipe) => {
    setScannedTitle(rec.title);
    setScannedServings(String(rec.servings || 4));
    setScannedMinutes(rec.prepMinutes ? String(rec.prepMinutes) : '');
    setScannedIngredients(rec.ingredients.map((i) => formatIngredient(i)).join('\n'));
    setScannedSteps(rec.steps.join('\n'));
    setScannedNotes(rec.notes || '');
    setHasScannedResult(true);
  };

  const handleSaveManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const now = new Date().toISOString();
    const recipe: Recipe = {
      id: createId('rec'),
      title: title.trim(),
      servings: Math.max(1, parseInt(servings, 10) || 4),
      prepMinutes: parseInt(prepMinutes, 10) || undefined,
      ingredients: ingredientsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => parseIngredient(l)),
      steps: stepsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      notes: notes.trim(),
      sourceType: 'manual',
      createdAt: now,
      updatedAt: now,
    };
    onAddRecipes([recipe], addToWeek);
    onClose();
  };

  const handleSaveScannedPhoto = () => {
    if (!scannedTitle.trim()) return;
    const now = new Date().toISOString();
    const recipe: Recipe = {
      id: createId('rec'),
      title: scannedTitle.trim(),
      image: photoPreview ?? undefined,
      servings: Math.max(1, parseInt(scannedServings, 10) || 4),
      prepMinutes: parseInt(scannedMinutes, 10) || undefined,
      ingredients: scannedIngredients
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => parseIngredient(l)),
      steps: scannedSteps
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      notes: scannedNotes.trim(),
      sourceType: 'photo',
      createdAt: now,
      updatedAt: now,
    };
    onAddRecipes([recipe], addToWeek);
    onClose();
  };

  const handleFetchLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    setLinkLoading(true);
    setLinkError(null);
    setUrlPreview(null);

    try {
      const resp = await fetch('/api/fetch-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await resp.json()) as { html?: string; url?: string; error?: string };

      if (!resp.ok || !data.html) {
        setLinkError(
          data.error || 'Could not fetch that link directly — paste the recipe text below instead.',
        );
      } else {
        const parsed = parseRecipeFromHtml(data.html, data.url || trimmed);
        if (parsed) {
          setUrlPreview(parsed);
        } else {
          setLinkError('No structured recipe found on that page — paste the recipe text below.');
        }
      }
    } catch {
      setLinkError('Could not reach that link — you can paste the recipe text below instead.');
    } finally {
      setLinkLoading(false);
    }
  };

  const runPhotoRecognition = async (sourceDataUrl: string, rotationDeg: number) => {
    setOcrBusy(true);
    setOcrStatus('Enhancing photo contrast…');

    let displayUrl = sourceDataUrl;
    let ocrUrl = sourceDataUrl;
    try {
      const processed = await preprocessPhotoForOcr(sourceDataUrl, rotationDeg);
      displayUrl = processed.displayDataUrl;
      ocrUrl = processed.ocrDataUrl;
      setPhotoPreview(displayUrl);
    } catch {
      setPhotoPreview(sourceDataUrl);
    }

    const trimmedKey = geminiApiKey.trim();
    if (trimmedKey) {
      setOcrStatus('Reading recipe with Gemini Vision…');
      try {
        const visionRecipe = await extractRecipeWithGeminiVision(displayUrl, trimmedKey);
        applyScannedRecipeToFields(visionRecipe);
        setOcrStatus('Recognized with Gemini Vision — review and save below.');
        setOcrBusy(false);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gemini Vision failed';
        setOcrStatus(`${msg} Falling back to local OCR…`);
      }
    }

    setOcrStatus('Reading printed text locally…');
    try {
      const Tesseract = await import('tesseract.js');
      const { data } = await Tesseract.recognize(ocrUrl, 'eng', {
        logger: (m: { status?: string; progress?: number }) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            setOcrStatus(`Reading printed text… ${Math.round(m.progress * 100)}%`);
          }
        },
      });
      const recognized = data.text.trim();
      if (recognized) {
        const parsed = parseOcrRecipeText(recognized, displayUrl);
        applyScannedRecipeToFields(parsed);
        setOcrStatus(
          'Review or refine below. For handwritten or magazine pages, add an optional Gemini Vision key above.',
        );
      } else {
        setHasScannedResult(true);
        setOcrStatus('Could not read text clearly — rotate photo, add a Gemini Vision key, or type below.');
      }
    } catch {
      setHasScannedResult(true);
      setOcrStatus('Photo ready — enter or adjust the recipe fields below.');
    } finally {
      setOcrBusy(false);
    }
  };

  const handlePhotoFile = (file: File | undefined) => {
    if (!file) return;
    stopCamera();
    setPhotoRotation(0);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setRawPhotoUrl(dataUrl);
      setPhotoPreview(dataUrl);
      void runPhotoRecognition(dataUrl, 0);
    };
    reader.readAsDataURL(file);
  };

  const handleRotatePhoto = () => {
    if (!rawPhotoUrl) return;
    const nextRot = (photoRotation + 90) % 360;
    setPhotoRotation(nextRot);
    void runPhotoRecognition(rawPhotoUrl, nextRot);
  };

  const handleStartCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setOcrStatus('Camera unavailable here — choose a photo from your device instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 60);
    } catch {
      setOcrStatus('Camera permission declined — choose a photo from your device instead.');
    }
  };

  const handleSnapCamera = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 960;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      stopCamera();
      setPhotoRotation(0);
      setRawPhotoUrl(dataUrl);
      setPhotoPreview(dataUrl);
      void runPhotoRecognition(dataUrl, 0);
    }
  };

  const handleSpreadsheetFile = async (file: File | undefined) => {
    if (!file) return;
    setSheetError(null);
    try {
      const lowerName = file.name.toLowerCase();
      let parsed: Recipe[] = [];
      if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || file.type === 'text/csv') {
        const text =
          typeof file.text === 'function'
            ? await file.text()
            : await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result ?? ''));
                reader.onerror = () => reject(reader.error);
                reader.readAsText(file);
              });
        parsed = parseCsvRecipes(text);
      } else {
        const buffer = await file.arrayBuffer();
        parsed = parseSpreadsheetBuffer(buffer);
      }

      if (parsed.length === 0) {
        setSheetError('No recipes found. Include a Title and Ingredients column.');
      } else {
        setSheetPreview(parsed);
      }
    } catch {
      setSheetError('Could not read that spreadsheet. Try a .csv or .xlsx file.');
    }
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([SAMPLE_SPREADSHEET_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'forager-recipes-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopCamera();
          onClose();
        }
      }}
    >
      <div className="modal-sheet narrow" role="dialog" aria-modal="true" aria-label="Add a recipe">
        <div className="modal-header">
          <h2 style={{ fontSize: '1.3rem' }}>Add a recipe</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={() => {
              stopCamera();
              onClose();
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="import-tabs" role="tablist" aria-label="Add recipe method">
            {(
              [
                ['write', 'Write'],
                ['link', 'Link'],
                ['photo', 'Photo'],
                ['spreadsheet', 'Spreadsheet'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className="import-tab"
                onClick={() => {
                  if (key !== 'photo') stopCamera();
                  setTab(key);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="plan-toggle-row">
            <input
              type="checkbox"
              className="grocery-checkbox"
              checked={addToWeek}
              onChange={(e) => setAddToWeek(e.target.checked)}
            />
            <span>Also add to this week&apos;s meals &amp; grocery list</span>
          </label>

          {tab === 'write' && (
            <form className="form-grid" onSubmit={handleSaveManual}>
              <div>
                <label className="field-label" htmlFor="new-title">
                  Recipe name
                </label>
                <input
                  id="new-title"
                  className="field-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Roasted Fennel & Citrus Pasta"
                  required
                />
              </div>

              <div className="form-row">
                <div>
                  <label className="field-label" htmlFor="new-servings">
                    Servings
                  </label>
                  <input
                    id="new-servings"
                    type="number"
                    min={1}
                    className="field-input"
                    value={servings}
                    onChange={(e) => setServings(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="new-minutes">
                    Minutes
                  </label>
                  <input
                    id="new-minutes"
                    type="number"
                    min={1}
                    className="field-input"
                    value={prepMinutes}
                    onChange={(e) => setPrepMinutes(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="new-ingredients">
                  Ingredients (one per line)
                </label>
                <textarea
                  id="new-ingredients"
                  rows={5}
                  className="field-textarea"
                  value={ingredientsText}
                  onChange={(e) => setIngredientsText(e.target.value)}
                  placeholder={'1 lb pasta\n2 tbsp olive oil\n1 lemon, zested'}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="new-steps">
                  Method (one step per line)
                </label>
                <textarea
                  id="new-steps"
                  rows={4}
                  className="field-textarea"
                  value={stepsText}
                  onChange={(e) => setStepsText(e.target.value)}
                  placeholder="Boil pasta until al dente…"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="new-notes">
                  Notes
                </label>
                <input
                  id="new-notes"
                  className="field-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional personal note"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-ghost" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-sage">
                  Save recipe
                </button>
              </div>
            </form>
          )}

          {tab === 'link' && (
            <div className="form-grid">
              {isChromeExtension() && (
                <button
                  type="button"
                  className="btn btn-sage"
                  disabled={linkLoading}
                  onClick={async () => {
                    setLinkLoading(true);
                    setLinkError(null);
                    setUrlPreview(null);
                    const result = await importRecipeFromActiveTab();
                    if (result.recipe) {
                      setUrlPreview(result.recipe);
                    } else {
                      setLinkError(result.error || 'Could not read recipe from current tab.');
                    }
                    setLinkLoading(false);
                  }}
                >
                  <Globe size={15} />
                  {linkLoading ? 'Reading current tab…' : 'Save recipe from current tab'}
                </button>
              )}

              <form onSubmit={handleFetchLink} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="url"
                  className="field-input"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://…"
                  aria-label="Recipe URL"
                  required
                />
                <button type="submit" className="btn btn-mist" disabled={linkLoading}>
                  <Link2 size={15} />
                  {linkLoading ? 'Fetching…' : 'Import'}
                </button>
              </form>

              {linkError && (
                <div className="form-grid">
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--blush-ink)' }}>
                    {linkError}
                  </p>
                  <textarea
                    rows={6}
                    className="field-textarea"
                    value={fallbackPaste}
                    onChange={(e) => setFallbackPaste(e.target.value)}
                    placeholder="Paste recipe title, ingredients, and steps here…"
                  />
                  {fallbackPaste.trim() && (
                    <button
                      type="button"
                      className="btn btn-sage"
                      style={{ alignSelf: 'flex-end' }}
                      onClick={() => {
                        const parsed = parseOcrRecipeText(fallbackPaste);
                        onAddRecipes(
                          [{ ...parsed, sourceType: 'url', sourceUrl: urlInput.trim() || undefined }],
                          addToWeek,
                        );
                        onClose();
                      }}
                    >
                      Save pasted recipe
                    </button>
                  )}
                </div>
              )}

              {urlPreview && (
                <div className="aisle-card" style={{ padding: '1rem' }}>
                  <h3 className="section-heading">{urlPreview.title}</h3>
                  <p className="recipe-card-meta" style={{ marginBottom: '0.65rem' }}>
                    {urlPreview.ingredients.length} ingredients · {urlPreview.servings} servings
                  </p>
                  <ul className="ingredient-list" style={{ marginBottom: '0.9rem' }}>
                    {urlPreview.ingredients.slice(0, 6).map((i) => (
                      <li key={i.id}>{formatIngredient(i)}</li>
                    ))}
                    {urlPreview.ingredients.length > 6 && (
                      <li style={{ color: 'var(--ink-muted)' }}>
                        +{urlPreview.ingredients.length - 6} more
                      </li>
                    )}
                  </ul>
                  <button
                    type="button"
                    className="btn btn-sage"
                    onClick={() => {
                      onAddRecipes([urlPreview], addToWeek);
                      onClose();
                    }}
                  >
                    Add recipe
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'photo' && (
            <div className="form-grid">
              {/* Optional AI Vision setting for handwritten / magazine recipes */}
              <div className="bookmarklet-card" style={{ padding: '0.7rem 0.9rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: '0.82rem', color: 'var(--lavender-ink)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Sparkles size={14} />
                    {geminiApiKey.trim()
                      ? 'Gemini Vision active (high accuracy)'
                      : 'AI Vision optional (best for handwriting & cookbooks)'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowVisionSettings((v) => !v)}
                  >
                    {showVisionSettings ? 'Hide' : geminiApiKey.trim() ? 'Key saved' : 'Add key'}
                  </button>
                </div>

                {showVisionSettings && (
                  <div className="form-grid" style={{ marginTop: '0.6rem', gap: '0.45rem' }}>
                    <input
                      type="password"
                      className="field-input"
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder="Paste free Gemini API key (stored only in your browser)"
                      aria-label="Gemini API key"
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                      Stored privately in localStorage. Photos go straight from your browser to
                      Google&apos;s Gemini 2.5 Flash API.
                    </span>
                  </div>
                )}
              </div>

              {cameraActive ? (
                <div className="form-grid">
                  <video ref={videoRef} className="camera-preview" playsInline muted />
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button type="button" className="btn btn-sage" onClick={handleSnapCamera}>
                      <Camera size={15} />
                      Capture
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={stopCamera}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <label className="dropzone" style={{ flex: 1 }}>
                    <Upload size={20} color="var(--sage-ink)" />
                    <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>
                      Upload recipe photo
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      aria-label="Upload recipe photo"
                      onChange={(e) => handlePhotoFile(e.target.files?.[0])}
                    />
                  </label>
                  <button
                    type="button"
                    className="dropzone"
                    style={{ flex: 1 }}
                    onClick={handleStartCamera}
                  >
                    <Camera size={20} color="var(--lavender-ink)" />
                    <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>Take a picture</span>
                  </button>
                </div>
              )}

              {photoPreview && (
                <div className="form-grid" style={{ gap: '0.55rem' }}>
                  <img
                    src={photoPreview}
                    alt="Captured recipe"
                    className="recipe-hero-img"
                    style={{ maxHeight: '200px', objectFit: 'contain', background: 'var(--bg-subtle)' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
                      {ocrStatus || ''}
                    </span>
                    <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn btn-surface btn-sm"
                        disabled={ocrBusy}
                        onClick={handleRotatePhoto}
                      >
                        <RotateCw size={13} />
                        Rotate
                      </button>
                      <button
                        type="button"
                        className="btn btn-lavender btn-sm"
                        disabled={ocrBusy || !rawPhotoUrl}
                        onClick={() => {
                          if (rawPhotoUrl) void runPhotoRecognition(rawPhotoUrl, photoRotation);
                        }}
                      >
                        Rescan
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {hasScannedResult && (
                <div className="form-grid">
                  <div>
                    <label className="field-label" htmlFor="scan-title">
                      Recipe name
                    </label>
                    <input
                      id="scan-title"
                      className="field-input"
                      value={scannedTitle}
                      onChange={(e) => setScannedTitle(e.target.value)}
                    />
                  </div>

                  <div className="form-row">
                    <div>
                      <label className="field-label" htmlFor="scan-servings">
                        Servings
                      </label>
                      <input
                        id="scan-servings"
                        type="number"
                        min={1}
                        className="field-input"
                        value={scannedServings}
                        onChange={(e) => setScannedServings(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="scan-minutes">
                        Minutes
                      </label>
                      <input
                        id="scan-minutes"
                        type="number"
                        min={1}
                        className="field-input"
                        value={scannedMinutes}
                        onChange={(e) => setScannedMinutes(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="field-label" htmlFor="scan-ingredients">
                      Ingredients (one per line)
                    </label>
                    <textarea
                      id="scan-ingredients"
                      rows={5}
                      className="field-textarea"
                      value={scannedIngredients}
                      onChange={(e) => setScannedIngredients(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor="scan-steps">
                      Method (one step per line)
                    </label>
                    <textarea
                      id="scan-steps"
                      rows={4}
                      className="field-textarea"
                      value={scannedSteps}
                      onChange={(e) => setScannedSteps(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-sage"
                      disabled={!scannedTitle.trim() || ocrBusy}
                      onClick={handleSaveScannedPhoto}
                    >
                      Save recipe
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'spreadsheet' && (
            <div className="form-grid">
              <label className="dropzone">
                <FileSpreadsheet size={22} color="var(--sage-ink)" />
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                  Choose a .csv or .xlsx spreadsheet
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                  Columns: Title, Servings, Prep Minutes, Ingredients, Instructions, Notes
                </span>
                <input
                  type="file"
                  accept=".csv,.tsv,.xlsx,.xls,text/csv"
                  className="sr-only"
                  aria-label="Upload spreadsheet"
                  onChange={(e) => void handleSpreadsheetFile(e.target.files?.[0])}
                />
              </label>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ alignSelf: 'flex-start' }}
                onClick={handleDownloadTemplate}
              >
                <Download size={14} />
                Download sample CSV
              </button>

              {sheetError && (
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--blush-ink)' }}>
                  {sheetError}
                </p>
              )}

              {sheetPreview.length > 0 && (
                <div className="form-grid">
                  <div className="picker-list">
                    {sheetPreview.map((rec) => (
                      <div key={rec.id} className="picker-item" style={{ cursor: 'default' }}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{rec.title}</div>
                          <div className="recipe-card-meta">
                            {rec.ingredients.length} ingredients · {rec.servings} servings
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-sage"
                      onClick={() => {
                        onAddRecipes(sheetPreview, addToWeek);
                        onClose();
                      }}
                    >
                      Import {sheetPreview.length} recipe{sheetPreview.length === 1 ? '' : 's'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
