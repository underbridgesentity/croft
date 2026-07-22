// Store links + the gating that keeps install nudges OUT of the apps.
// The iOS app (WKWebView) and the Android TWA (Chrome) render this same site,
// so every piece of "get the app" UI must pass showInstallUI() before it renders.
import { isNative } from './native';

export const APP_STORE_URL = 'https://apps.apple.com/app/id6786755483';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=za.co.underbridges.croft';
// Flipped 2026-07-17: Croft approved on Google Play - Android strip, Play
// footer badge and /get Android redirect all live.
export const PLAY_STORE_LIVE = true;

// ?store=ios|android forces platform detection, so every state is testable
// from a desktop browser (the Android path stays dark until PLAY_STORE_LIVE).
const override = () => new URLSearchParams(window.location.search).get('store');

export function isIOSDevice(): boolean {
  if (override() === 'ios') return true;
  if (override() === 'android') return false;
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return true;
  // iPadOS 13+ reports itself as a Mac, but it's the only "Mac" with touch.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isAndroidDevice(): boolean {
  if (override() === 'android') return true;
  return /Android/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** Safari proper on iOS - the one place Apple's own Smart App Banner renders
 * (and knows install state: "Get"/"Open"). Our strip must stand down there or
 * the two stack. Other iOS browsers (CriOS/FxiOS/...) and in-app webviews
 * don't get Apple's banner, so the strip still covers them. */
export function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  if (!/iPhone|iPad|iPod/.test(ua) && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return false;
  return /Safari\//.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Brave|GSA\/)/.test(ua);
}

/** Android Chrome can tell a page whether our TWA is installed (iOS has no
 * equivalent). Resolves false anywhere the API is missing. */
export async function isNativeAppInstalled(): Promise<boolean> {
  try {
    const rel = await (navigator as { getInstalledRelatedApps?: () => Promise<{ id?: string }[]> }).getInstalledRelatedApps?.();
    return !!rel?.some((a) => a.id === 'za.co.underbridges.croft');
  } catch {
    return false;
  }
}

/** True only in a plain browser tab - never in the native apps, the TWA or an installed PWA. */
export function showInstallUI(): boolean {
  return !isNative() && !isStandalone();
}

/** The store this visitor should be sent to, or null when there's nothing to offer. */
export function preferredStoreUrl(): string | null {
  if (isIOSDevice()) return APP_STORE_URL;
  if (isAndroidDevice() && PLAY_STORE_LIVE) return PLAY_STORE_URL;
  return null;
}
