import { emailLayout, esc } from './mailer.js';

const APP_URL = process.env.APP_URL || 'https://www.croftapp.co.za';

export interface Email { subject: string; html: string; text: string }

const firstName = (name?: string | null) => (name ? name.split(' ')[0] : 'there');

// "Get the app" nudge appended to onboarding-flavoured emails. Links to /get,
// which redirects each device to its own store (and desktops to the site) -
// so this template never needs to know which stores are live.
const appNudgeHtml = `<br><br><span style="font-size:13px;color:#7D776E;">Prefer an app? <a href="${APP_URL}/get" style="color:#3B5BFF;font-weight:600;">Get Croft for iPhone or Android</a>.</span>`;
const appNudgeText = ` Prefer an app? Get Croft for your phone: ${APP_URL}/get`;

/** New account created (email signup). */
export function welcomeEmail(name?: string): Email {
  return {
    subject: 'Welcome to Croft',
    html: emailLayout(
      `Welcome to Croft, ${firstName(name)}`,
      `Your home is all set up. Croft keeps your family's <strong>dates, to-dos, shopping lists, goals and money</strong> in one calm place - off your group chats.<br><br>Add a few things to get going, then invite the people you live with so everyone stays in sync.${appNudgeHtml}`,
      { label: 'Open Croft', url: APP_URL }
    ),
    text: `Welcome to Croft, ${firstName(name)}. Your home is set up - add your family's dates, to-dos, lists, goals and money in one place. ${APP_URL}${appNudgeText}`,
  };
}

/** Invitation to join a household (sent to the invitee's email). */
export function inviteEmail(opts: { inviterName?: string | null; householdName: string; joinUrl: string }): Email {
  const who = opts.inviterName || 'A family member';
  return {
    subject: `${who} invited you to join ${opts.householdName} on Croft`,
    html: emailLayout(
      `Join ${opts.householdName} on Croft`,
      `${esc(who)} has invited you to share <strong>${esc(opts.householdName)}</strong> on Croft - one calm home for your family's dates, plans and money.<br><br>Tap below to create your account and join. This invite is single-use and expires in 14 days.${appNudgeHtml}`,
      { label: `Join ${opts.householdName}`, url: opts.joinUrl }
    ),
    text: `${who} invited you to join ${opts.householdName} on Croft. Join here (expires in 14 days): ${opts.joinUrl}${appNudgeText}`,
  };
}

/** Someone accepted your invite (sent to the inviter). */
export function memberJoinedEmail(opts: { joinerName: string; householdName: string }): Email {
  return {
    subject: `${opts.joinerName} joined ${opts.householdName} on Croft`,
    html: emailLayout(
      `${opts.joinerName} joined your home`,
      `Good news - <strong>${esc(opts.joinerName)}</strong> accepted your invite and joined <strong>${esc(opts.householdName)}</strong> on Croft. You're now sharing your calendar, plans and money.`,
      { label: 'Open Croft', url: APP_URL }
    ),
    text: `${opts.joinerName} joined ${opts.householdName} on Croft. ${APP_URL}`,
  };
}

/** Password reset request. */
// `setup` is true for accounts that have no password yet (they signed up with
// Google) and are setting one so they can sign in by email - e.g. in the iOS
// app, where Google sign-in isn't offered.
export function passwordResetEmail(opts: { name?: string; resetUrl: string; setup?: boolean }): Email {
  const body = opts.setup
    ? `Hi ${esc(firstName(opts.name))},<br><br>Here's a link to set a password for your Croft account, so you can sign in with your email and password - including in the app. This link expires in 1 hour. If you didn't ask for this, you can safely ignore this email.`
    : `Hi ${esc(firstName(opts.name))},<br><br>We got a request to reset your Croft password. This link expires in 1 hour. If you didn't ask for this, you can safely ignore this email - your password won't change.`;
  return {
    subject: opts.setup ? 'Set your Croft password' : 'Reset your Croft password',
    html: emailLayout(
      opts.setup ? 'Set your password' : 'Reset your password',
      body,
      { label: opts.setup ? 'Set password' : 'Reset password', url: opts.resetUrl }
    ),
    text: `${opts.setup ? 'Set' : 'Reset'} your Croft password (expires in 1 hour): ${opts.resetUrl}`,
  };
}

/** Security notice after a password change/reset. */
export function passwordChangedEmail(opts: { name?: string }): Email {
  return {
    subject: 'Your Croft password was changed',
    html: emailLayout(
      'Password changed',
      `Hi ${esc(firstName(opts.name))},<br><br>Your Croft password was just changed. If this was you, you're all set - no action needed.<br><br>If it <strong>wasn't</strong> you, reset your password immediately from the sign-in screen and review your account.`,
      { label: 'Open Croft', url: APP_URL }
    ),
    text: `Your Croft password was just changed. If this wasn't you, reset it immediately at ${APP_URL}.`,
  };
}
