import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Download,
  FileSpreadsheet,
  Globe,
  Link2,
  Plus,
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
import {
  isFirebaseAppCheckConfigured,
  type FirebaseUserSummary,
} from '../firebase/firebaseClient';
import { extractRecipeWithFirebaseAi } from '../firebase/firebaseVision';
import type { Recipe } from '../types/recipe';
import { loadFromStorage, saveToStorage } from '../utils/storage';

type ImportTab = 'write' | 'link' | 'photo' | 'spreadsheet';

interface RecipePhotoPage {
  id: string;
  rawDataUrl: string;
  displayDataUrl: string;
  rotation: number;
}

const GEMINI_KEY_STORAGE = 'forager.geminiApiKey.v1';

interface AddRecipeModalProps {
  firebaseEnabled?: boolean;
  firebaseUser?: FirebaseUserSummary | null;
  onSignInWithGoogle?: () => Promise<void>;
  onClose: () => void;
  onAddRecipes: (recipes: Recipe[], addToWeek: boolean) => void;
}

export function AddRecipeModal({
  firebaseEnabled = false,
  firebaseUser = null,
  onSignInWithGoogle,
  onClose,
  onAddRecipes,
}: AddRecipeModalProps) {
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

  // Multi-page Photo / Camera OCR & Vision state
  const [photoPages, setPhotoPages] = useState<RecipePhotoPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [visionNotice, setVisionNotice] = useState<string | null>(null);
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

  const appCheckReady = isFirebaseAppCheckConfigured();
  const hasDirectGeminiKey = Boolean(geminiApiKey.trim());
  const activePage = photoPages[Math.min(activePageIndex, Math.max(0, photoPages.length - 1))] ?? null;

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
    const coverImage = photoPages[0]?.displayDataUrl ?? undefined;
    const recipe: Recipe = {
      id: createId('rec'),
      title: scannedTitle.trim(),
      image: coverImage,
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

  const runPhotoRecognition = async (pagesToScan: RecipePhotoPage[]) => {
    if (pagesToScan.length === 0) return;

    setOcrBusy(true);
    setVisionNotice(null);
    const pageCount = pagesToScan.length;
    const pageLabel = pageCount === 1 ? 'photo' : `${pageCount} pages`;
    setOcrStatus(`Preparing ${pageLabel}…`);

    const processedPages: Array<{ page: RecipePhotoPage; ocrUrl: string }> = [];
    for (const page of pagesToScan) {
      try {
        const processed = await preprocessPhotoForOcr(page.rawDataUrl, page.rotation);
        processedPages.push({
          page: { ...page, displayDataUrl: processed.displayDataUrl },
          ocrUrl: processed.ocrDataUrl,
        });
      } catch {
        processedPages.push({
          page,
          ocrUrl: page.rawDataUrl,
        });
      }
    }

    const updatedPages = processedPages.map((item) => item.page);
    setPhotoPages(updatedPages);
    const displayUrls = updatedPages.map((p) => p.displayDataUrl);

    if (firebaseEnabled && appCheckReady) {
      setOcrStatus(`Reading ${pageLabel} with Gemini 4 Hydrogen…`);
      try {
        const visionRecipe = await extractRecipeWithFirebaseAi(displayUrls);
        applyScannedRecipeToFields(visionRecipe);
        setOcrStatus(
          `Recognized ${pageLabel} with Gemini 4 Hydrogen — review and save below.`,
        );
        setOcrBusy(false);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Firebase AI Vision failed.';
        setVisionNotice(`${msg} Fell back to local OCR.`);
      }
    } else if (firebaseEnabled && !appCheckReady && !hasDirectGeminiKey) {
      setVisionNotice(
        'Firebase AI needs App Check enabled (reCAPTCHA Enterprise key) — using local OCR for now, or paste a free Gemini API key above to use Gemini 4 Hydrogen right away.',
      );
    }

    const trimmedKey = geminiApiKey.trim();
    if (trimmedKey) {
      setOcrStatus(`Reading ${pageLabel} with Gemini 4 Hydrogen…`);
      try {
        const visionRecipe = await extractRecipeWithGeminiVision(displayUrls, trimmedKey);
        applyScannedRecipeToFields(visionRecipe);
        setVisionNotice(null);
        setOcrStatus(
          `Recognized ${pageLabel} with Gemini 4 Hydrogen — review and save below.`,
        );
        setOcrBusy(false);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gemini Vision failed.';
        setVisionNotice(`${msg} Fell back to local OCR.`);
      }
    }

    setOcrStatus(
      pageCount === 1
        ? 'Reading printed text locally…'
        : `Reading ${pageCount} pages locally…`,
    );
    try {
      const Tesseract = await import('tesseract.js');
      const pageTexts: string[] = [];
      for (let i = 0; i < processedPages.length; i += 1) {
        const { data } = await Tesseract.recognize(processedPages[i].ocrUrl, 'eng', {
          logger: (m: { status?: string; progress?: number }) => {
            if (m.status === 'recognizing text' && typeof m.progress === 'number') {
              const prefix =
                pageCount > 1
                  ? `Reading page ${i + 1} of ${pageCount} locally…`
                  : 'Reading printed text locally…';
              setOcrStatus(`${prefix} ${Math.round(m.progress * 100)}%`);
            }
          },
        });
        const text = data.text.trim();
        if (text) pageTexts.push(text);
      }

      const combinedText = pageTexts.join('\n\n').trim();
      if (combinedText) {
        const parsed = parseOcrRecipeText(combinedText, displayUrls[0]);
        applyScannedRecipeToFields(parsed);
        setOcrStatus(
          `Scanned ${pageLabel} locally — review or refine below.`,
        );
      } else {
        setHasScannedResult(true);
        setOcrStatus('Could not read text clearly — rotate a page, use Gemini Vision, or type below.');
      }
    } catch {
      setHasScannedResult(true);
      setOcrStatus('Photos ready — enter or adjust the recipe fields below.');
    } finally {
      setOcrBusy(false);
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handlePhotoFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    stopCamera();
    const files = Array.from(fileList);
    const dataUrls = await Promise.all(files.map((file) => readFileAsDataUrl(file)));
    const addedPages: RecipePhotoPage[] = dataUrls.filter(Boolean).map((url) => ({
      id: createId('pg'),
      rawDataUrl: url,
      displayDataUrl: url,
      rotation: 0,
    }));
    if (addedPages.length === 0) return;

    const nextPages = [...photoPages, ...addedPages];
    setPhotoPages(nextPages);
    setActivePageIndex(nextPages.length - 1);
    void runPhotoRecognition(nextPages);
  };

  const handleRotateActivePage = () => {
    if (!activePage) return;
    const idx = Math.min(activePageIndex, photoPages.length - 1);
    const nextPages = photoPages.map((page, i) =>
      i === idx ? { ...page, rotation: (page.rotation + 90) % 360 } : page,
    );
    setPhotoPages(nextPages);
    void runPhotoRecognition(nextPages);
  };

  const handleRemovePage = (pageId: string) => {
    const nextPages = photoPages.filter((p) => p.id !== pageId);
    setPhotoPages(nextPages);
    setActivePageIndex((prev) => Math.max(0, Math.min(prev, nextPages.length - 1)));
    if (nextPages.length === 0) {
      setOcrStatus(null);
      setVisionNotice(null);
    }
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
      const newPage: RecipePhotoPage = {
        id: createId('pg'),
        rawDataUrl: dataUrl,
        displayDataUrl: dataUrl,
        rotation: 0,
      };
      const nextPages = [...photoPages, newPage];
      setPhotoPages(nextPages);
      setActivePageIndex(nextPages.length - 1);
      void runPhotoRecognition(nextPages);
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
              {/* AI Vision status: Firebase AI Logic (with App Check) or optional BYO Gemini key */}
              <div className="bookmarklet-card" style={{ padding: '0.7rem 0.9rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--lavender-ink)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <Sparkles size={14} />
                    {firebaseEnabled && appCheckReady
                      ? 'Gemini 4 Hydrogen Vision ready'
                      : hasDirectGeminiKey
                        ? 'Gemini 4 Hydrogen Vision active'
                        : firebaseEnabled
                          ? 'Firebase AI needs App Check — or add a Gemini key'
                          : 'Gemini 4 Hydrogen optional (best for handwriting & cookbooks)'}
                  </span>
                  {firebaseEnabled && appCheckReady && !firebaseUser && onSignInWithGoogle ? (
                    <button
                      type="button"
                      className="btn btn-lavender btn-sm"
                      onClick={() => void onSignInWithGoogle()}
                    >
                      Sign in
                    </button>
                  ) : !(firebaseEnabled && appCheckReady) ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowVisionSettings((v) => !v)}
                    >
                      {showVisionSettings ? 'Hide' : hasDirectGeminiKey ? 'Key saved' : 'Add key'}
                    </button>
                  ) : null}
                </div>

                {!(firebaseEnabled && appCheckReady) && showVisionSettings && (
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
                      Google&apos;s Gemini 4 Hydrogen API.
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
                      {photoPages.length > 0 ? `Capture page ${photoPages.length + 1}` : 'Capture'}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={stopCamera}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : photoPages.length === 0 ? (
                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <label className="dropzone" style={{ flex: 1 }}>
                    <Upload size={20} color="var(--sage-ink)" />
                    <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>
                      Upload recipe photo(s)
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                      Pick 1 or multiple pages
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      aria-label="Upload recipe photo"
                      onChange={(e) => {
                        void handlePhotoFiles(e.target.files);
                        e.target.value = '';
                      }}
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
                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                      Snap one or more pages
                    </span>
                  </button>
                </div>
              ) : null}

              {photoPages.length > 0 && activePage && (
                <div className="form-grid" style={{ gap: '0.6rem' }}>
                  {/* Multi-page thumbnail strip */}
                  <div className="photo-pages-strip" role="list" aria-label="Recipe photo pages">
                    {photoPages.map((page, index) => (
                      <div
                        key={page.id}
                        role="listitem"
                        className={`photo-page-thumb ${
                          activePage.id === page.id ? 'active' : ''
                        }`}
                      >
                        <button
                          type="button"
                          className="photo-page-select"
                          aria-label={`View page ${index + 1}`}
                          onClick={() => setActivePageIndex(index)}
                        >
                          <img src={page.displayDataUrl} alt={`Recipe page ${index + 1}`} />
                          <span className="photo-page-badge">P{index + 1}</span>
                        </button>
                        <button
                          type="button"
                          className="photo-page-remove"
                          aria-label={`Remove page ${index + 1}`}
                          disabled={ocrBusy}
                          onClick={() => handleRemovePage(page.id)}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}

                    <label className="photo-page-add" aria-label="Add another photo page">
                      <Plus size={16} />
                      <span>Add page</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        aria-label="Add another recipe photo"
                        disabled={ocrBusy}
                        onChange={(e) => {
                          void handlePhotoFiles(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      className="photo-page-add"
                      disabled={ocrBusy}
                      onClick={handleStartCamera}
                    >
                      <Camera size={15} />
                      <span>Snap</span>
                    </button>
                  </div>

                  <img
                    src={activePage.displayDataUrl}
                    alt={`Captured recipe page ${Math.min(activePageIndex, photoPages.length - 1) + 1}`}
                    className="recipe-hero-img"
                    style={{
                      maxHeight: '190px',
                      objectFit: 'contain',
                      background: 'var(--bg-subtle)',
                    }}
                  />

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
                      {ocrStatus || ''}
                    </span>
                    <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn btn-surface btn-sm"
                        disabled={ocrBusy}
                        onClick={handleRotateActivePage}
                      >
                        <RotateCw size={13} />
                        Rotate
                      </button>
                      <button
                        type="button"
                        className="btn btn-lavender btn-sm"
                        disabled={ocrBusy}
                        onClick={() => void runPhotoRecognition(photoPages)}
                      >
                        {photoPages.length > 1 ? `Scan ${photoPages.length} pages` : 'Rescan'}
                      </button>
                    </div>
                  </div>

                  {visionNotice && (
                    <p
                      role="status"
                      style={{
                        margin: 0,
                        fontSize: '0.78rem',
                        color: 'var(--blush-ink)',
                        background: 'rgba(249, 232, 223, 0.55)',
                        padding: '0.5rem 0.7rem',
                        borderRadius: '10px',
                      }}
                    >
                      {visionNotice}
                    </p>
                  )}
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
