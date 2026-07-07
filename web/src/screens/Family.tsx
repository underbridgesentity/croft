import { useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/api';
import { enablePush, disablePush } from '../lib/push';
import { nativeShare } from '../lib/native';
import type { Nav } from '../Shell';
import type { Settings, EmailCadence } from '../lib/types';
import Icon from '../components/Icon';
import { Avatar, YouBadge } from './Onboarding';

const grotesk = "'Geist', sans-serif";
const pwInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1.5px solid #E8E3DB', background: '#fff', borderRadius: 12, padding: '12px 14px', fontSize: 16, outline: 'none', fontFamily: 'inherit', color: '#181922' };

export default function Family({ nav: _nav, onSignOut }: { nav: Nav; onSignOut: () => void }) {
  const { state, user, run, flash, deleteAccount, setLockEnabled } = useStore();
  const [inviting, setInviting] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [inviteAddr, setInviteAddr] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [cal, setCal] = useState<{ url: string; webcal: string } | null>(null);
  const [calBusy, setCalBusy] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [pinA, setPinA] = useState('');
  const [pinB, setPinB] = useState('');
  const [lockBusy, setLockBusy] = useState(false);
  const [editMember, setEditMember] = useState<{ id: string; name: string; role: string; color: string } | null>(null);
  // Removing a member is a two-step confirm (the trash icon reveals Remove/Cancel)
  // so nobody wipes a person - and their assignments - on an accidental tap.
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  if (!state) return null;

  const doImport = async () => {
    const url = importUrl.trim();
    if (url.length < 6) return flash('Paste your calendar link first');
    setImportBusy(true);
    // run() applies the returned state (imported events + the new source) on
    // success, or shows the server's specific error on failure.
    await run(api.addCalendarSource({ url }), 'Calendar imported');
    setImportBusy(false);
    setImportUrl('');
  };

  const saveMember = () => {
    if (!editMember) return;
    const name = editMember.name.trim();
    if (!name) return flash('Add a name');
    run(api.updMember(editMember.id, { name, role: editMember.role.trim(), color: editMember.color }), 'Member updated');
    setEditMember(null);
  };
  const locked = !!user?.locked;
  const s: Settings = state.household.settings || {};

  const changePassword = async () => {
    if (newPw.length < 8) return flash('New password must be at least 8 characters');
    setPwBusy(true);
    try {
      await api.changePassword({ currentPassword: curPw || undefined, newPassword: newPw });
      flash('Password updated');
      setPwOpen(false);
      setCurPw('');
      setNewPw('');
    } catch (e: any) {
      flash(e?.message || 'Could not update password');
    } finally {
      setPwBusy(false);
    }
  };
  const loadCal = async () => {
    setCalBusy(true);
    try {
      setCal(await api.calendarFeed());
    } catch (e: any) {
      flash(e?.message || 'Could not load calendar link');
    } finally {
      setCalBusy(false);
    }
  };
  const copyCal = async () => {
    if (!cal) return;
    try {
      await navigator.clipboard.writeText(cal.url);
      flash('Calendar link copied');
    } catch {
      flash('Could not copy - long-press to copy');
    }
  };
  const enableLock = async () => {
    if (!/^\d{4,8}$/.test(pinA)) return flash('Passcode must be 4-8 digits');
    if (pinA !== pinB) return flash('Passcodes don’t match');
    setLockBusy(true);
    try {
      await api.lockSet(pinA);
      setLockEnabled(true);
      flash('App lock turned on');
      setLockOpen(false); setPinA(''); setPinB('');
    } catch (e: any) {
      flash(e?.message || 'Could not set passcode');
    } finally {
      setLockBusy(false);
    }
  };
  const disableLock = async () => {
    if (!/^\d{4,8}$/.test(pinA)) return flash('Enter your passcode');
    setLockBusy(true);
    try {
      await api.lockDisable(pinA);
      setLockEnabled(false);
      flash('App lock turned off');
      setLockOpen(false); setPinA('');
    } catch (e: any) {
      flash(e?.message || 'Incorrect passcode');
    } finally {
      setLockBusy(false);
    }
  };
  const doDelete = async () => {
    setDelBusy(true);
    try {
      await deleteAccount();
      // store clears user/state → app returns to sign-in automatically
    } catch (e: any) {
      flash(e?.message || 'Could not delete account');
      setDelBusy(false);
    }
  };

  const invite = () => {
    const v = inviteName.trim();
    if (!v) return;
    run(api.addMember({ name: v }), `${v} added to the family`);
    setInviteName('');
    setInviting(false);
  };

  const makeInviteLink = async () => {
    setLinkBusy(true);
    try {
      const { token } = await api.createInvite();
      const url = `${window.location.origin}/join/${token}`;
      setInviteLink(url);
      const shared = await nativeShare({ title: 'Join our home on Croft', text: `Join ${state.household.name} on Croft`, url });
      if (!shared && navigator.share) {
        navigator.share({ title: 'Join our home on Croft', text: `Join ${state.household.name} on Croft`, url }).catch(() => {});
      }
    } catch (e: any) {
      flash(e?.message || 'Could not create invite');
    } finally {
      setLinkBusy(false);
    }
  };
  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      flash('Invite link copied');
    } catch {
      flash('Could not copy - long-press to copy');
    }
  };
  const sendEmailInvite = async () => {
    const addr = inviteAddr.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return flash('Enter a valid email address');
    setEmailBusy(true);
    try {
      const { emailed } = await api.createInvite({ email: addr });
      flash(emailed ? `Invite emailed to ${addr}` : 'Created - email didn’t send, share a link instead');
      setInviteAddr('');
    } catch (e: any) {
      flash(e?.message || 'Could not send invite');
    } finally {
      setEmailBusy(false);
    }
  };

  const onOff = (key: keyof Settings) => (s[key] ? 'On' : 'Off');

  const togglePush = async () => {
    if (!s.push) {
      const ok = await enablePush();
      if (!ok) return flash('Allow notifications in your browser/device settings');
      run(api.setSetting('push', true), 'Push notifications on');
    } else {
      await disablePush();
      run(api.setSetting('push', false), 'Push notifications off');
    }
  };

  const notifRows = [
    { key: 'push' as const, illo: 'bell', label: 'Push notifications', detail: onOff('push'), good: !!s.push },
  ];

  // Email cadence: what summaries land in your inbox. Legacy households only had
  // an on/off `email` flag; mirror the server's mapping (on -> both, off -> off).
  const CADENCES = [
    { key: 'off' as const, label: 'Off', detail: 'No summary emails' },
    { key: 'daily' as const, label: 'Daily', detail: 'A short digest each morning when there’s something on' },
    { key: 'weekly' as const, label: 'Weekly', detail: 'A “week ahead” overview every Sunday evening' },
    { key: 'both' as const, label: 'Both', detail: 'Daily digest and the weekly overview' },
  ];
  const cadence: EmailCadence = CADENCES.some((c) => c.key === s.emailCadence)
    ? (s.emailCadence as EmailCadence)
    : (s.email === false ? 'off' : 'both');
  const cadenceDetail = CADENCES.find((c) => c.key === cadence)!.detail;

  return (
    <div>
      <div style={{ margin: '8px 2px 18px' }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em' }}>Family</div>
        <div style={{ marginTop: 4, color: '#6F6C67', fontSize: 14, fontWeight: 500 }}>{state.household.name} · {state.members.length} members</div>
      </div>

      {/* members */}
      <div style={{ background: '#fff', borderRadius: 22, padding: '4px 16px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 14 }}>
        {state.members.map((m) => (
          editMember?.id === m.id ? (
            <div key={m.id} style={{ padding: '13px 0', borderBottom: '1px solid #EFEBE3' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input autoFocus value={editMember.name} onChange={(e) => setEditMember({ ...editMember, name: e.target.value })} placeholder="Name" style={{ flex: 1.4, minWidth: 0, border: '1.5px solid #E8E3DB', background: '#fff', borderRadius: 12, padding: '11px 13px', fontSize: 16, outline: 'none', color: '#181922' }} />
                <input value={editMember.role} onChange={(e) => setEditMember({ ...editMember, role: e.target.value })} placeholder="Role (e.g. Mom)" style={{ flex: 1, minWidth: 0, border: '1.5px solid #E8E3DB', background: '#fff', borderRadius: 12, padding: '11px 13px', fontSize: 16, outline: 'none', color: '#181922' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                {['#3B5BFF', '#7A5CFF', '#16C098', '#FF6B5C', '#FFB020', '#FF5C8A'].map((c) => (
                  <button key={c} onClick={() => setEditMember({ ...editMember, color: c })} aria-label={`Colour ${c}`} style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: editMember.color === c ? '3px solid #181922' : '3px solid transparent', cursor: 'pointer', padding: 0 }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveMember} style={{ flex: 1, border: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 13.5, padding: '10px', borderRadius: 12, cursor: 'pointer' }}>Save</button>
                <button onClick={() => setEditMember(null)} style={{ flex: 1, border: '1.5px solid #E8E3DB', background: '#fff', color: '#181922', fontWeight: 700, fontSize: 13.5, padding: '10px', borderRadius: 12, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0', borderBottom: '1px solid #EFEBE3' }}>
            <Avatar color={m.color} initial={m.initial} size={46} />
            <div
              role="button"
              tabIndex={0}
              aria-label={`Edit ${m.name}`}
              onClick={() => setEditMember({ id: m.id, name: m.name, role: m.role, color: m.color })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditMember({ id: m.id, name: m.name, role: m.role, color: m.color }); } }}
              style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            >
              <div style={{ fontWeight: 700, fontSize: 15.5 }}>{m.name}</div>
              <div style={{ fontSize: 12.5, color: '#6F6C67' }}>{m.role || 'Tap to edit'}</div>
            </div>
            {m.you ? <YouBadge /> : confirmRemove === m.id ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button onClick={() => { run(api.delMember(m.id), `${m.name} removed`); setConfirmRemove(null); }} style={{ border: 'none', background: '#E23A54', color: '#fff', fontWeight: 700, fontSize: 12, padding: '7px 12px', borderRadius: 100, cursor: 'pointer' }}>Remove</button>
                <button onClick={() => setConfirmRemove(null)} style={{ border: '1.5px solid #E8E3DB', background: '#fff', color: '#181922', fontWeight: 700, fontSize: 12, padding: '6px 12px', borderRadius: 100, cursor: 'pointer' }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmRemove(m.id)} title="Remove" aria-label={`Remove ${m.name}`} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 7V5h4v2M9 7l.7 12h8.6L19 7" stroke="#C9C3B9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
          </div>
          )
        ))}
        <div style={{ height: 4 }} />
      </div>

      {inviteLink ? (
        <div style={{ background: '#fff', borderRadius: 18, padding: 16, boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 26 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>Invite link ready</div>
          <div style={{ fontSize: 12.5, color: '#6F6C67', marginBottom: 12 }}>Share this with the person you want to join {state.household.name}. It works once and expires in 14 days.</div>
          <input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E8E3DB', background: '#F5F4F1', borderRadius: 12, padding: '11px 13px', fontSize: 16, color: '#3B5BFF', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyLink} style={{ flex: 1, border: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 14, padding: '11px', borderRadius: 12, cursor: 'pointer' }}>Copy link</button>
            <button onClick={async () => { if (!(await nativeShare({ title: 'Join our home on Croft', url: inviteLink }))) (navigator as any).share?.({ title: 'Join our home on Croft', url: inviteLink }).catch(() => {}); }} style={{ flex: 1, border: '1.5px solid #E8E3DB', background: '#fff', color: '#181922', fontWeight: 700, fontSize: 14, padding: '11px', borderRadius: 12, cursor: 'pointer' }}>Share</button>
          </div>
          <button onClick={() => setInviteLink(null)} style={{ width: '100%', border: 'none', background: 'none', color: '#7D776E', fontWeight: 700, fontSize: 13.5, padding: '12px 0 2px', cursor: 'pointer' }}>Done</button>
        </div>
      ) : inviting ? (
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input autoFocus value={inviteName} onChange={(e) => setInviteName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && invite()} placeholder="Name (e.g. a young child)" style={{ flex: 1, border: '1.5px solid #E8E3DB', background: '#fff', borderRadius: 14, padding: '13px 16px', fontSize: 16, outline: 'none' }} />
            <button onClick={invite} style={{ border: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 14, padding: '0 18px', borderRadius: 14, cursor: 'pointer' }}>Add</button>
          </div>
          <button onClick={() => setInviting(false)} style={{ border: 'none', background: 'none', color: '#7D776E', fontWeight: 700, fontSize: 13, padding: '8px 2px 0', cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={inviteAddr} onChange={(e) => setInviteAddr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendEmailInvite()} type="email" placeholder="Email address to invite" style={{ flex: 1, border: '1.5px solid #E8E3DB', background: '#fff', borderRadius: 14, padding: '13px 16px', fontSize: 16, outline: 'none' }} />
            <button onClick={sendEmailInvite} disabled={emailBusy} style={{ border: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 14, padding: '0 20px', borderRadius: 14, cursor: 'pointer', opacity: emailBusy ? 0.6 : 1 }}>{emailBusy ? '…' : 'Invite'}</button>
          </div>
          <button onClick={makeInviteLink} disabled={linkBusy} style={{ width: '100%', border: 'none', background: 'none', color: '#3B5BFF', fontWeight: 700, fontSize: 13.5, padding: '11px 0 0', cursor: 'pointer' }}>
            {linkBusy ? 'Creating link…' : 'or copy an invite link to share'}
          </button>
          <button onClick={() => setInviting(true)} style={{ width: '100%', border: 'none', background: 'none', color: '#7D776E', fontWeight: 700, fontSize: 13, padding: '8px 0 0', cursor: 'pointer' }}>Add someone without an account</button>
        </div>
      )}

      {/* household info board */}
      <HouseholdInfo />

      {/* notifications & reminders */}
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 4px' }}>Notifications & reminders</div>
      <div style={{ fontSize: 12.5, color: '#6F6C67', margin: '0 2px 12px' }}>How Croft reaches you and the family</div>
      <div style={{ background: '#fff', borderRadius: 22, padding: '4px 16px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 26 }}>
        {notifRows.map((r) => (
          <SettingRow key={r.key} illo={r.illo} iconColor={(r as any).iconColor} label={r.label} detail={r.detail} good={r.good} onClick={() => togglePush()} />
        ))}
        {/* Email summaries: a segmented cadence picker rather than a plain toggle. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 0 10px' }}>
          <Icon name="mail" color="#3B5BFF" size={38} radius={11} glyph={20} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>Email summaries</div>
            <div style={{ fontSize: 12, color: '#6F6C67', marginTop: 2 }}>{cadenceDetail}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, paddingBottom: 12 }}>
          {CADENCES.map((c) => {
            const on = cadence === c.key;
            return (
              <button
                key={c.key}
                onClick={() => run(api.setSetting('emailCadence', c.key), `Email summaries: ${c.label.toLowerCase()}`)}
                aria-pressed={on}
                style={{ flex: 1, padding: '9px 0', borderRadius: 11, border: on ? '1.5px solid #3B5BFF' : '1.5px solid #E8E3DB', background: on ? '#EEF1FF' : '#fff', color: on ? '#3B5BFF' : '#6B6459', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* calendar subscription */}
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 4px' }}>Calendar</div>
      <div style={{ fontSize: 12.5, color: '#6F6C67', margin: '0 2px 12px' }}>See Croft events in Apple or Google Calendar</div>
      <div style={{ background: '#fff', borderRadius: 22, padding: 16, boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 26 }}>
        {cal ? (
          <>
            <div style={{ fontSize: 13, color: '#6F6C67', lineHeight: 1.5, marginBottom: 12 }}>Subscribe once and your family’s events stay in sync in your calendar app - new events appear automatically.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href={cal.webcal} style={{ flex: 1, minWidth: 150, textAlign: 'center', textDecoration: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 13.5, padding: '11px', borderRadius: 12 }}>Add to Apple Calendar</a>
              <button onClick={copyCal} style={{ flex: 1, minWidth: 150, border: '1.5px solid #E8E3DB', background: '#fff', color: '#181922', fontWeight: 700, fontSize: 13.5, padding: '11px', borderRadius: 12, cursor: 'pointer' }}>Copy link for Google</button>
            </div>
            <div style={{ fontSize: 11.5, color: '#7D776E', marginTop: 10, lineHeight: 1.45 }}>In Google Calendar, choose "Other calendars", then "From URL", and paste the copied link.</div>
            <div style={{ fontSize: 11.5, color: '#9C968D', marginTop: 8, lineHeight: 1.45 }}>Apple Calendar updates within minutes (set the refresh in Settings). Google refreshes subscribed calendars on its own schedule, so new events can take a few hours to appear there.</div>
          </>
        ) : (
          <button onClick={loadCal} disabled={calBusy} style={{ width: '100%', border: '1.5px dashed #D2CCC1', background: 'transparent', color: '#6B6459', fontWeight: 700, fontSize: 14, padding: 14, borderRadius: 14, cursor: 'pointer', opacity: calBusy ? 0.6 : 1 }}>
            {calBusy ? 'Getting your link…' : 'Subscribe in your calendar'}
          </button>
        )}
      </div>

      {/* import an existing calendar */}
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 4px' }}>Import a calendar</div>
      <div style={{ fontSize: 12.5, color: '#6F6C67', margin: '0 2px 12px' }}>Bring your Google or Apple calendar into Croft</div>
      <div style={{ background: '#fff', borderRadius: 22, padding: 16, boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 26 }}>
        {(state.calendarSources || []).map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderBottom: '1px solid #EFEBE3' }}>
            <span style={{ flexShrink: 0, width: 12, height: 12, borderRadius: 4, background: s.color }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
              <div style={{ fontSize: 11.5, color: s.error ? '#FF4D5E' : '#6F6C67', marginTop: 1 }}>
                {s.error ? s.error : `${s.count} event${s.count === 1 ? '' : 's'}${s.last_synced ? ' · synced ' + s.last_synced : ''}`}
              </div>
            </div>
            <button onClick={() => run(api.refreshCalendarSource(s.id), 'Calendar refreshed')} aria-label="Refresh" style={{ flexShrink: 0, border: 'none', background: '#EFEBE3', color: '#3B5BFF', fontWeight: 700, fontSize: 12, padding: '7px 11px', borderRadius: 100, cursor: 'pointer' }}>Refresh</button>
            <button onClick={() => run(api.delCalendarSource(s.id), 'Calendar removed')} aria-label={`Remove ${s.name}`} style={{ flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 7V5h4v2M9 7l.7 12h8.6L19 7" stroke="#C9C3B9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: (state.calendarSources || []).length ? 12 : 0 }}>
          <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doImport()} placeholder="Paste your calendar's secret iCal link" style={{ flex: 1, minWidth: 0, border: '1.5px solid #E8E3DB', background: '#fff', borderRadius: 14, padding: '12px 14px', fontSize: 16, outline: 'none', color: '#181922' }} />
          <button onClick={doImport} disabled={importBusy} style={{ flexShrink: 0, border: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 14, padding: '0 18px', borderRadius: 14, cursor: 'pointer', opacity: importBusy ? 0.6 : 1 }}>{importBusy ? '…' : 'Import'}</button>
        </div>
        <div style={{ fontSize: 11.5, color: '#7D776E', marginTop: 10, lineHeight: 1.45 }}>
          In Google Calendar: Settings → your calendar → "Integrate calendar" → copy the "Secret address in iCal format". Imported events show in Croft (read-only) and refresh daily.
        </div>
      </div>

      {/* account & security */}
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 12px' }}>Account & security</div>
      <div style={{ background: '#fff', borderRadius: 22, padding: '4px 16px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 12 }}>
        <SettingRow illo="lock" label="Change password" detail="" onClick={() => setPwOpen((v) => !v)} />
        <SettingRow illo="cloud" label="Auto-backup & sync" detail="On" good onClick={() => flash('Your data backs up and syncs automatically')} />
        <SettingRow illo="lock" label="App lock (passcode)" detail={locked ? 'On' : 'Off'} good={locked} onClick={() => { setLockOpen((v) => !v); setPinA(''); setPinB(''); }} />
        <div style={{ height: 4 }} />
      </div>

      {lockOpen && (
        <div style={{ background: '#fff', borderRadius: 18, padding: 16, boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>{locked ? 'Turn off app lock' : 'Set a passcode'}</div>
          <div style={{ fontSize: 12.5, color: '#6F6C67', marginBottom: 12, lineHeight: 1.45 }}>
            {locked ? 'Enter your current passcode to turn off the lock.' : 'A 4-8 digit code you’ll enter each time you open Croft. Forgot it? Sign out and back in to reset.'}
          </div>
          <input inputMode="numeric" type="password" maxLength={8} value={pinA} onChange={(e) => setPinA(e.target.value.replace(/\D/g, ''))} placeholder={locked ? 'Passcode' : 'New passcode (4-8 digits)'} style={pwInput} />
          {!locked && <input inputMode="numeric" type="password" maxLength={8} value={pinB} onChange={(e) => setPinB(e.target.value.replace(/\D/g, ''))} placeholder="Confirm passcode" style={{ ...pwInput, marginTop: 8 }} />}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={locked ? disableLock : enableLock} disabled={lockBusy} style={{ flex: 1, border: 'none', background: locked ? '#E23A54' : '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 14, padding: 11, borderRadius: 12, cursor: 'pointer', opacity: lockBusy ? 0.6 : 1 }}>{lockBusy ? '…' : locked ? 'Turn off' : 'Turn on lock'}</button>
            <button onClick={() => { setLockOpen(false); setPinA(''); setPinB(''); }} style={{ border: '1.5px solid #E8E3DB', background: '#fff', color: '#181922', fontWeight: 700, fontSize: 14, padding: '11px 18px', borderRadius: 12, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {pwOpen && (
        <div style={{ background: '#fff', borderRadius: 18, padding: 16, boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 12 }}>Change password</div>
          <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="Current password (blank if you use Google)" style={pwInput} />
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password (8+ characters)" style={{ ...pwInput, marginTop: 8 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={changePassword} disabled={pwBusy} style={{ flex: 1, border: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 14, padding: 11, borderRadius: 12, cursor: 'pointer', opacity: pwBusy ? 0.6 : 1 }}>{pwBusy ? 'Saving…' : 'Save'}</button>
            <button onClick={() => { setPwOpen(false); setCurPw(''); setNewPw(''); }} style={{ border: '1.5px solid #E8E3DB', background: '#fff', color: '#181922', fontWeight: 700, fontSize: 14, padding: '11px 18px', borderRadius: 12, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <button onClick={onSignOut} style={{ width: '100%', border: 'none', background: 'transparent', color: '#7D776E', fontWeight: 700, fontSize: 14, padding: 12, cursor: 'pointer' }}>Sign out</button>

      {/* danger zone */}
      {confirmDelete ? (
        <div style={{ background: '#fff', border: '1.5px solid #FBD9DE', borderRadius: 18, padding: 16, marginTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>Delete your account?</div>
          <div style={{ fontSize: 12.5, color: '#6F6C67', marginBottom: 12, lineHeight: 1.5 }}>
            This removes you from {state.household.name}. If you’re the last member, the household and all its data are permanently deleted. This can’t be undone.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={doDelete} disabled={delBusy} style={{ flex: 1, border: 'none', background: '#E23A54', color: '#fff', fontWeight: 700, fontSize: 14, padding: 11, borderRadius: 12, cursor: 'pointer', opacity: delBusy ? 0.6 : 1 }}>{delBusy ? 'Deleting…' : 'Yes, delete my account'}</button>
            <button onClick={() => setConfirmDelete(false)} style={{ border: '1.5px solid #E8E3DB', background: '#fff', color: '#181922', fontWeight: 700, fontSize: 14, padding: '11px 18px', borderRadius: 12, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} style={{ width: '100%', border: 'none', background: 'transparent', color: '#E23A54', fontWeight: 700, fontSize: 13.5, padding: 10, cursor: 'pointer' }}>Delete account</button>
      )}
    </div>
  );
}

function HouseholdInfo() {
  const { state, run, flash } = useStore();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [cat, setCat] = useState('General');
  if (!state) return null;
  const items = state.householdInfo || [];
  const cats = ['General', 'Wifi', 'Emergency', 'Medical', 'Codes'];
  const reset = () => { setOpen(false); setEditId(null); setLabel(''); setValue(''); setCat('General'); };
  const save = () => {
    const l = label.trim();
    if (!l) return flash('Add a label');
    const d = { category: cat, label: l, value: value.trim() };
    run(editId ? api.updInfo(editId, d) : api.addInfo(d), editId ? 'Saved' : 'Added');
    reset();
  };
  const startEdit = (it: { id: string; category: string; label: string; value: string }) => { setEditId(it.id); setLabel(it.label); setValue(it.value); setCat(it.category || 'General'); setOpen(true); };

  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 4px' }}>Household info</div>
      <div style={{ fontSize: 12.5, color: '#6F6C67', margin: '0 2px 12px' }}>Wifi, emergency contacts, codes — handy for everyone</div>
      <div style={{ background: '#fff', borderRadius: 22, padding: 16, boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)' }}>
        {items.map((it) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 0', borderBottom: '1px solid #EFEBE3' }}>
            <div role="button" tabIndex={0} aria-label={`Edit ${it.label}`} onClick={() => startEdit(it)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(it); } }} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{it.label}</span>
                {it.category && it.category !== 'General' && <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em', color: '#6D5CD6', background: 'rgba(140,124,255,0.16)', padding: '2px 6px', borderRadius: 100 }}>{it.category}</span>}
              </div>
              <div style={{ fontSize: 13, color: '#3A362F', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{it.value || '—'}</div>
            </div>
            <button onClick={() => run(api.delInfo(it.id), 'Removed')} aria-label={`Remove ${it.label}`} style={{ flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 7V5h4v2M9 7l.7 12h8.6L19 7" stroke="#C9C3B9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        ))}
        {open ? (
          <div style={{ paddingTop: 12 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {cats.map((c) => <button key={c} onClick={() => setCat(c)} style={{ border: 'none', cursor: 'pointer', padding: '7px 12px', borderRadius: 100, fontWeight: 700, fontSize: 12, background: cat === c ? '#3B5BFF' : '#EBE7DF', color: cat === c ? '#fff' : '#181922' }}>{c}</button>)}
            </div>
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Wifi password)" style={{ ...pwInput, marginBottom: 8 }} />
            <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value (e.g. the password, a phone number, a code)" rows={2} style={{ ...pwInput, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={save} style={{ flex: 1, border: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 14, padding: 11, borderRadius: 12, cursor: 'pointer' }}>{editId ? 'Save' : 'Add'}</button>
              <button onClick={reset} style={{ border: '1.5px solid #E8E3DB', background: '#fff', color: '#181922', fontWeight: 700, fontSize: 14, padding: '11px 18px', borderRadius: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} style={{ width: '100%', border: 'none', background: 'none', color: '#3B5BFF', fontWeight: 700, fontSize: 13.5, padding: '12px 0 2px', cursor: 'pointer' }}>+ Add info</button>
        )}
      </div>
    </div>
  );
}

function SettingRow({ illo, iconColor = '#3B5BFF', label, detail, good, onClick }: { illo: string; iconColor?: string; label: string; detail: string; good?: boolean; onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label}${detail ? ', ' + detail : ''}`}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 0', borderBottom: '1px solid #EFEBE3', cursor: 'pointer' }}
    >
      <Icon name={illo} color={iconColor} size={38} radius={11} glyph={20} />
      <div style={{ flex: 1, fontWeight: 600, fontSize: 14.5 }}>{label}</div>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: good ? '#16C098' : '#6F6C67' }}>{detail}</span>
      <svg width="8" height="14" viewBox="0 0 8 14" style={{ flexShrink: 0 }} aria-hidden="true"><path d="M1 1l6 6-6 6" stroke="#C9C3B9" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
}
