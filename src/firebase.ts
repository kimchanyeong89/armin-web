// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAZ9zjFzo6IwHC4Ope4D2lWySeJkGZhCvw",
  authDomain: "armin-web.firebaseapp.com",
  projectId: "armin-web",
  storageBucket: "armin-web.firebasestorage.app",
  messagingSenderId: "380952034390",
  appId: "1:380952034390:web:3c125db899cc5bdeb14ff7",
  measurementId: "G-RSQS7JC2H9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);