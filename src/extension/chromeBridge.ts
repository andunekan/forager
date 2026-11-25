import { parseRecipeFromHtml } from '../domain/importers';
import {
  parseWalmartOrdersHtml,
  type WalmartPurchaseItem,
} from '../domain/walmartOrderHistory';
import type { Recipe } from '../types/recipe';

interface ChromeTab {
  id?: number;
  url?: string;
}

interface ChromeExecuteResult<T> {
  result?: T;
}

interface ChromeApi {
  runtime?: {
    id?: string;
    getURL?: (path: string) => string;
  };
  tabs?: {
    query: (queryInfo: { active: boolean; currentWindow: boolean }) => Promise<ChromeTab[]>;
    create: (createProperties: { url: string; active?: boolean }) => Promise<ChromeTab>;
  };
  scripting?: {
    executeScript: <T>(injection: {
      target: { tabId: number };
      func: () => T;
    }) => Promise<Array<ChromeExecuteResult<T>>>;
  };
}

function getChromeApi(): ChromeApi | undefined {
  return (globalThis as unknown as { chrome?: ChromeApi }).chrome;
}

export function isChromeExtension(): boolean {
  const api = getChromeApi();
  return Boolean(api?.runtime?.id && api?.tabs?.query && api?.scripting?.executeScript);
}

export async function openExtensionFullTab(): Promise<void> {
  const api = getChromeApi();
  if (!api?.tabs || !api?.runtime?.getURL) return;
  await api.tabs.create({ url: api.runtime.getURL('index.html'), active: true });
}

export async function importRecipeFromActiveTab(): Promise<{
  recipe?: Recipe;
  error?: string;
}> {
  const api = getChromeApi();
  if (!api?.tabs || !api?.scripting) {
    return { error: 'Open Forager as a browser extension to save directly from your current tab.' };
  }

  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
      return { error: 'Open a recipe webpage in your active tab first.' };
    }

    const results = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        html: document.documentElement.outerHTML,
        url: window.location.href,
      }),
    });

    const payload = results[0]?.result;
    if (!payload?.html) {
      return { error: 'Could not read that page.' };
    }

    const recipe = parseRecipeFromHtml(payload.html, payload.url || tab.url);
    if (!recipe) {
      return { error: 'No structured recipe found on this tab.' };
    }

    return { recipe };
  } catch {
    return { error: 'Browser prevented reading this page. Try pasting the URL or recipe text instead.' };
  }
}

export async function syncWalmartOrdersFromActiveTab(): Promise<{
  items: WalmartPurchaseItem[];
  error?: string;
}> {
  const api = getChromeApi();
  if (!api?.tabs || !api?.scripting) {
    return {
      items: [],
      error: 'Open Forager as a browser extension to sync directly from a Walmart tab.',
    };
  }

  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/https?:\/\/(?:www\.)?walmart\.com/i.test(tab.url)) {
      return {
        items: [],
        error: 'Open walmart.com/orders or walmart.com/my-items in your active tab first, then click Sync.',
      };
    }

    const results = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        html: document.documentElement.outerHTML,
      }),
    });

    const html = results[0]?.result?.html;
    if (!html) {
      return { items: [], error: 'Could not read items from this Walmart tab.' };
    }

    const items = parseWalmartOrdersHtml(html);
    if (items.length === 0) {
      return {
        items: [],
        error: 'No purchased items visible yet — scroll your Walmart orders page and click Sync again.',
      };
    }

    return { items };
  } catch {
    return {
      items: [],
      error: 'Could not access the active Walmart tab. Make sure you are on walmart.com/orders.',
    };
  }
}

export async function openWalmartCartBatchesInChrome(
  urls: string[],
  delayMs = 900,
): Promise<boolean> {
  const api = getChromeApi();
  if (!api?.tabs || urls.length === 0) return false;

  for (let i = 0; i < urls.length; i += 1) {
    const isLast = i === urls.length - 1;
    await api.tabs.create({ url: urls[i], active: isLast });
    if (!isLast && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return true;
}
