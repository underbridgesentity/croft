import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { StoreProvider } from './store';
import { initNativeViewportFix } from './lib/native';

// Keep the app chrome pinned when the iOS keyboard opens/closes (no-op on web).
initNativeViewportFix();

// The service worker self-activates (skipWaiting + clientsClaim), but nothing
// reloaded the already-rendered page when a NEW worker took control - so a
// returning visitor could keep seeing an old cached build indefinitely. When a
// new worker claims the page (only when one was already in control, i.e. a real
// update - not the first install), reload once so the fresh build shows.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>
);
