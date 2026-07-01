import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';

// All helpers no-op in a normal browser and only engage inside the native
// (Capacitor) app, so the same web bundle powers both.
export const isNative = () => Capacitor.isNativePlatform();

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
