import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowLeft,
  CheckCircle2,
  Inbox,
  Lock,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { getMessage, getOwnerAuthUrl, getPolicy, listMessages, sendMessage } from './lib/mailApi';
import type { MailDetail, MailSummary, Policy } from './lib/mailApi';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { Logo } from './Logo';

type LoadState = 'idle' | 'loading' | 'error';
type Toast = { id: number; kind: 'good' | 'bad'; text: string };

/* ---------- helpers ---------- */

function parseAddress(raw: string): { name: string; email: string } {
  if (!raw) return { name: 'Unknown', email: '' };
  const match = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim();
    const email = match[2].trim();
    return { name: name || email, email };
  }
  const email = raw.trim();
  return { name: email.split('@')[0] || email, email };
}

function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relativeTime(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  const diff = Date.now() - ms;
  const sec = Math.round(diff / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (sec < 60) return 'now';
  if (min < 60) return `${min}m`;
  if (hr < 24) return `${hr}h`;
  if (day < 7) return `${day}d`;
  const date = new Date(ms);
  const now = new Date();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export function App() {
  if (!isSupabaseConfigured) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-mark">
            <Logo size={26} />
          </div>
          <span className="brand-wordmark">LUMATOTECH</span>
          <h1>Setup needed</h1>
          <p className="lede">
            This portal is missing its connection details. Add the environment variables and redeploy
            to continue.
          </p>
          <div className="config-note">VITE_SUPABASE_URL · VITE_SUPABASE_PUBLISHABLE_KEY</div>
        </section>
      </main>
    );
  }

  return <ConfiguredApp />;
}

function ConfiguredApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [messages, setMessages] = useState<MailSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MailDetail | null>(null);
  const [detailState, setDetailState] = useState<LoadState>('idle');
  const [detailError, setDetailError] = useState('');

  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [replyBody, setReplyBody] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [sending, setSending] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const ownerName = useMemo(
    () => (policy ? parseAddress(policy.allowedContactEmail).name : ''),
    [policy],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) =>
      `${m.subject} ${m.from} ${m.to} ${m.snippet}`.toLowerCase().includes(q),
    );
  }, [messages, query]);

  const selectedSummary = useMemo(
    () => messages.find((m) => m.id === selectedId),
    [messages, selectedId],
  );

  function pushToast(kind: Toast['kind'], text: string) {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    void refreshMailbox(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    setDetailState('loading');
    setDetailError('');
    getMessage(selectedId)
      .then(({ message }) => {
        setSelected(message);
        setReplySubject(
          message.subject.startsWith('Re:') ? message.subject : `Re: ${message.subject || ''}`.trim(),
        );
        setDetailState('idle');
      })
      .catch((error: Error) => {
        setSelected(null);
        setDetailError(error.message);
        setDetailState('error');
      });
  }, [selectedId]);

  async function refreshMailbox(initial = false) {
    if (initial) setListLoading(true);
    else setRefreshing(true);
    setListError('');
    try {
      const [policyResponse, listResponse] = await Promise.all([getPolicy(), listMessages()]);
      setPolicy(policyResponse);
      setMessages(listResponse.messages);
      setSelectedId((current) => current ?? listResponse.messages[0]?.id ?? null);
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Could not load the mailbox.');
    } finally {
      setListLoading(false);
      setRefreshing(false);
    }
  }

  async function signIn() {
    setAuthError('');
    setSigningIn(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    setSigningIn(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMessages([]);
    setSelected(null);
    setSelectedId(null);
    setPolicy(null);
  }

  async function openOwnerAuth() {
    try {
      const setupToken = window.prompt('Owner setup token');
      if (!setupToken) return;
      const { url } = await getOwnerAuthUrl(setupToken);
      window.location.href = url;
    } catch (error) {
      pushToast('bad', error instanceof Error ? error.message : 'Could not start owner setup.');
    }
  }

  async function submitReply() {
    if (!replyBody.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage({ subject: replySubject, body: replyBody, threadId: selected?.threadId });
      setReplyBody('');
      pushToast('good', `Reply sent to ${ownerName || 'the allowed contact'}.`);
    } catch (error) {
      pushToast('bad', error instanceof Error ? error.message : 'Could not send reply.');
    } finally {
      setSending(false);
    }
  }

  /* ---------- auth screen ---------- */
  if (!session) {
    const canSubmit = email.includes('@') && password.length > 0 && !signingIn;
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-mark">
            <Logo size={26} />
          </div>
          <span className="brand-wordmark">LUMATOTECH</span>
          <h1>Restricted Email</h1>
          <p className="lede">
            A private channel with one trusted contact. No other inbox, no deletes, no surprises.
          </p>

          <form
            className="auth-fields"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) void signIn();
            }}
          >
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                placeholder="Your password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn" disabled={!canSubmit}>
              <LogIn size={18} />
              {signingIn ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {authError && <p className="auth-error">{authError}</p>}

          <button type="button" className="btn-ghost" onClick={openOwnerAuth}>
            <ShieldCheck size={16} />
            Owner Gmail setup
          </button>
        </section>
      </main>
    );
  }

  const userEmail = session.user.email ?? '';
  const view = selectedId ? 'reader' : 'list';

  /* ---------- main app ---------- */
  return (
    <main className="app-shell" data-view={view}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-row">
            <div className="brand-mark">
              <Logo size={20} />
            </div>
            <div className="titles">
              <h1>Restricted Email</h1>
              <span className="sub">LumatoTech</span>
            </div>
          </div>
          <button
            type="button"
            className={refreshing ? 'icon-button spinning' : 'icon-button'}
            onClick={() => refreshMailbox(false)}
            aria-label="Refresh mailbox"
            disabled={refreshing}
          >
            <RefreshCw size={17} />
          </button>
        </div>

        <div className="policy-strip">
          <span className="ps-icon">
            <ShieldCheck size={18} />
          </span>
          <div className="ps-body">
            <span className="ps-label">Allowed contact</span>
            <span className="ps-value">{policy?.allowedContactEmail ?? 'Pending setup'}</span>
          </div>
        </div>

        <div className="search-wrap">
          <Search size={16} />
          <input
            type="search"
            value={query}
            placeholder="Search this conversation"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search messages"
          />
        </div>

        <nav className="message-list" aria-label="Messages">
          {listLoading && <ListSkeleton />}

          {!listLoading && listError && (
            <div className="empty-list">
              <span className="ei">
                <TriangleAlert size={24} />
              </span>
              <strong>Couldn’t load messages</strong>
              <span>{listError}</span>
            </div>
          )}

          {!listLoading && !listError && filtered.length === 0 && (
            <div className="empty-list">
              <span className="ei">
                <Inbox size={24} />
              </span>
              <strong>{query ? 'No matches' : 'Nothing here yet'}</strong>
              <span>
                {query
                  ? 'Try a different search term.'
                  : `Messages with ${ownerName || 'the allowed contact'} will appear here.`}
              </span>
            </div>
          )}

          {!listLoading &&
            !listError &&
            filtered.map((message) => {
              const fromAddr = parseAddress(message.from);
              const sent = policy ? fromAddr.email !== policy.allowedContactEmail : false;
              const display = sent ? parseAddress(message.to) : fromAddr;
              return (
                <button
                  type="button"
                  key={message.id}
                  className={message.id === selectedId ? 'message-item active' : 'message-item'}
                  onClick={() => setSelectedId(message.id)}
                >
                  <span className={sent ? 'avatar sent' : 'avatar'} aria-hidden="true">
                    {initials(display.name)}
                  </span>
                  <span className="mi-body">
                    <span className="mi-top">
                      <span className="mi-name">{display.name}</span>
                      <span className="mi-time">{relativeTime(Number(message.internalDate))}</span>
                    </span>
                    <span className="mi-subject">
                      {sent && <span className="mi-tag">Sent</span>}
                      {message.subject || '(No subject)'}
                    </span>
                    <span className="mi-snippet">{message.snippet}</span>
                  </span>
                </button>
              );
            })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="avatar" aria-hidden="true">
              {initials(parseAddress(userEmail).name)}
            </span>
            <span className="ue">{userEmail}</span>
          </div>
          <button type="button" className="sign-out" onClick={signOut}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      <section className="reader">
        <header className="reader-header">
          <button
            type="button"
            className="back-button"
            onClick={() => setSelectedId(null)}
            aria-label="Back to messages"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="rh-titles">
            <h2>{selectedSummary?.subject || (selected ? '(No subject)' : 'Select a message')}</h2>
            <span className="rh-sub">
              {selected ? `With ${ownerName || 'allowed contact'}` : 'Read-only · reply stays in this thread'}
            </span>
          </div>
          <div className="lock-pill">
            <Lock size={14} />
            <span>Read-only mailbox</span>
          </div>
        </header>

        <div className="reader-scroll">
          {detailState === 'loading' && <LetterSkeleton />}

          {detailState === 'error' && (
            <div className="reader-state is-error">
              <span className="rs-icon">
                <TriangleAlert size={30} />
              </span>
              <strong>Couldn’t open this message</strong>
              <span>{detailError}</span>
            </div>
          )}

          {detailState === 'idle' && !selected && (
            <div className="reader-state">
              <span className="rs-icon">
                <Mail size={30} />
              </span>
              <strong>Open a message</strong>
              <span>Choose a message on the left to read it here.</span>
            </div>
          )}

          {detailState === 'idle' && selected && (
            <article className="message-view">
              <div className="message-meta">
                <span className="avatar" aria-hidden="true">
                  {initials(parseAddress(selected.from).name)}
                </span>
                <div className="mm-body">
                  <span className="mm-from">{parseAddress(selected.from).name}</span>
                  <span className="mm-route">to {parseAddress(selected.to).name}</span>
                </div>
                <span className="mm-date">
                  {new Date(Number(selected.internalDate)).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <pre className="message-body">{selected.bodyText || selected.snippet}</pre>
            </article>
          )}
        </div>

        <section className="composer" aria-label="Reply">
          <div className="composer-inner">
            {policy?.canSend ? (
              <>
                <div className="composer-header">
                  <h3>Reply</h3>
                  <span className="to-chip">
                    <Send size={13} />
                    To <b>{policy.allowedContactEmail}</b>
                  </span>
                </div>
                <input
                  value={replySubject}
                  placeholder="Subject"
                  onChange={(e) => setReplySubject(e.target.value)}
                  aria-label="Reply subject"
                />
                <textarea
                  value={replyBody}
                  placeholder={`Write to ${ownerName || 'the allowed contact'}…`}
                  onChange={(e) => setReplyBody(e.target.value)}
                  aria-label="Reply message"
                />
                <div className="composer-actions">
                  <span className="composer-hint">Replies are locked to the allowed contact.</span>
                  <button
                    type="button"
                    className="btn"
                    onClick={submitReply}
                    disabled={!replyBody.trim() || sending}
                  >
                    <Send size={17} />
                    {sending ? 'Sending…' : 'Send reply'}
                  </button>
                </div>
              </>
            ) : (
              <div className="composer-locked">
                <Lock size={16} />
                Sending is disabled by the current mailbox policy.
              </div>
            )}
          </div>
        </section>
      </section>

      <div className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'good' ? 'good' : 'bad'}`}>
            <span className="ti">
              {t.kind === 'good' ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />}
            </span>
            {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}

function ListSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="skeleton-item" key={i} style={{ opacity: 1 - i * 0.13 }}>
          <span className="sk sk-avatar" />
          <span className="sk-lines">
            <span className="sk sk-line" style={{ width: '62%' }} />
            <span className="sk sk-line" style={{ width: '88%' }} />
            <span className="sk sk-line" style={{ width: '40%' }} />
          </span>
        </div>
      ))}
    </>
  );
}

function LetterSkeleton() {
  return (
    <div className="letter-skeleton">
      <div style={{ display: 'flex', gap: 13, alignItems: 'center' }}>
        <span className="sk sk-avatar" style={{ width: 44, height: 44 }} />
        <span className="sk sk-line" style={{ width: 160, height: 11 }} />
      </div>
      <span className="sk sk-line" style={{ width: '100%' }} />
      <span className="sk sk-line" style={{ width: '92%' }} />
      <span className="sk sk-line" style={{ width: '96%' }} />
      <span className="sk sk-line" style={{ width: '70%' }} />
    </div>
  );
}
