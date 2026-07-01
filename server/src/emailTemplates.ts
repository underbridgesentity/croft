import { emailLayout } from './mailer.js';

const APP_URL = process.env.APP_URL || 'https://www.croftapp.co.za';

export interface Email { subject: string; html: string; text: string }

const firstName = (name?: string | null) => (name ? name.split(' ')[0] : 'there');

/** New account created (email signup). */
export function welcomeEmail(name?: string): Email {
  return {
    subject: 'Welcome to Croft 🏡',
    html: emailLayout(
      `Welcome to Croft, ${firstName(name)}`,
      `Your home is all set up. Croft keeps your family's <strong>dates, to-dos, shopping lists, goals and money</strong> in one calm place — off your group chats.<br><br>Add a few things to get going, then invite the people you live with so everyone stays in sync.`,
      { label: 'Open Croft', url: APP_URL }
    ),
    text: `Welcome to Croft, ${firstName(name)}. Your home is set up — add your family's dates, to-dos, lists, goals and money in one place. ${APP_URL}`,
  };
}

/** Invitation to join a household (sent to the invitee's email). */
export function inviteEmail(opts: { inviterName?: string | null; householdName: string; joinUrl: string }): Email {
  const who = opts.inviterName || 'A family member';
  return {
    subject: `${who} invited you to join ${opts.householdName} on Croft`,
    html: emailLayout(
      `Join ${opts.householdName} on Croft`,
      `${who} has invited you to share <strong>${opts.householdName}</strong> on Croft — one calm home for your family's dates, plans and money.<br><br>Tap below to create your account and join. This invite is single-use and expires in 14 days.`,
      { label: `Join ${opts.householdName}`, url: opts.joinUrl }
    ),
    text: `${who} invited you to join ${opts.householdName} on Croft. Join here (expires in 14 days): ${opts.joinUrl}`,
  };
}

/** Someone accepted your invite (sent to the inviter). */
export function memberJoinedEmail(opts: { joinerName: string; householdName: string }): Email {
  return {
    subject: `${opts.joinerName} joined ${opts.householdName} on Croft`,
    html: emailLayout(
      `${opts.joinerName} joined your home`,
      `Good news — <strong>${opts.joinerName}</strong> accepted your invite and joined <strong>${opts.householdName}</strong> on Croft. You're now sharing your calendar, plans and money.`,
      { label: 'Open Croft', url: APP_URL }
    ),
    text: `${opts.joinerName} joined ${opts.householdName} on Croft. ${APP_URL}`,
  };
}

/** Password reset request. */
export function passwordResetEmail(opts: { name?: string; resetUrl: string }): Email {
  return {
    subject: 'Reset your Croft password',
    html: emailLayout(
      'Reset your password',
      `Hi ${firstName(opts.name)},<br><br>We got a request to reset your Croft password. This link expires in 1 hour. If you didn't ask for this, you can safely ignore this email — your password won't change.`,
      { label: 'Reset password', url: opts.resetUrl }
    ),
    text: `Reset your Croft password (expires in 1 hour): ${opts.resetUrl}`,
  };
}

/** Security notice after a password change/reset. */
export function passwordChangedEmail(opts: { name?: string }): Email {
  return {
    subject: 'Your Croft password was changed',
    html: emailLayout(
      'Password changed',
      `Hi ${firstName(opts.name)},<br><br>Your Croft password was just changed. If this was you, you're all set — no action needed.<br><br>If it <strong>wasn't</strong> you, reset your password immediately from the sign-in screen and review your account.`,
      { label: 'Open Croft', url: APP_URL }
    ),
    text: `Your Croft password was just changed. If this wasn't you, reset it immediately at ${APP_URL}.`,
  };
}
