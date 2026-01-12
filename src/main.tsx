import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ============================================================
// CANONICAL ORIGIN ENFORCEMENT
// Redirect non-canonical origins BEFORE app boots.
// This prevents CORS errors from api.connector-os.com.
// ============================================================
const CANONICAL_HOST = 'app.connector-os.com';
const NON_CANONICAL_HOSTS = ['connector-os.com', 'www.connector-os.com'];

if (NON_CANONICAL_HOSTS.includes(window.location.host)) {
  // Preserve path, query, and hash on redirect
  const canonical = `https://${CANONICAL_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(canonical);
} else {
  // Only render app on canonical origin (or localhost for dev)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
