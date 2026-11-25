import { useState } from 'react';
import {
  Bookmark,
  Check,
  Copy,
  Download,
  ExternalLink,
  Minus,
  Plus,
  RefreshCw,
  ShoppingBag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { AISLE_ORDER } from '../domain/groceryAggregator';
import { formatQuantity, formatUnit } from '../domain/ingredientParser';
import {
  buildWalmartCartBatches,
  extractWalmartItemId,
  matchWalmartProducts,
  WALMART_BATCH_LIMIT,
  type WalmartFulfillment,
} from '../domain/walmartCart';
import {
  parseWalmartOrdersCsv,
  parseWalmartOrdersHtml,
  parseWalmartOrdersJson,
  parseWalmartOrdersSpreadsheet,
  parseWalmartOrdersText,
  SAMPLE_WALMART_ORDERS_CSV,
  WALMART_BOOKMARKLET_CODE,
  WALMART_BOOKMARKLET_HREF,
  type WalmartPurchaseItem,
} from '../domain/walmartOrderHistory';
import {
  isChromeExtension,
  openWalmartCartBatchesInChrome,
  syncWalmartOrdersFromActiveTab,
} from '../extension/chromeBridge';
import type { GroceryItem } from '../types/recipe';

interface GroceryListViewProps {
  items: GroceryItem[];
  fulfillment: WalmartFulfillment;
  storeId: string;
  purchaseHistory: WalmartPurchaseItem[];
  onFulfillmentChange: (mode: WalmartFulfillment) => void;
  onStoreIdChange: (storeId: string) => void;
  onImportHistory: (items: WalmartPurchaseItem[]) => void;
  onRemoveHistoryItem: (walmartItemId: string) => void;
  onClearHistory: () => void;
  onToggleChecked: (id: string) => void;
  onAddExtraItem: (rawText: string) => void;
  onRemoveExtraItem: (id: string) => void;
  onSetWalmartItemId: (groceryId: string, itemId: string) => void;
  onGoToWeek: () => void;
}

type WalmartSheetTab = 'cart' | 'orders';

async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function GroceryListView({
  items,
  fulfillment,
  storeId,
  purchaseHistory,
  onFulfillmentChange,
  onStoreIdChange,
  onImportHistory,
  onRemoveHistoryItem,
  onClearHistory,
  onToggleChecked,
  onAddExtraItem,
  onRemoveExtraItem,
  onSetWalmartItemId,
  onGoToWeek,
}: GroceryListViewProps) {
  const [extraInput, setExtraInput] = useState('');
  const [showWalmartModal, setShowWalmartModal] = useState(false);
  const [sheetTab, setSheetTab] = useState<WalmartSheetTab>('cart');
  const [copied, setCopied] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [customLinkInput, setCustomLinkInput] = useState('');
  const [sentBatches, setSentBatches] = useState<Record<number, boolean>>({});
  const [orderPaste, setOrderPaste] = useState('');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');

  const remaining = items.filter((i) => !i.checked);
  const walmartLines = matchWalmartProducts(items, fulfillment, purchaseHistory).map((line) => ({
    ...line,
    packageQuantity: qtyOverrides[line.groceryId] ?? line.packageQuantity,
  }));

  const batches = buildWalmartCartBatches(walmartLines, { fulfillment, storeId });
  const mappedCount = walmartLines.filter(
    (l) => Boolean(l.walmartItemId) && l.packageQuantity > 0,
  ).length;
  const historyMatchCount = walmartLines.filter((l) => l.matchSource === 'history').length;
  const unmappedCount = walmartLines.length - mappedCount;
  const modeLabel = fulfillment === 'delivery' ? 'Delivery' : 'Pickup';

  const groupedByAisle = AISLE_ORDER.map((aisle) => ({
    aisle,
    items: items.filter((item) => item.aisle === aisle),
  })).filter((group) => group.items.length > 0);

  const filteredHistory = purchaseHistory.filter((item) =>
    item.productName.toLowerCase().includes(historySearch.trim().toLowerCase()),
  );

  const handleCopyList = async () => {
    const text = remaining
      .map((item) => {
        const qty = formatQuantity(item.quantity);
        const unit = formatUnit(item.unit, item.quantity);
        return `- ${[qty, unit, item.name].filter(Boolean).join(' ')}`;
      })
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable in some environments
    }
  };

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(WALMART_BOOKMARKLET_CODE);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleOrderFileUpload = async (file: File | undefined) => {
    if (!file) return;
    setImportFeedback(null);
    try {
      const lower = file.name.toLowerCase();
      let parsed: WalmartPurchaseItem[] = [];

      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        parsed = parseWalmartOrdersSpreadsheet(buffer);
      } else {
        const text = await readFileAsText(file);
        if (lower.endsWith('.json')) {
          parsed = parseWalmartOrdersJson(text);
        } else if (lower.endsWith('.html') || lower.endsWith('.htm')) {
          parsed = parseWalmartOrdersHtml(text);
        } else if (lower.endsWith('.csv') || lower.endsWith('.tsv') || file.type === 'text/csv') {
          parsed = parseWalmartOrdersCsv(text);
        } else {
          parsed = parseWalmartOrdersText(text);
        }
      }

      if (parsed.length === 0) {
        setImportFeedback(
          'No Walmart items found in that file. Try a saved walmart.com/orders page, JSON, or CSV export.',
        );
      } else {
        onImportHistory(parsed);
        setImportFeedback(`Imported ${parsed.length} item${parsed.length === 1 ? '' : 's'} into your personal catalog.`);
      }
    } catch {
      setImportFeedback('Could not read that file. Try .html, .json, .csv, or .xlsx.');
    }
  };

  const handleDownloadSampleOrders = () => {
    const blob = new Blob([SAMPLE_WALMART_ORDERS_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-walmart-orders.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (items.length === 0) {
    return (
      <section className="empty-state" aria-label="Grocery list">
        <h2>Your list is clear</h2>
        <p>Plan a few meals for the week and every ingredient gathers here automatically.</p>
        <button
          type="button"
          className="btn btn-sage"
          style={{ marginTop: '1rem' }}
          onClick={onGoToWeek}
        >
          Plan your week
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Grocery list">
      <div className="view-header">
        <div>
          <h1 className="view-title">Grocery list</h1>
          <p className="view-subtitle">
            {remaining.length} of {items.length} items left to pick up
          </p>
        </div>

        <div className="library-controls">
          <button type="button" className="btn btn-surface" onClick={() => void handleCopyList()}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied' : 'Copy list'}
          </button>
        </div>
      </div>

      <div className="grocery-layout">
        <div className="grocery-aisles">
          {groupedByAisle.map((group) => (
            <div key={group.aisle} className="aisle-card">
              <h2 className="aisle-title">{group.aisle}</h2>
              <ul className="grocery-items">
                {group.items.map((item) => {
                  const qtyStr = formatQuantity(item.quantity);
                  const unitStr = formatUnit(item.unit, item.quantity);
                  const amountLabel = [qtyStr, unitStr].filter(Boolean).join(' ');

                  return (
                    <li key={item.id} className={`grocery-row ${item.checked ? 'checked' : ''}`}>
                      <label className="grocery-check-label">
                        <input
                          type="checkbox"
                          className="grocery-checkbox"
                          checked={item.checked}
                          onChange={() => onToggleChecked(item.id)}
                        />
                        <span className="grocery-item-text">
                          <span className="grocery-item-main">
                            {amountLabel && <span className="grocery-item-qty">{amountLabel}</span>}
                            {item.name}
                          </span>
                          {item.sources.length > 0 && (
                            <span className="grocery-item-source">{item.sources.join(', ')}</span>
                          )}
                        </span>
                      </label>

                      {item.custom && (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => onRemoveExtraItem(item.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <aside className="grocery-sidebar">
          <div className="walmart-panel">
            <h2>Walmart {modeLabel}</h2>
            <p>
              {mappedCount} of {remaining.length} unchecked items matched
              {historyMatchCount > 0 ? ` (${historyMatchCount} from your past orders)` : ''}.
            </p>
            <button
              type="button"
              className="btn btn-mist"
              onClick={() => {
                setSentBatches({});
                setSheetTab('cart');
                setImportFeedback(null);
                setShowWalmartModal(true);
              }}
              disabled={remaining.length === 0}
            >
              <ShoppingBag size={15} />
              Review &amp; add to Walmart Cart
            </button>
          </div>

          <div className="extra-item-card">
            <h3 className="section-heading" style={{ marginBottom: 0 }}>
              Add an extra
            </h3>
            <form
              className="extra-item-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!extraInput.trim()) return;
                onAddExtraItem(extraInput.trim());
                setExtraInput('');
              }}
            >
              <input
                type="text"
                className="field-input"
                value={extraInput}
                onChange={(e) => setExtraInput(e.target.value)}
                placeholder="e.g. 1 bag coffee beans"
                aria-label="Add extra grocery item"
              />
              <button type="submit" className="btn btn-sage btn-sm" aria-label="Add item">
                <Plus size={15} />
              </button>
            </form>
          </div>
        </aside>
      </div>

      {/* Walmart Grocery Cart Sheet */}
      {showWalmartModal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowWalmartModal(false);
          }}
        >
          <div
            className="modal-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Walmart Grocery Cart"
          >
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize: '1.3rem' }}>Walmart Grocery Cart</h2>
                <p className="recipe-card-meta">
                  {mappedCount} matched{unmappedCount > 0 ? ` · ${unmappedCount} need search` : ''}
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => setShowWalmartModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="walmart-controls-bar">
                <div className="import-tabs" role="tablist" aria-label="Walmart cart sections">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sheetTab === 'cart'}
                    className="import-tab"
                    onClick={() => setSheetTab('cart')}
                  >
                    Cart
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sheetTab === 'orders'}
                    className="import-tab"
                    onClick={() => setSheetTab('orders')}
                  >
                    Past orders{purchaseHistory.length > 0 ? ` (${purchaseHistory.length})` : ''}
                  </button>
                </div>

                {sheetTab === 'cart' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div className="import-tabs" role="group" aria-label="Order fulfillment">
                      <button
                        type="button"
                        aria-pressed={fulfillment === 'pickup'}
                        className={`import-tab ${fulfillment === 'pickup' ? 'active-tab' : ''}`}
                        onClick={() => onFulfillmentChange('pickup')}
                      >
                        Pickup
                      </button>
                      <button
                        type="button"
                        aria-pressed={fulfillment === 'delivery'}
                        className={`import-tab ${fulfillment === 'delivery' ? 'active-tab' : ''}`}
                        onClick={() => onFulfillmentChange('delivery')}
                      >
                        Delivery
                      </button>
                    </div>

                    <input
                      type="text"
                      className="field-input"
                      style={{ width: '145px', padding: '0.4rem 0.7rem', fontSize: '0.82rem' }}
                      value={storeId}
                      onChange={(e) => onStoreIdChange(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="Store # (optional)"
                      aria-label="Walmart store number"
                    />
                  </div>
                )}
              </div>

              {sheetTab === 'cart' ? (
                <>
                  {/* Batched Cart Actions (chunks of 10 so Walmart never truncates large lists) */}
                  {batches.length > 0 && (
                    <div className="walmart-batches-box">
                      {batches.length > 1 && isChromeExtension() && (
                        <button
                          type="button"
                          className="btn btn-sage"
                          onClick={async () => {
                            const ok = await openWalmartCartBatchesInChrome(
                              batches.map((b) => b.url),
                            );
                            if (ok) {
                              const allDone: Record<number, boolean> = {};
                              batches.forEach((b) => {
                                allDone[b.index] = true;
                              });
                              setSentBatches(allDone);
                            }
                          }}
                        >
                          <ShoppingBag size={14} />
                          Add all {mappedCount} items to Walmart {modeLabel} Cart
                        </button>
                      )}
                      {batches.length > 1 && (
                        <p className="walmart-batch-hint">
                          Walmart adds up to {WALMART_BATCH_LIMIT} items per link. Open each batch in
                          order — every click adds into the same {modeLabel.toLowerCase()} cart.
                        </p>
                      )}
                      <div className="walmart-batch-buttons">
                        {batches.map((batch) => {
                          const done = Boolean(sentBatches[batch.index]);
                          const label =
                            batches.length === 1
                              ? `Open Walmart ${modeLabel} Cart (${batch.lines.length} items)`
                              : `Batch ${batch.index + 1} of ${batch.totalBatches} · ${modeLabel} Cart (${batch.lines.length} items)`;

                          return (
                            <a
                              key={batch.index}
                              href={batch.url}
                              target="_blank"
                              rel="noreferrer"
                              className={`btn ${done ? 'btn-sage' : 'btn-mist'}`}
                              style={{ textDecoration: 'none' }}
                              onClick={() =>
                                setSentBatches((prev) => ({ ...prev, [batch.index]: true }))
                              }
                            >
                              {done ? <Check size={14} /> : <ShoppingBag size={14} />}
                              {label}
                              <ExternalLink size={13} />
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="cart-lines">
                    {walmartLines.map((line) => (
                      <div
                        key={line.groceryId}
                        className="cart-line"
                        style={{ flexDirection: 'column', alignItems: 'stretch' }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                          }}
                        >
                          <div className="cart-line-info">
                            <div className="cart-line-product">{line.productName}</div>
                            <div className="cart-line-need">
                              Need {line.neededLabel}
                              {line.walmartItemId ? ` · ${line.packageLabel}` : ' · not yet linked'}
                              {line.matchSource === 'history' && (
                                <span className="history-whisper"> · from your orders</span>
                              )}
                            </div>
                          </div>

                          <div className="cart-line-actions">
                            {line.walmartItemId && (
                              <div className="servings-stepper" aria-label="Package quantity">
                                <button
                                  type="button"
                                  aria-label={`Decrease quantity for ${line.groceryName}`}
                                  onClick={() =>
                                    setQtyOverrides((prev) => ({
                                      ...prev,
                                      [line.groceryId]: Math.max(0, line.packageQuantity - 1),
                                    }))
                                  }
                                >
                                  <Minus size={11} />
                                </button>
                                <span>{line.packageQuantity}</span>
                                <button
                                  type="button"
                                  aria-label={`Increase quantity for ${line.groceryName}`}
                                  onClick={() =>
                                    setQtyOverrides((prev) => ({
                                      ...prev,
                                      [line.groceryId]: line.packageQuantity + 1,
                                    }))
                                  }
                                >
                                  <Plus size={11} />
                                </button>
                              </div>
                            )}

                            <a
                              href={line.searchUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-link"
                            >
                              {line.walmartItemId ? 'Swap ↗' : `Find for ${modeLabel} ↗`}
                            </a>

                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setEditingLinkId(
                                  editingLinkId === line.groceryId ? null : line.groceryId,
                                );
                                setCustomLinkInput(line.walmartItemId ?? '');
                              }}
                            >
                              Link ID
                            </button>
                          </div>
                        </div>

                        {editingLinkId === line.groceryId && (
                          <form
                            style={{ display: 'flex', gap: '0.45rem', marginTop: '0.55rem' }}
                            onSubmit={(e) => {
                              e.preventDefault();
                              const extracted = extractWalmartItemId(customLinkInput);
                              if (extracted) {
                                onSetWalmartItemId(line.groceryId, extracted);
                                setEditingLinkId(null);
                              }
                            }}
                          >
                            <input
                              type="text"
                              className="field-input"
                              value={customLinkInput}
                              onChange={(e) => setCustomLinkInput(e.target.value)}
                              placeholder="Paste Walmart product URL or item ID…"
                            />
                            <button type="submit" className="btn btn-mist btn-sm">
                              Save
                            </button>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      flexWrap: 'wrap',
                      paddingTop: '0.5rem',
                      borderTop: '1px solid var(--border-hairline)',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void handleCopyList()}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Copied' : 'Copy list'}
                    </button>

                    {batches.length === 0 && (
                      <a
                        href="https://www.walmart.com/cp/groceries-essentials/1735450"
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-mist"
                        style={{ textDecoration: 'none' }}
                      >
                        Open Walmart {modeLabel}
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </>
              ) : (
                <div className="form-grid">
                  <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--ink-secondary)' }}>
                    Items from your past Walmart orders take priority over the default catalog, so
                    Forager picks your favorite brands and specialty items automatically.
                  </p>

                  {isChromeExtension() && (
                    <button
                      type="button"
                      className="btn btn-sage"
                      onClick={async () => {
                        setImportFeedback('Reading items from your open Walmart tab…');
                        const result = await syncWalmartOrdersFromActiveTab();
                        if (result.items.length > 0) {
                          onImportHistory(result.items);
                          setImportFeedback(
                            `Synced ${result.items.length} item${result.items.length === 1 ? '' : 's'} from your Walmart tab.`,
                          );
                        } else {
                          setImportFeedback(
                            result.error || 'No items found on the active Walmart tab.',
                          );
                        }
                      }}
                    >
                      <RefreshCw size={15} />
                      Sync from open Walmart tab
                    </button>
                  )}

                  {/* File upload */}
                  <label className="dropzone">
                    <Upload size={20} color="var(--mist-ink)" />
                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                      Upload Walmart order file
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                      Accepts saved walmart.com/orders pages (.html), .json, .csv, or .xlsx
                    </span>
                    <input
                      type="file"
                      accept=".html,.htm,.json,.csv,.tsv,.xlsx,.xls,text/csv,application/json,text/html"
                      className="sr-only"
                      aria-label="Upload Walmart order file"
                      onChange={(e) => void handleOrderFileUpload(e.target.files?.[0])}
                    />
                  </label>

                  {/* Bookmarklet helper */}
                  <div className="bookmarklet-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>
                          Export directly from walmart.com/orders
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                          Drag this bookmarklet to your bookmarks bar, open your Walmart Purchase
                          History, and click it to download a JSON file.
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <a
                          href={WALMART_BOOKMARKLET_HREF}
                          className="btn btn-lavender btn-sm"
                          style={{ textDecoration: 'none' }}
                          onClick={(e) => e.preventDefault()}
                          title="Drag to your bookmarks bar"
                        >
                          <Bookmark size={13} />
                          Export Walmart Orders
                        </a>
                        <button
                          type="button"
                          className="btn btn-surface btn-sm"
                          onClick={() => void handleCopySnippet()}
                        >
                          {copiedSnippet ? <Check size={13} /> : <Copy size={13} />}
                          {copiedSnippet ? 'Copied' : 'Copy snippet'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Paste links or receipt text */}
                  <div className="form-grid" style={{ gap: '0.5rem' }}>
                    <label className="field-label" htmlFor="walmart-order-paste">
                      Or paste Walmart product links / receipt text
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        id="walmart-order-paste"
                        type="text"
                        className="field-input"
                        value={orderPaste}
                        onChange={(e) => setOrderPaste(e.target.value)}
                        placeholder="Paste walmart.com/ip/... links or exported JSON"
                      />
                      <button
                        type="button"
                        className="btn btn-sage btn-sm"
                        disabled={!orderPaste.trim()}
                        onClick={() => {
                          const parsed = parseWalmartOrdersText(orderPaste);
                          if (parsed.length === 0) {
                            setImportFeedback('No Walmart product links found in pasted text.');
                          } else {
                            onImportHistory(parsed);
                            setOrderPaste('');
                            setImportFeedback(`Imported ${parsed.length} item${parsed.length === 1 ? '' : 's'}.`);
                          }
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={handleDownloadSampleOrders}
                    >
                      <Download size={14} />
                      Download sample orders CSV
                    </button>

                    {purchaseHistory.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={onClearHistory}
                      >
                        Clear saved history
                      </button>
                    )}
                  </div>

                  {importFeedback && (
                    <div className="transform-feedback">
                      <span>{importFeedback}</span>
                    </div>
                  )}

                  {purchaseHistory.length > 0 && (
                    <div className="form-grid" style={{ gap: '0.6rem' }}>
                      <input
                        type="search"
                        className="field-input"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder={`Filter ${purchaseHistory.length} saved items…`}
                        aria-label="Filter saved Walmart items"
                      />
                      <div className="cart-lines" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        {filteredHistory.map((item) => (
                          <div key={item.walmartItemId} className="cart-line">
                            <div className="cart-line-info">
                              <div className="cart-line-product">{item.productName}</div>
                              <div className="cart-line-need">
                                #{item.walmartItemId} · bought {item.purchaseCount}×
                              </div>
                            </div>
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label={`Remove ${item.productName}`}
                              onClick={() => onRemoveHistoryItem(item.walmartItemId)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
