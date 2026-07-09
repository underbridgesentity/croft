// Native iOS push via APNs (the Capacitor app can't use Web Push in its
// WKWebView). The plugin is dynamically imported so it never loads on the web,
// where enablePush() routes to Web Push instead.
import { isNative } from './native';
import { api } from './api';

const TOKEN_KEY = 'croft.apnsToken';
let currentToken = '';

/** Ask for notification permission, register with APNs, and send the device
 * token to the server. Returns false if unavailable or permission denied. */
export async function enableNativePush(): Promise<boolean> {
  if (!isNative()) return false;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return false;

  await PushNotifications.removeAllListeners().catch(() => {});
  await PushNotifications.addListener('registration', (t) => {
    currentToken = t.value;
    try { localStorage.setItem(TOKEN_KEY, t.value); } catch { /* noop */ }
    api.registerNativePush(t.value).catch(() => {});
  });
  await PushNotifications.addListener('registrationError', () => {});
  // Tapping a notification deep-links into the relevant screen.
  await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    const url = (a.notification?.data as { url?: string } | undefined)?.url;
    if (url) { try { window.location.assign(url); } catch { /* noop */ } }
  });

  await PushNotifications.register(); // fires 'registration' with the APNs token
  return true;
}

export async function disableNativePush(): Promise<void> {
  if (!isNative()) return;
  const token = currentToken || (() => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } })();
  if (token) await api.unregisterNativePush(token).catch(() => {});
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
  currentToken = '';
  const { PushNotifications } = await import('@capacitor/push-notifications');
  await PushNotifications.removeAllListeners().catch(() => {});
}
