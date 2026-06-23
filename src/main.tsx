import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (typeof window !== 'undefined') {
  const query = new URLSearchParams(window.location.search);
  if (query.get('mobileApp') === '1') {
    document.documentElement.setAttribute('data-mobile-app', '1');
    document.body?.setAttribute('data-mobile-app', '1');
  }
}

// NOTE: React.StrictMode intentionally removed. Its dev-only double-mount rapidly
// subscribes/unsubscribes Firestore onSnapshot listeners, which trips the firebase 11.10.0
// SDK bug "INTERNAL ASSERTION FAILED (ID: b815 / ca9)" — an uncatchable watch-stream
// assertion that blanks the entire app in dev. Production builds never double-invoke, so
// this only ever hurt local dev. Re-add StrictMode only after upgrading firebase past the
// b815/ca9 fix and confirming the preview (vite dev) stays crash-free.
createRoot(document.getElementById('root')!).render(<App />)

// Unregister service workers as they are causing load failures
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      registration.unregister();
    }
  }).catch(() => {/* ignore */ });
}
