// Biometric unlock for the App Lock - Face ID / Touch ID / Android fingerprint.
//
// The lock is a CLIENT-SIDE privacy gate (see server/src/auth.ts /lock/*):
// the server deliberately never mints an "unlocked" credential, so biometrics
// here are the same local convenience as the PIN - a platform-authenticator
// ceremony whose success flips appUnlocked. Nothing is verified server-side.
//
// Backends:
//   'webauthn' - browsers + the Android TWA (platform authenticator).
//   'native'   - the iOS Capacitor app via a biometrics plugin (v1.3 binary;
//                stubbed to 'none' until the plugin ships - old binaries load
//                the live site, so this stub is what keeps them safe).
//   'none'     - no hardware / unsupported context: all UI hides itself.
import { isNative } from './native';
import { isIOSDevice } from './appLinks';

export type BioBackend = 'webauthn' | 'native' | 'none';

const key = (userId: string) => `croft.bio.${userId}`;

// One OS prompt at a time; concurrent callers lose instantly.
let prompting = false;

let supportPromise: Promise<BioBackend> | null = null;

/** Which biometric backend this device/context offers (cached). */
export function bioSupport(): Promise<BioBackend> {
  if (!supportPromise) supportPromise = detect();
  return supportPromise;
}

async function detect(): Promise<BioBackend> {
  if (isNative()) {
    // The double guard (isPluginAvailable + probe, all try/catch) is what
    // keeps this web deploy safe inside OLD binaries: the app loads the live
    // site, so v1.2 runs this code too - there the plugin isn't registered
    // and the probe cleanly yields 'none'. v1.3+ lights up 'native'.
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isPluginAvailable('NativeBiometric')) return 'none';
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
      const r = await NativeBiometric.isAvailable();
      return r.isAvailable ? 'native' : 'none';
    } catch {
      return 'none';
    }
  }
  try {
    if (!window.isSecureContext || !window.PublicKeyCredential) return 'none';
    const ok = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return ok ? 'webauthn' : 'none';
  } catch {
    return 'none';
  }
}

/** One OS biometric prompt via the native plugin. true = verified. */
async function nativeVerify(): Promise<boolean> {
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
    await NativeBiometric.verifyIdentity({
      reason: 'Unlock Croft',
      title: 'Unlock Croft',
    });
    return true;
  } catch {
    return false; // cancelled / failed / lockout - the PIN keypad is right there
  }
}

/** Is biometric unlock enrolled on THIS device for THIS user? */
export function bioEnrolled(userId: string): boolean {
  try {
    return !!localStorage.getItem(key(userId));
  } catch {
    return false;
  }
}

/** Forget this device's enrollment. Local only - the OS credential, if any,
 * is orphaned and gets overwritten by the next enroll (stable user.id). */
export function bioClear(userId: string): void {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* ignore */
  }
}

/** 'Face ID' on Apple devices, 'fingerprint' elsewhere - for button labels. */
export function bioLabel(): string {
  return isIOSDevice() ? 'Face ID' : 'fingerprint';
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Prompt the OS to register a platform credential and remember it locally.
 * Throws with a user-facing message on cancel/failure. */
export async function bioEnroll(user: { id: string; email?: string; name?: string }): Promise<void> {
  const backend = await bioSupport();
  if (backend === 'none') throw new Error('Biometric unlock isn’t available on this device');
  if (prompting) throw new Error('Already waiting for a biometric prompt');
  if (backend === 'native') {
    prompting = true;
    try {
      const ok = await nativeVerify();
      if (!ok) throw new Error('Biometric setup was cancelled');
      localStorage.setItem(key(user.id), 'native');
      return;
    } finally {
      prompting = false;
    }
  }
  prompting = true;
  try {
    // The challenge is random-but-unverified by design: the OS user-verification
    // IS the gate, exactly like the PIN check this sits beside.
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { id: location.hostname, name: 'Croft' },
        // Stable id per Croft user: re-enrolling overwrites the same passkey
        // slot instead of piling up, and family members on a shared device
        // each get their own.
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.email || 'croft-user',
          displayName: user.name || 'Croft user',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged',
          requireResidentKey: false,
        },
        attestation: 'none',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error('cancelled');
    localStorage.setItem(key(user.id), b64url(cred.rawId));
  } catch (e) {
    throw new Error(e instanceof Error && e.name === 'NotAllowedError' ? 'Biometric setup was cancelled' : 'Couldn’t set up biometric unlock');
  } finally {
    prompting = false;
  }
}

/** Prompt the OS to verify the user. true = verified; false = cancel/fail -
 * callers silently fall back to the PIN keypad. Never throws, never clears
 * the enrollment (cancel and invalidated are indistinguishable). */
export async function bioUnlock(userId: string): Promise<boolean> {
  if (prompting) return false;
  const stored = (() => {
    try {
      return localStorage.getItem(key(userId));
    } catch {
      return null;
    }
  })();
  if (!stored) return false;
  const backend = await bioSupport();
  if (backend === 'native') {
    prompting = true;
    try {
      return await nativeVerify();
    } finally {
      prompting = false;
    }
  }
  if (backend !== 'webauthn') return false;
  prompting = true;
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: fromB64url(stored), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  } finally {
    prompting = false;
  }
}
