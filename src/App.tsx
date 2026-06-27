import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Inbox, Lock, LogIn, LogOut, Mail, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { getMessage, getOwnerAuthUrl, getPolicy, listMessages, sendMessage } from './lib/mailApi';
import type { MailDetail, MailSummary, Policy } from './lib/mailApi';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type LoadState = 'idle' | 'loading' | 'error';

export function App() {
  if (!isSupabaseConfigured) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-mark">
            <Lock size={26} />
          </div>
          <h1>Missing Config</h1>
          <p>Set the Vercel environment variables and redeploy the project.</p>
          <div className="notice">Required: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY</div>
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
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [messages, setMessages] = useState<MailSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MailDetail | null>(null);
  const [status, setStatus] = useState<LoadState>('idle');
  const [notice, setNotice] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [replySubject, setReplySubject] = useState('');

  const selectedSummary = useMemo(
    () => messages.find((message) => message.id === selectedId),
    [messages, selectedId],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    void refreshMailbox();
  }, [session]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }

    setStatus('loading');
    getMessage(selectedId)
      .then(({ message }) => {
        setSelected(message);
        setReplySubject(message.subject.startsWith('Re:') ? message.subject : `Re: ${message.subject}`);
      })
      .catch((error: Error) => {
        setNotice(error.message);
        setSelected(null);
        setStatus('error');
      })
      .finally(() => setStatus('idle'));
  }, [selectedId]);

  async function refreshMailbox() {
    setStatus('loading');
    setNotice('');

    try {
      const [policyResponse, listResponse] = await Promise.all([getPolicy(), listMessages()]);
      setPolicy(policyResponse);
      setMessages(listResponse.messages);
      setSelectedId((current) => current ?? listResponse.messages[0]?.id ?? null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load mailbox.');
      setStatus('error');
    } finally {
      setStatus('idle');
    }
  }

  async function signIn() {
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthError(error.message);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMessages([]);
    setSelected(null);
    setSelectedId(null);
  }

  async function openOwnerAuth() {
    try {
      const setupToken = window.prompt('Owner setup token');
      if (!setupToken) return;

      const { url } = await getOwnerAuthUrl(setupToken);
      window.location.href = url;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not start owner authorization.');
    }
  }

  async function submitReply() {
    if (!replyBody.trim()) return;

    setStatus('loading');
    setNotice('');

    try {
      await sendMessage({
        subject: replySubject,
        body: replyBody,
        threadId: selected?.threadId,
      });
      setReplyBody('');
      setNotice('Reply sent to the allowed contact.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send reply.');
    } finally {
      setStatus('idle');
    }
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-mark">
            <Lock size={26} />
          </div>
          <h1>Locked Mail</h1>
          <p>Sign in with the shared credentials to open the restricted mailbox.</p>

          <label htmlFor="email">Email address</label>
          <div className="auth-fields">
            <input
              id="email"
              type="email"
              value={email}
              placeholder="friend@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              placeholder="Password"
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="button" onClick={signIn} disabled={!email.includes('@') || password.length < 1}>
              <LogIn size={18} />
              Sign in
            </button>
          </div>

          {authError && <p className="error">{authError}</p>}

          <button type="button" className="owner-link" onClick={openOwnerAuth}>
            Owner Gmail setup
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <span className="eyebrow">Locked Mail</span>
            <h1>Inbox</h1>
          </div>
          <button type="button" className="icon-button" onClick={refreshMailbox} aria-label="Refresh">
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="policy-strip">
          <ShieldCheck size={18} />
          <span>{policy?.allowedContactEmail ?? 'Allowed contact pending'}</span>
        </div>

        <nav className="message-list" aria-label="Allowed messages">
          {messages.length === 0 && (
            <div className="empty-list">
              <Inbox size={28} />
              <span>No allowed messages yet.</span>
            </div>
          )}

          {messages.map((message) => (
            <button
              type="button"
              key={message.id}
              className={message.id === selectedId ? 'message-item active' : 'message-item'}
              onClick={() => setSelectedId(message.id)}
            >
              <span className="message-subject">{message.subject || '(No subject)'}</span>
              <span className="message-from">{message.from}</span>
              <span className="message-snippet">{message.snippet}</span>
            </button>
          ))}
        </nav>

        <button type="button" className="sign-out" onClick={signOut}>
          <LogOut size={18} />
          Sign out
        </button>
      </aside>

      <section className="reader">
        <header className="reader-header">
          <div>
            <span className="eyebrow">Restricted conversation</span>
            <h2>{selectedSummary?.subject ?? 'Select a message'}</h2>
          </div>
          <div className="lock-pill">
            <Lock size={15} />
            No delete or mailbox changes
          </div>
        </header>

        {notice && <div className="notice">{notice}</div>}

        <article className="message-view">
          {status === 'loading' && !selected && <p>Loading...</p>}
          {!selected && status !== 'loading' && (
            <div className="reader-empty">
              <Mail size={36} />
              <span>Choose a message from the allowed contact.</span>
            </div>
          )}

          {selected && (
            <>
              <div className="message-meta">
                <span>From: {selected.from}</span>
                <span>To: {selected.to}</span>
                <span>{new Date(Number(selected.internalDate)).toLocaleString()}</span>
              </div>
              <pre className="message-body">{selected.bodyText || selected.snippet}</pre>
            </>
          )}
        </article>

        <section className="composer" aria-label="Reply composer">
          <div className="composer-header">
            <h3>Reply</h3>
            <span>Only to {policy?.allowedContactEmail ?? 'allowed contact'}</span>
          </div>
          <input
            value={replySubject}
            placeholder="Subject"
            onChange={(event) => setReplySubject(event.target.value)}
            disabled={!policy?.canSend}
          />
          <textarea
            value={replyBody}
            placeholder={policy?.canSend ? 'Write a reply...' : 'Sending is disabled by policy.'}
            onChange={(event) => setReplyBody(event.target.value)}
            disabled={!policy?.canSend}
          />
          <button type="button" onClick={submitReply} disabled={!policy?.canSend || !replyBody.trim()}>
            <Send size={18} />
            Send reply
          </button>
        </section>
      </section>
    </main>
  );
}
