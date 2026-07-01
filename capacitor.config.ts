import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'za.co.underbridges.croft',
  appName: 'Croft',
  // Used when the app bundles its own web assets (offline-capable build).
  // Currently the app loads the live site via `server.url` below, so webDir is
  // only the fallback — run `npm run build` to keep web/dist fresh regardless.
  webDir: 'web/dist',
  server: {
    // Load the deployed PWA directly. This keeps Croft's existing same-origin,
    // httpOnly-cookie auth working unchanged inside the iOS WKWebView (the
    // webview origin == the API origin, so the croft_token cookie is first-party).
    //
    // To ship a fully bundled / offline app instead, delete this `server` block
    // and migrate auth from the cookie to a bearer token (see APP_STORE.md →
    // "Bundled build & token auth"). Bundled assets load from capacitor://localhost,
    // which is cross-origin to the API and will not carry the SameSite=Lax cookie.
    url: 'https://www.croftapp.co.za',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
  },
};

export default config;
