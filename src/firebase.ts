// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAZ9zjFzo6IwHC4Ope4D2lWySeJkGZhCvw",
  authDomain: "armin-web.pages.dev",
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
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);