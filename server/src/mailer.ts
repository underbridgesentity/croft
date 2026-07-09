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

/** Branded wrapper for every Croft email - the same warm canvas, ink, blue
 * and rounded shapes as the app. Table-based + fully inline styles so it
 * renders in Gmail/Apple Mail/Outlook alike; the logo is served from the
 * production site. */
export function emailLayout(
  heading: string,
  bodyHtml: string,
  cta?: { label: string; url: string },
  opts?: { footerNote?: string }
): string {
  // heading and label are always plain text (often containing user-supplied
  // names), so they're escaped here; bodyHtml is the caller's HTML and callers
  // must esc() any user data they interpolate into it.
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const button = cta
    ? `<a href="${esc(cta.url)}" style="display:inline-block;background:#3B5BFF;color:#ffffff;text-decoration:none;font-family:${font};font-weight:700;font-size:15px;padding:13px 26px;border-radius:100px;">${esc(cta.label)}</a>`
    : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#EAE7E1;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAE7E1;">
<tr><td align="center" style="padding:36px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
    <tr><td style="padding:0 6px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td><img src="https://www.croftapp.co.za/icons/icon-192.png" width="34" height="34" alt="Croft" style="display:block;border-radius:9px;"></td>
        <td style="padding-left:10px;font-family:${font};font-size:19px;font-weight:700;letter-spacing:-0.02em;color:#181922;">Croft</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:20px;border:1px solid #E5E0D8;padding:30px 28px;">
      <h1 style="margin:0 0 12px;font-family:${font};font-size:21px;font-weight:700;line-height:1.25;letter-spacing:-0.02em;color:#181922;">${esc(heading)}</h1>
      <div style="font-family:${font};font-size:15px;line-height:1.65;color:#4A463F;">${bodyHtml}</div>
      ${button ? `<div style="margin-top:24px;">${button}</div>` : ''}
    </td></tr>
    <tr><td style="padding:20px 10px 0;text-align:center;font-family:${font};font-size:12px;line-height:1.7;color:#9C968D;">
      One calm home for your whole family<br>
      <a href="https://www.croftapp.co.za" style="color:#7D776E;font-weight:600;text-decoration:none;">croftapp.co.za</a>
      ${opts?.footerNote ? `<div style="margin-top:6px;color:#B3ADA3;">${esc(opts.footerNote)}</div>` : ''}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
