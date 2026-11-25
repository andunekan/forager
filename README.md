# Forager

A light, minimalist recipe library, weekly meal planner, and Walmart Pickup grocery list — available as both a **web app** ([andunekan.github.io/forager](https://andunekan.github.io/forager/)) and a **Chrome / Brave browser extension** (Manifest V3 Side Panel).

All personal data (recipes, notes, meal plans, Walmart store #, and past Walmart orders) is stored strictly locally in your browser — nothing is uploaded to GitHub or shared with other visitors.

## Features

- **Recipe Library & Serendipitous Discovery**: Collect recipes with personal notes, clean inline editing, and a **Surprise me** helper that highlights recipes sharing ingredients already on your week.
- **Multi-Source Recipe Import**:
  - Import spreadsheets (`.csv`, `.xlsx`)
  - Import from recipe links (JSON-LD `schema.org/Recipe` extraction — or one-click **Save recipe from current tab** in the browser extension)
  - Capture or upload recipe photos with client-side OCR (`tesseract.js`)
  - Write recipes manually
- **Smart Recipe Transforms**: Apply presets (*Substitute dairy*, *Gluten-free*, *Vegetarian*, *Plant-based*, *Nut-free*) or custom natural-language transforms (`"swap butter for olive oil"`, `"double the garlic"`, `"remove parmesan"`) with one-click **Undo**.
- **One-Meal-Per-Day Weekly Planner**: Plan `Mon`–`Sun`, step servings directly on any meal, and customize/transform a recipe for a specific night without changing your base library recipe.
- **Consolidated Grocery List & Walmart Pickup Cart**:
  - Scales and combines ingredients across recipes (converting compatible units like `tbsp` ↔ `cup` and `oz` ↔ `lb`), grouped by aisle.
  - Defaults to **Walmart Pickup** with automatic 10-item batching so large grocery lists add completely into your Walmart cart.
  - **Past Walmart Orders**: Sync directly from an open `walmart.com/orders` tab (in the extension) or upload saved `.html` / `.json` / `.csv` / `.xlsx` exports so Forager prioritizes your own favorite brands and specialty items.

## Development

```bash
npm install
npm test              # Run Vitest unit & integration suite
npm run lint          # Run oxlint
npm run dev           # Start local web dev server
npm run build         # Production web build (dist/)
npm run build:extension  # Build Chrome / Brave MV3 extension (dist-extension/)
```

## Loading the Chrome / Brave Extension

1. Run `npm run build:extension` to generate `dist-extension/`.
2. Open `chrome://extensions` (Chrome) or `brave://extensions` (Brave).
3. Enable **Developer mode** and click **Load unpacked**, then select the `dist-extension/` folder.
4. Click the **Forager** leaf icon in your toolbar to open it in the Side Panel alongside any recipe site or `walmart.com`.
