import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';

// All helpers no-op in a normal browser and only engage inside the native
// (Capacitor) app, so the same web bundle powers both.
export const isNative = () => Capacitor.isNativePlatform();

/** iOS keyboard workaround (native only). When an input is focused, the
 * WKWebView scrolls the whole document to reveal it, dragging the header and
 * tab bar with it - and it doesn't reliably restore the position when the
 * keyboard hides, leaving the chrome shifted. Snap the window scroll back to 0
 * when typing ends (blur) or the keyboard visibly closes (visual viewport back
 * to full height) - never while the keyboard is open, so the focused input
 * stays revealed while typing. */
export function initNativeViewportFix() {
  if (!isNative()) return;
  const snap = () => {
    if (window.scrollY !== 0) window.scrollTo(0, 0);
    const de = document.documentElement;
    if (de.scrollTop !== 0) de.scrollTop = 0;
    if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
  };
  // Blur fires when the user dismisses the keyboard or taps elsewhere; the
  // small delay lets the keyboard finish its own scroll adjustments first.
  document.addEventListener('focusout', () => setTimeout(snap, 80));
  const vv = window.visualViewport;
  vv?.addEventListener('resize', () => {
    // Height back to (nearly) full = keyboard closed.
    if (vv.height >= window.innerHeight - 60) setTimeout(snap, 80);
  });
}

/** Light tactile feedback on a successful action (native only). */
export async function tapHaptic() {
  if (!isNative()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* ignore */
  }
}

/** Native share sheet; returns false on web so callers can fall back. */
export async function nativeShare(opts: { title?: string; text?: string; url: string }): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await Share.share(opts);
    return true;
  } catch {
    return false;
  }
}

/** Run `cb` whenever the app returns to the foreground (native only). */
export function onNativeResume(cb: () => void): () => void {
  if (!isNative()) return () => {};
  const handle = App.addListener('resume', cb);
  return () => {
    handle.then((h) => h.remove()).catch(() => {});
  };
}
