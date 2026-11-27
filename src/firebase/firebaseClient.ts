import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

export interface FirebaseUserSummary {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

interface FirebaseEnvConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  recaptchaSiteKey?: string;
}

function readFirebaseEnv(): FirebaseEnvConfig | null {
  const env = import.meta.env;
  const apiKey = (env.VITE_FIREBASE_API_KEY as string | undefined)?.trim();
  const authDomain = (env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined)?.trim();
  const projectId = (env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim();
  const appId = (env.VITE_FIREBASE_APP_ID as string | undefined)?.trim();

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined)?.trim() || undefined,
    messagingSenderId:
      (env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined)?.trim() || undefined,
    appId,
    recaptchaSiteKey:
      (env.VITE_FIREBASE_RECAPTCHA_SITE_KEY as string | undefined)?.trim() || undefined,
  };
}

let cachedApp: FirebaseApp | null = null;
let appCheckInitialized = false;

export function isFirebaseConfigured(): boolean {
  return readFirebaseEnv() !== null;
}

export function isFirebaseAppCheckConfigured(): boolean {
  return Boolean(readFirebaseEnv()?.recaptchaSiteKey);
}

export function getFirebaseApp(): FirebaseApp | null {
  if (cachedApp) return cachedApp;
  const config = readFirebaseEnv();
  if (!config) return null;

  const existing = getApps();
  cachedApp =
    existing.length > 0
      ? existing[0]
      : initializeApp({
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          storageBucket: config.storageBucket,
          messagingSenderId: config.messagingSenderId,
          appId: config.appId,
        });

  if (!appCheckInitialized && config.recaptchaSiteKey && typeof window !== 'undefined') {
    try {
      initializeAppCheck(cachedApp, {
        provider: new ReCaptchaEnterpriseProvider(config.recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckInitialized = true;
    } catch {
      // Ignore App Check init errors in test/restricted environments
    }
  }

  return cachedApp;
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}

export function getFirebaseDb(): Firestore | null {
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
}

export const GEMINI_VISION_MODEL = 'gemini-4-hydrogen';

export function getFirebaseVisionModel() {
  const app = getFirebaseApp();
  if (!app) return null;
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    model: GEMINI_VISION_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });
}

function toUserSummary(user: User | null): FirebaseUserSummary | null {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  };
}

export function subscribeToAuth(
  onChange: (user: FirebaseUserSummary | null) => void,
): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    onChange(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    onChange(toUserSummary(user));
  });
}

export async function signInWithGoogle(): Promise<FirebaseUserSummary | null> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase is not configured yet.');
  }
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return toUserSummary(result.user);
}

export async function signOutUser(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}
