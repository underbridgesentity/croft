// Transactional email via Resend. No-ops gracefully (returns false, logs) when
// RESEND_API_KEY is unset, so email-dependent flows never hard-fail.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Croft <noreply@croftapp.co.za>';

export const emailEnabled = Boolean(RESEND_API_KEY);

/** Escape user-controlled text before interpolating it into email HTML, so an
 * event/bill/household name like `<a href=...>` can't inject markup into the
 * emails the rest of the household receives. */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendEmail(opts: { to: string; subject: string; html: string; text?: string }): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('[croft] email skipped (RESEND_API_KEY unset):', opts.subject);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text }),
    });
    if (!res.ok) {
      console.error('[croft] resend error', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[croft] email send failed', e);
    return false;
  }
}

/** Minimal branded wrapper so transactional emails look consistent. */
export function emailLayout(heading: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  // heading and label are always plain text (often containing user-supplied
  // names), so they're escaped here; bodyHtml is the caller's HTML and callers
  // must esc() any user data they interpolate into it.
  const button = cta
    ? `<a href="${esc(cta.url)}" style="display:inline-block;background:#3B5BFF;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:12px;font-size:15px">${esc(cta.label)}</a>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#F3F5FB;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101426">
    <div style="max-width:480px;margin:0 auto;padding:32px 24px">
      <div style="font-weight:700;font-size:22px;letter-spacing:-0.01em;margin-bottom:24px;color:#3B5BFF">Croft</div>
      <div style="background:#fff;border-radius:18px;padding:28px 24px">
        <h1 style="font-size:20px;margin:0 0 12px">${esc(heading)}</h1>
        <div style="font-size:15px;line-height:1.6;color:#3f4756">${bodyHtml}</div>
        ${button ? `<div style="margin-top:22px">${button}</div>` : ''}
      </div>
      <div style="font-size:12px;color:#8A93A6;text-align:center;margin-top:20px">One calm home for your whole family · croftapp.co.za</div>
    </div></body></html>`;
}
