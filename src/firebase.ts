// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAZ9zjFzo6IwHC4Ope4D2lWySeJkGZhCvw",
  // Use Firebase's own hosting for authDomain so /__/auth/handler is always
  // served by Firebase regardless of where the app itself is hosted. The
  // previous custom-domain value ("armin-web.pages.dev") required Cloudflare
  // Pages to proxy /__/auth/* back to Firebase; without that proxy,
  // signInWithPopup/Redirect for Apple lands on a blank SPA index.html and
  // the auth callback is never processed.
  authDomain: "armin-web.firebaseapp.com",
  projectId: "armin-web",
  storageBucket: "armin-web.appspot.com",
  messagingSenderId: "380952034390",
  appId: "1:380952034390:web:3c125db899cc5bdeb14ff7",
  measurementId: "G-RSQS7JC2H9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Initialize analytics only in browsers that support it to avoid runtime errors in some environments
if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
  isSupported().then((ok) => {
    if (ok) {
      try { getAnalytics(app); } catch {}
    }
  }).catch(() => {/* ignore */});
}
// Persistent IndexedDB cache — repeat reads (especially after a page reload)
// are served from local storage instead of re-billing Firestore server reads.
// This cuts read volume sharply and makes reloads faster. The SDK keeps the
// cache in sync and falls back to an in-memory cache if IndexedDB is
// unavailable (private browsing, etc.), so behavior is unchanged.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const storage = getStorage(app);
export const auth = getAuth(app);