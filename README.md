# Forager

A light, minimalist recipe library, weekly meal planner, and Walmart Pickup grocery list — built with React, TypeScript, Vite, and optional **Firebase** (Google Sign-In, private Firestore sync, Firebase AI Logic Gemini Vision, and Firebase Hosting), plus a **Chrome / Brave browser extension** (Manifest V3 Side Panel).

## Features

- **Recipe Library & Serendipitous Discovery**: Collect recipes with personal notes, clean inline editing, and a **Surprise me** helper that highlights recipes sharing ingredients already on your week.
- **Multi-Source Recipe Import**:
  - Import spreadsheets (`.csv`, `.xlsx`)
  - Import from recipe links (JSON-LD `schema.org/Recipe` extraction — or one-click **Save recipe from current tab** in the browser extension)
  - Capture or upload recipe photos with contrast/rotation preprocessing, local OCR, and **Gemini 2.5 Flash Vision** (via Firebase AI Logic when signed in with Google, or optional personal API key)
  - Write recipes manually
- **Smart Recipe Transforms**: Apply presets (*Substitute dairy*, *Gluten-free*, *Vegetarian*, *Plant-based*, *Nut-free*) or custom natural-language transforms (`"swap butter for olive oil"`, `"double the garlic"`, `"remove parmesan"`) with one-click **Undo**.
- **One-Meal-Per-Day Weekly Planner**: Plan `Mon`–`Sun`, step servings directly on any meal, and customize/transform a recipe for a specific night without changing your base library recipe.
- **Consolidated Grocery List & Walmart Pickup Cart**:
  - Scales and combines ingredients across recipes (converting compatible units like `tbsp` ↔ `cup` and `oz` ↔ `lb`), grouped by aisle.
  - Defaults to **Walmart Pickup** with automatic 10-item batching so large grocery lists add completely into your Walmart cart.
  - **Past Walmart Orders**: Sync directly from an open `walmart.com/orders` tab (in the extension) or upload saved `.html` / `.json` / `.csv` / `.xlsx` exports so Forager prioritizes your own favorite brands and specialty items.
- **Private Cloud Sync (Firebase)**:
  - Works offline with `localStorage` by default.
  - Sign in with Google to sync recipes, meal plans, grocery lists, and past Walmart orders privately under `users/{uid}` in Cloud Firestore (protected by `firestore.rules`).

## Development

```bash
npm install
npm test                 # Run Vitest unit & integration suite
npm run lint             # Run oxlint
npm run dev              # Start local web dev server
npm run build            # Production web build (dist/)
npm run build:extension  # Build Chrome / Brave MV3 extension (dist-extension/)
```

## Firebase Setup (Hosting, Google Sign-In, Private Sync & Gemini Vision)

Everything runs on Firebase's no-cost **Spark** plan:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com/).
2. Enable three services in the Firebase Console:
   - **Build → Authentication → Sign-in method → Google**
   - **Build → Firestore Database → Create database** (then deploy `firestore.rules` or paste its contents into the **Rules** tab)
   - **AI Services → AI Logic → Get started → Gemini Developer API** (free tier; keeps your Gemini key server-side)
3. Register a **Web app** (`</>`) in Project Settings and copy the config values into `.env.local` (see `.env.example`) for local dev, or into **GitHub Repo → Settings → Secrets and variables → Actions**:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_RECAPTCHA_SITE_KEY` *(optional, if you enable reCAPTCHA v3 App Check)*
   - `FIREBASE_SERVICE_ACCOUNT` *(JSON key for GitHub Actions Hosting deploy, generated via `firebase init hosting:github` or Google Cloud IAM)*
4. Push to `main` (or run `npx firebase deploy --only hosting,firestore:rules`) to publish to `https://<your-project-id>.web.app`.

## Loading the Chrome / Brave Extension

1. Run `npm run build:extension` to generate `dist-extension/`.
2. Open `chrome://extensions` (Chrome) or `brave://extensions` (Brave).
3. Enable **Developer mode** and click **Load unpacked**, then select `dist-extension/`.
4. Click the **Forager** leaf icon in your toolbar to open it in the Side Panel alongside any recipe site or `walmart.com`.
