import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const DEV_FALLBACK_CONFIG = {
  apiKey: "AIzaSyAZ9zjFzo6IwHC4Ope4D2lWySeJkGZhCvw",
  authDomain: "armin-web.firebaseapp.com",
  projectId: "armin-web",
  storageBucket: "armin-web.appspot.com",
  messagingSenderId: "380952034390",
  appId: "1:380952034390:web:3c125db899cc5bdeb14ff7",
};

function resolveMobileFirebaseConfig() {
  const runtimeEnv =
    (typeof process !== "undefined" ? process.env : undefined) ||
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ||
    {};

  const appEnv = String(runtimeEnv.APP_ENV || "development").trim().toLowerCase();

  const config = {
    apiKey: (runtimeEnv.EXPO_PUBLIC_FIREBASE_API_KEY || "").trim(),
    authDomain: (runtimeEnv.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "").trim(),
    projectId: (runtimeEnv.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "").trim(),
    storageBucket: (runtimeEnv.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim(),
    messagingSenderId: (runtimeEnv.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "").trim(),
    appId: (runtimeEnv.EXPO_PUBLIC_FIREBASE_APP_ID || "").trim(),
  };

  const hasMissing = Object.values(config).some((value) => value.length === 0);
  if (!hasMissing) {
    return config;
  }

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn(
      "[mobile/firebase] EXPO_PUBLIC_FIREBASE_* is missing. Falling back to dev config. Set apps/mobile/.env or EAS secrets.",
    );
    return DEV_FALLBACK_CONFIG;
  }

  // Preview/simulator builds often run without EAS plain-text secrets. Keep app bootable for testing.
  if (appEnv !== "production") {
    console.warn(
      `[mobile/firebase] Missing EXPO_PUBLIC_FIREBASE_* in APP_ENV=${appEnv}. Using fallback config for non-production build.`,
    );
    return DEV_FALLBACK_CONFIG;
  }

  throw new Error("Missing required EXPO_PUBLIC_FIREBASE_* environment variables.");
}

export function getMobileFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  return initializeApp(resolveMobileFirebaseConfig());
}

let _auth: ReturnType<typeof getAuth>;

export function getMobileAuth() {
  const app = getMobileFirebaseApp();
  if (_auth) return _auth;
  _auth = getAuth(app);
  return _auth;
}
