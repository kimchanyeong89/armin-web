import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const isMobileAppContainer = (() => {
  if (typeof window === 'undefined') return false;
  const query = new URLSearchParams(window.location.search);
  if (query.get('mobileApp') === '1') return true;
  return document.documentElement.getAttribute('data-mobile-app') === '1';
})();

if (typeof window !== 'undefined') {
  const query = new URLSearchParams(window.location.search);
  if (query.get('mobileApp') === '1') {
    document.documentElement.setAttribute('data-mobile-app', '1');
    document.body?.setAttribute('data-mobile-app', '1');
  }
}

createRoot(document.getElementById('root')!).render(
  isMobileAppContainer ? <App /> : (
    <StrictMode>
      <App />
    </StrictMode>
  ),
)

// Unregister service workers as they are causing load failures
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      registration.unregister();
    }
  }).catch(() => {/* ignore */ });
}
