import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ============================================================
// CANONICAL ORIGIN ENFORCEMENT (NON-BYPASSABLE)
// Redirect non-canonical origins BEFORE app boots.
// This prevents CORS errors from api.connector-os.com.
// ============================================================
const CANONICAL_HOST = 'app.connector-os.com';
const NON_CANONICAL_HOSTS = ['connector-os.com', 'www.connector-os.com'];
const IS_LOCALHOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Deploy-time invariant: log origin for debugging
console.log('[Origin Guard]', {
  host: window.location.host,
  canonical: CANONICAL_HOST,
  isCanonical: window.location.host === CANONICAL_HOST,
  isLocalhost: IS_LOCALHOST,
});

if (NON_CANONICAL_HOSTS.includes(window.location.host)) {
  // Preserve path, query, and hash on redirect
  const canonical = `https://${CANONICAL_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`;
  console.warn('[Origin Guard] Redirecting to canonical origin:', canonical);
  window.location.replace(canonical);
} else if (!IS_LOCALHOST && window.location.host !== CANONICAL_HOST) {
  // Unknown origin in production - log warning but allow (might be preview deploy)
  console.warn('[Origin Guard] Unknown origin:', window.location.host, '- expected:', CANONICAL_HOST);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} else {
  // Canonical origin or localhost - safe to render
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
