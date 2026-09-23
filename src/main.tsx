import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isGlobeLabPath } from './globe-lab/model'
import { isPreviewPath } from './redesign/model'

const GlobeLabApp = lazy(() => import('./globe-lab/GlobeLabApp'))
const RedesignApp = lazy(() => import('./redesign/RedesignApp'))

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
const redesignFallback = (
  <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#111210', color: '#f1efe8' }}>
    <span style={{ fontFamily: 'Avenir Next, Apple SD Gothic Neo, Noto Sans KR, sans-serif', letterSpacing: '-0.04em', fontWeight: 700 }}>
      COLLY
    </span>
  </div>
)

createRoot(document.getElementById('root')!).render(
  isGlobeLabPath(window.location.pathname)
    ? <Suspense fallback={redesignFallback}><GlobeLabApp /></Suspense>
    : isPreviewPath(window.location.pathname)
    ? <Suspense fallback={redesignFallback}><RedesignApp /></Suspense>
    : <App />
)

// Unregister service workers as they are causing load failures
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      registration.unregister();
    }
  }).catch(() => {/* ignore */ });
}
