import { useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/api';
import { enablePush, disablePush } from '../lib/push';
import type { Nav } from '../Shell';
import type { Settings } from '../lib/types';
import Icon from '../components/Icon';
import { Avatar, YouBadge } from './Onboarding';

const grotesk = "'Space Grotesk', sans-serif";
const pwInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1.5px solid #E4E9F2', background: '#fff', borderRadius: 12, padding: '12px 14px', fontSize: 14.5, outline: 'none', fontFamily: 'inherit', color: '#101426' };

export default function Family({ nav: _nav, onSignOut }: { nav: Nav; onSignOut: () => void }) {
  const { state, run, flash, deleteAccount } = useStore();
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
  if (!state) return null;
  const s: Settings = state.household.settings || {};

  const changePassword = async () => {
    if (newPw.length < 8) return flash('New password must be at least 8 characters');
    setPwBusy(true);
    try {
      await api.changePassword({ currentPassword: curPw || undefined, newPassword: newPw });
      flash('Password updated ✓');
      setPwOpen(false);
      setCurPw('');
      setNewPw('');
    } catch (e: any) {
      flash(e?.message || 'Could not update password');
    } finally {
      setPwBusy(false);
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
    run(api.addMember({ name: v }), `${v} added to the family ✓`);
    setInviteName('');
    setInviting(false);
  };

  const makeInviteLink = async () => {
    setLinkBusy(true);
    try {
      const { token } = await api.createInvite();
      const url = `${window.location.origin}/join/${token}`;
      setInviteLink(url);
      if (navigator.share) {
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
      flash('Invite link copied ✓');
    } catch {
      flash('Could not copy — long-press to copy');
    }
  };
  const sendEmailInvite = async () => {
    const addr = inviteAddr.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return flash('Enter a valid email address');
    setEmailBusy(true);
    try {
      const { emailed } = await api.createInvite({ email: addr });
      flash(emailed ? `Invite emailed to ${addr} ✓` : 'Created — email didn’t send, share a link instead');
      setInviteAddr('');
    } catch (e: any) {
      flash(e?.message || 'Could not send invite');
    } finally {
      setEmailBusy(false);
    }
  };

  const onOff = (key: keyof Settings) => (s[key] ? 'On' : 'Off');
  const conn = (key: keyof Settings) => (s[key] ? 'Connected' : 'Connect');
  const toggle = (key: keyof Settings, msg?: string) => run(api.setSetting(key, !s[key]), msg);

  const togglePush = async () => {
    if (!s.push) {
      const ok = await enablePush();
      if (!ok) return flash('Allow notifications in your browser/device settings');
      run(api.setSetting('push', true), 'Push notifications on ✓');
    } else {
      await disablePush();
      run(api.setSetting('push', false), 'Push notifications off');
    }
  };

  const notifRows = [
    { key: 'push' as const, illo: 'bell', label: 'Push notifications', detail: onOff('push'), good: !!s.push },
    { key: 'email' as const, illo: 'mail', label: 'Email reminders', detail: onOff('email'), good: !!s.email },
    { key: 'appleCal' as const, illo: 'calendar', label: 'Apple Calendar', detail: conn('appleCal'), good: !!s.appleCal },
    { key: 'googleCal' as const, illo: 'calendar', iconColor: '#FF6B5C', label: 'Google Calendar', detail: conn('googleCal'), good: !!s.googleCal },
    { key: 'iphoneReminders' as const, illo: 'alarm', label: 'iPhone Reminders', detail: onOff('iphoneReminders'), good: !!s.iphoneReminders },
  ];

  return (
    <div>
      <div style={{ margin: '8px 2px 18px' }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em' }}>Family</div>
        <div style={{ marginTop: 4, color: '#717A90', fontSize: 14, fontWeight: 500 }}>{state.household.name} · {state.members.length} members</div>
      </div>

      {/* members */}
      <div style={{ background: '#fff', borderRadius: 22, padding: '4px 16px', boxShadow: '0 2px 10px rgba(16,20,38,0.04)', marginBottom: 14 }}>
        {state.members.map((m) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0', borderBottom: '1px solid #F1F4FA' }}>
            <Avatar color={m.color} initial={m.initial} size={46} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15.5 }}>{m.name}</div>
              <div style={{ fontSize: 12.5, color: '#717A90' }}>{m.role}</div>
            </div>
            {m.you ? <YouBadge /> : (
              <button onClick={() => run(api.delMember(m.id), `${m.name} removed`)} title="Remove" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 7V5h4v2M9 7l.7 12h8.6L19 7" stroke="#C4CBDA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
          </div>
        ))}
        <div style={{ height: 4 }} />
      </div>

      {inviteLink ? (
        <div style={{ background: '#fff', borderRadius: 18, padding: 16, boxShadow: '0 2px 10px rgba(16,20,38,0.04)', marginBottom: 26 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>Invite link ready</div>
          <div style={{ fontSize: 12.5, color: '#717A90', marginBottom: 12 }}>Share this with the person you want to join {state.household.name}. It works once and expires in 14 days.</div>
          <input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E4E9F2', background: '#F7F9FD', borderRadius: 12, padding: '11px 13px', fontSize: 12.5, color: '#3B5BFF', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyLink} style={{ flex: 1, border: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 14, padding: '11px', borderRadius: 12, cursor: 'pointer' }}>Copy link</button>
            {typeof navigator !== 'undefined' && (navigator as any).share && (
              <button onClick={() => (navigator as any).share({ title: 'Join our home on Croft', url: inviteLink }).catch(() => {})} style={{ flex: 1, border: '1.5px solid #E4E9F2', background: '#fff', color: '#101426', fontWeight: 700, fontSize: 14, padding: '11px', borderRadius: 12, cursor: 'pointer' }}>Share</button>
            )}
          </div>
          <button onClick={() => setInviteLink(null)} style={{ width: '100%', border: 'none', background: 'none', color: '#9AA3B5', fontWeight: 700, fontSize: 13.5, padding: '12px 0 2px', cursor: 'pointer' }}>Done</button>
        </div>
      ) : inviting ? (
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input autoFocus value={inviteName} onChange={(e) => setInviteName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && invite()} placeholder="Name (e.g. a young child)" style={{ flex: 1, border: '1.5px solid #E4E9F2', background: '#fff', borderRadius: 14, padding: '13px 16px', fontSize: 14.5, outline: 'none' }} />
            <button onClick={invite} style={{ border: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 14, padding: '0 18px', borderRadius: 14, cursor: 'pointer' }}>Add</button>
          </div>
          <button onClick={() => setInviting(false)} style={{ border: 'none', background: 'none', color: '#9AA3B5', fontWeight: 700, fontSize: 13, padding: '8px 2px 0', cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={inviteAddr} onChange={(e) => setInviteAddr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendEmailInvite()} type="email" placeholder="Email address to invite" style={{ flex: 1, border: '1.5px solid #E4E9F2', background: '#fff', borderRadius: 14, padding: '13px 16px', fontSize: 14.5, outline: 'none' }} />
            <button onClick={sendEmailInvite} disabled={emailBusy} style={{ border: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 14, padding: '0 20px', borderRadius: 14, cursor: 'pointer', opacity: emailBusy ? 0.6 : 1 }}>{emailBusy ? '…' : 'Invite'}</button>
          </div>
          <button onClick={makeInviteLink} disabled={linkBusy} style={{ width: '100%', border: 'none', background: 'none', color: '#3B5BFF', fontWeight: 700, fontSize: 13.5, padding: '11px 0 0', cursor: 'pointer' }}>
            {linkBusy ? 'Creating link…' : 'or copy an invite link to share'}
          </button>
          <button onClick={() => setInviting(true)} style={{ width: '100%', border: 'none', background: 'none', color: '#9AA3B5', fontWeight: 700, fontSize: 13, padding: '8px 0 0', cursor: 'pointer' }}>Add someone without an account</button>
        </div>
      )}

      {/* notifications & reminders */}
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 4px' }}>Notifications & reminders</div>
      <div style={{ fontSize: 12.5, color: '#717A90', margin: '0 2px 12px' }}>How Croft reaches you and the family</div>
      <div style={{ background: '#fff', borderRadius: 22, padding: '4px 16px', boxShadow: '0 2px 10px rgba(16,20,38,0.04)', marginBottom: 26 }}>
        {notifRows.map((r) => (
          <SettingRow key={r.key} illo={r.illo} iconColor={(r as any).iconColor} label={r.label} detail={r.detail} good={r.good} onClick={() => (r.key === 'push' ? togglePush() : toggle(r.key, 'Updated ✓'))} />
        ))}
        <div style={{ height: 4 }} />
      </div>

      {/* account & security */}
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 12px' }}>Account & security</div>
      <div style={{ background: '#fff', borderRadius: 22, padding: '4px 16px', boxShadow: '0 2px 10px rgba(16,20,38,0.04)', marginBottom: 12 }}>
        <SettingRow illo="lock" label="Change password" detail="" onClick={() => setPwOpen((v) => !v)} />
        <SettingRow illo="cloud" label="Backup & sync" detail={onOff('backup')} good={!!s.backup} onClick={() => toggle('backup', 'Updated ✓')} />
        <SettingRow illo="shield" label="Face ID & passcode" detail={onOff('faceId')} good={!!s.faceId} onClick={() => toggle('faceId', 'Updated ✓')} />
        <div style={{ height: 4 }} />
      </div>

      {pwOpen && (
        <div style={{ background: '#fff', borderRadius: 18, padding: 16, boxShadow: '0 2px 10px rgba(16,20,38,0.04)', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 12 }}>Change password</div>
          <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="Current password (blank if you use Google)" style={pwInput} />
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password (8+ characters)" style={{ ...pwInput, marginTop: 8 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={changePassword} disabled={pwBusy} style={{ flex: 1, border: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 14, padding: 11, borderRadius: 12, cursor: 'pointer', opacity: pwBusy ? 0.6 : 1 }}>{pwBusy ? 'Saving…' : 'Save'}</button>
            <button onClick={() => { setPwOpen(false); setCurPw(''); setNewPw(''); }} style={{ border: '1.5px solid #E4E9F2', background: '#fff', color: '#101426', fontWeight: 700, fontSize: 14, padding: '11px 18px', borderRadius: 12, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <button onClick={onSignOut} style={{ width: '100%', border: 'none', background: 'transparent', color: '#9AA3B5', fontWeight: 700, fontSize: 14, padding: 12, cursor: 'pointer' }}>Sign out</button>

      {/* danger zone */}
      {confirmDelete ? (
        <div style={{ background: '#fff', border: '1.5px solid #FBD9DE', borderRadius: 18, padding: 16, marginTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>Delete your account?</div>
          <div style={{ fontSize: 12.5, color: '#717A90', marginBottom: 12, lineHeight: 1.5 }}>
            This removes you from {state.household.name}. If you’re the last member, the household and all its data are permanently deleted. This can’t be undone.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={doDelete} disabled={delBusy} style={{ flex: 1, border: 'none', background: '#E23A54', color: '#fff', fontWeight: 700, fontSize: 14, padding: 11, borderRadius: 12, cursor: 'pointer', opacity: delBusy ? 0.6 : 1 }}>{delBusy ? 'Deleting…' : 'Yes, delete my account'}</button>
            <button onClick={() => setConfirmDelete(false)} style={{ border: '1.5px solid #E4E9F2', background: '#fff', color: '#101426', fontWeight: 700, fontSize: 14, padding: '11px 18px', borderRadius: 12, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} style={{ width: '100%', border: 'none', background: 'transparent', color: '#E23A54', fontWeight: 700, fontSize: 13.5, padding: 10, cursor: 'pointer' }}>Delete account</button>
      )}
    </div>
  );
}

function SettingRow({ illo, iconColor = '#3B5BFF', label, detail, good, onClick }: { illo: string; iconColor?: string; label: string; detail: string; good?: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 0', borderBottom: '1px solid #F1F4FA', cursor: 'pointer' }}>
      <Icon name={illo} color={iconColor} size={38} radius={11} glyph={20} />
      <div style={{ flex: 1, fontWeight: 600, fontSize: 14.5 }}>{label}</div>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: good ? '#16C098' : '#717A90' }}>{detail}</span>
      <svg width="8" height="14" viewBox="0 0 8 14" style={{ flexShrink: 0 }}><path d="M1 1l6 6-6 6" stroke="#C4CBDA" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
}
