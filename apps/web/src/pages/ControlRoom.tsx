import { useState, useEffect } from 'react';
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FlaskConical,
  Heart,
  LayoutDashboard,
  Link2,
  LogOut,
  Play,
  Radio,
  RotateCcw,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Swords,
  Undo2,
  Volume2,
  WifiOff,
  X,
} from 'lucide-react';
import { api, useRift } from '../hooks/useRift';
import { Scene, VoteBars } from '../components/Scene';
type Me = {
  session: { mode: string; actor: string } | null;
  identity: { name: string } | null;
  configured: boolean;
  rehearsalAvailable: boolean;
  connection: { status: string; detail: string };
};
export default function ControlRoom() {
  const [me, setMe] = useState<Me | null>(null);
  const [page, setPage] = useState('control');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState(3);
  const [health, setHealth] = useState(70);
  const [duration, setDuration] = useState(60);
  const [now, setNow] = useState(Date.now());
  const [viewer, setViewer] = useState('rehearsal-viewer-1');
  const [overlay, setOverlay] = useState('');
  const [copied, setCopied] = useState(false);
  const { snapshot: s, online, error: syncError, refresh } = useRift(!!me?.session);
  useEffect(() => {
    if (s) {
      setLevel(s.state.partyLevel);
      setHealth(s.state.partyHealth);
    }
  }, [s?.state.revision]);
  const loadMe = () =>
    api<Me>('/me')
      .then((current) => {
        setMe(current);
        return current;
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void loadMe();
    const t = setInterval(() => setNow(Date.now()), 500);
    const refreshConnection = () => {
      void loadMe();
    };
    window.addEventListener('focus', refreshConnection);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', refreshConnection);
    };
  }, []);
  useEffect(() => {
    if (me?.configured) return;
    const timer = setInterval(() => {
      void loadMe();
    }, 5000);
    return () => clearInterval(timer);
  }, [me?.configured]);
  async function action(path: string, body: unknown = {}) {
    setBusy(true);
    setError('');
    try {
      await api(path, body);
      const current = await loadMe();
      if (current?.session) await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function overlayLink() {
    try {
      const data = await api('/overlay/link');
      setOverlay(data.url);
      return data.url as string;
    } catch (e) {
      setError((e as Error).message);
      return '';
    }
  }
  async function authorizeAgain() {
    setBusy(true);
    setError('');
    try {
      await api('/auth/logout', {});
      location.assign('/api/auth/twitch/start');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const r = s?.round;
  const p = r?.proposal;
  const voting = r?.status === 'voting';
  const pending = r?.status === 'proposed';
  const active = voting || pending;
  const total = r ? Object.values(r.tally).reduce((a, b) => a + b, 0) : 0;
  const seconds = r ? Math.max(0, Math.ceil((r.deadline - now) / 1000)) : duration;
  const signed = !!me?.session;
  const rehearsal = me?.session?.mode === 'rehearsal';
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to controls
      </a>
      <aside className="sidebar">
        <a className="logo" href="/" aria-label="RIFT home">
          <svg className="rift-mark" viewBox="0 0 32 40" aria-hidden="true">
            <path d="M20 2 5 23h13L12 38 28 17H15Z" fill="currentColor" />
          </svg>
          <span>
            RIFT<small>AUDIENCE DIRECTOR</small>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {[
            { id: 'control', icon: LayoutDashboard, label: 'Control room' },
            { id: 'overlay', icon: Eye, label: 'Stream overlay' },
            { id: 'ledger', icon: ScrollText, label: 'Event ledger' },
            { id: 'settings', icon: Settings, label: 'Settings & connection' },
          ].map((n) => (
            <button
              key={n.id}
              className={page === n.id ? 'nav-active' : ''}
              aria-current={page === n.id ? 'page' : undefined}
              title={n.label}
              onClick={() => setPage(n.id)}
            >
              <n.icon size={18} />
              {n.label}
              {page === n.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={22} />
          <h4>Chaos, with boundaries.</h4>
          <p>
            The audience makes a choice.
            <br />
            You make the final call.
          </p>
          <div className="mini-line" />
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">{me?.identity?.name.slice(0, 2).toUpperCase() ?? 'RK'}</span>
          <div>
            {me?.identity?.name ?? 'Realm keeper'}
            <small>
              {signed ? (rehearsal ? 'Rehearsal workspace' : 'Broadcaster') : 'Not connected'}
            </small>
          </div>
          {signed && (
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() => action('/auth/logout')}
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>
              {page === 'control'
                ? 'Control room'
                : page === 'overlay'
                  ? 'Stream overlay'
                  : page === 'ledger'
                    ? 'Event ledger'
                    : 'Settings & connection'}
            </strong>
          </div>
          <div className="top-status">
            <span className={`status-dot ${s?.connection.status === 'connected' ? 'green' : ''}`} />
            {s?.connection.status === 'connected'
              ? 'Twitch connected'
              : rehearsal
                ? 'Rehearsal mode'
                : 'Twitch disconnected'}
            <span className="version">V1.0</span>
          </div>
        </header>
        <main className="main-content" id="main-content" tabIndex={-1} aria-busy={busy || !me}>
          <div className="page-heading">
            <span className="action-status" role="status">
              {busy ? 'Saving your changes…' : !me ? 'Connecting to RIFT…' : ''}
            </span>
            <div className="eyebrow">THE AUDIENCE CONTROLS THE WORLD. YOU HOLD THE REINS.</div>
            <div className="heading-row">
              <div>
                <h1>
                  {page === 'control'
                    ? 'Control room'
                    : page === 'overlay'
                      ? 'Stream overlay'
                      : page === 'ledger'
                        ? 'The event ledger'
                        : 'Make the connection'}
                </h1>
                <p>
                  {page === 'control'
                    ? 'Set the scene. Let chat shape the encounter.'
                    : page === 'overlay'
                      ? 'Your audience’s decisions, brought to life on stream.'
                      : page === 'ledger'
                        ? 'Every choice, calculation, and consequence. Accounted for.'
                        : 'Connect your broadcaster account and prepare your stream.'}
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  setPage('overlay');
                  if (signed) void overlayLink();
                }}
              >
                <ExternalLink size={15} />
                Open overlay setup
              </button>
            </div>
          </div>
          {(error || syncError) && (
            <div className="error" role="alert">
              <WifiOff size={18} />
              {error || syncError}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {signed && !online && (
            <div className="notice">
              Connecting to the authoritative server. Displayed values may be stale.
            </div>
          )}
          {!signed && (
            <div className="welcome-strip">
              <div>
                <Radio size={23} />
                <div>
                  <strong>Your next encounter starts here.</strong>
                  <p>
                    Connect Twitch to let your audience in, or explore the full flow in rehearsal.
                  </p>
                </div>
              </div>
              <div className="button-group">
                <button
                  className="secondary"
                  disabled={!me?.rehearsalAvailable || busy}
                  onClick={() => action('/auth/rehearsal')}
                >
                  <FlaskConical size={16} />
                  Enter rehearsal
                </button>
                <button
                  className="primary"
                  onClick={() =>
                    me?.configured ? location.assign('/api/auth/twitch/start') : setPage('settings')
                  }
                >
                  <Link2 size={16} />
                  Connect Twitch
                </button>
              </div>
            </div>
          )}
          {page === 'control' && (
            <>
              <div className="control-grid">
                <section className="encounter-column">
                  <div className="panel scene-panel">
                    <Scene snapshot={s} />
                    <div className="scene-caption">
                      <span>
                        <span className="status-dot green" />
                        Ruined Temple
                      </span>
                      <span>
                        ENCOUNTER TEMPLATE <Check size={13} />
                      </span>
                    </div>
                  </div>
                  <section className="panel party-panel">
                    <div className="section-heading">
                      <span>
                        <Shield size={16} />
                        PARTY CONDITION
                      </span>
                      <span>SET THE STAKES</span>
                    </div>
                    <div className="party-fields">
                      <label>
                        Party level
                        <div className="number-input">
                          <button
                            disabled={active}
                            aria-label="Decrease party level"
                            onClick={() => setLevel(Math.max(1, level - 1))}
                          >
                            −
                          </button>
                          <input
                            aria-label="Party level"
                            type="number"
                            min="1"
                            max="20"
                            value={level}
                            disabled={active}
                            onChange={(e) => setLevel(Number(e.target.value))}
                          />
                          <button
                            disabled={active}
                            aria-label="Increase party level"
                            onClick={() => setLevel(Math.min(20, level + 1))}
                          >
                            +
                          </button>
                        </div>
                      </label>
                      <label>
                        Party health{' '}
                        <span className="field-value">
                          {health}
                          <small> / 100</small>
                        </span>
                        <input
                          aria-label="Party health"
                          type="range"
                          min="0"
                          max="100"
                          value={health}
                          disabled={active}
                          onChange={(e) => setHealth(Number(e.target.value))}
                        />
                        <div className="range-label">
                          <Heart size={12} />
                          Remaining resources
                        </div>
                      </label>
                    </div>
                    <div className="party-footer">
                      <ShieldCheck size={14} />
                      Encounters adapt to your party’s condition.
                    </div>
                  </section>
                  <section className="panel threat-panel">
                    <div className="section-heading">
                      <span>
                        <Activity size={16} />
                        COMMITTED THREAT
                      </span>
                      <span>REV {s?.state.revision ?? 0}</span>
                    </div>
                    <div className="threat-number">
                      {s?.state.threat ?? 0}
                      <span>/ {s?.state.maxThreat ?? 60}</span>
                      <small>{s?.state.threat ? 'ENCOUNTER ACTIVE' : 'AWAITING APPROVAL'}</small>
                    </div>
                    <div className="meter">
                      <i
                        style={{
                          transform: `scaleX(${s ? s.state.threat / s.state.maxThreat : 0})`,
                        }}
                      />
                    </div>
                    <p>
                      {s?.state.activeEffects.length
                        ? s.state.activeEffects.map((e) => e.name).join(' · ')
                        : 'No active effects. The temple is quiet.'}
                    </p>
                  </section>
                </section>
                <section className="workflow-column">
                  <section className="panel voting-panel">
                    <div className="section-heading">
                      <span>
                        <Radio size={16} />
                        AUDIENCE VOTE
                      </span>
                      <span className={voting ? 'copper' : ''}>
                        {voting
                          ? 'VOTING OPEN'
                          : r?.status === 'cancelled'
                            ? 'ROUND CANCELLED'
                            : r
                              ? 'VOTING CLOSED'
                              : 'READY WHEN YOU ARE'}
                      </span>
                    </div>
                    <div className="round-summary">
                      <div>
                        <span className="eyebrow">
                          ROUND {String(s?.state.round ?? 1).padStart(2, '0')}
                        </span>
                        <h2>What wakes beneath?</h2>
                      </div>
                      <div className="timer">
                        <Clock size={16} />
                        {voting
                          ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
                          : '—:—'}
                      </div>
                    </div>
                    <p className="section-copy">Three possibilities. One community decision.</p>
                    <VoteBars snapshot={s} />
                    <div className="vote-footer">
                      <span>
                        <Volume2 size={14} />
                        <strong>{total}</strong> {rehearsal ? 'rehearsal' : 'audience'} votes
                      </span>
                      {r && signed ? (
                        <button
                          className="reset-voting"
                          disabled={busy || !online}
                          title="Clear votes and any pending proposal. Restart the same voting window; committed effects stay unchanged."
                          onClick={() =>
                            action(`/rounds/${r.id}/reset`, { expectedRevision: s!.state.revision })
                          }
                        >
                          <RotateCcw size={14} />
                          Reset voting
                        </button>
                      ) : (
                        <span>One viewer, one vote</span>
                      )}
                    </div>
                    <div className="round-actions">
                      {voting ? (
                        <button
                          className="primary full"
                          disabled={busy || !online}
                          onClick={() => action(`/rounds/${r!.id}/close`)}
                        >
                          <Check size={16} />
                          Close voting & calculate
                        </button>
                      ) : (
                        <>
                          <label className="duration-label">
                            Voting window
                            <select
                              aria-label="Voting window"
                              value={duration}
                              disabled={active}
                              onChange={(e) => setDuration(Number(e.target.value))}
                            >
                              <option value={30}>30 seconds</option>
                              <option value={60}>60 seconds</option>
                              <option value={90}>90 seconds</option>
                              <option value={120}>120 seconds</option>
                            </select>
                          </label>
                          <button
                            className="primary"
                            disabled={!signed || busy || active || !online}
                            onClick={() =>
                              action('/rounds', {
                                partyLevel: level,
                                partyHealth: health,
                                duration,
                              })
                            }
                          >
                            <Play size={15} />
                            Start voting
                          </button>
                        </>
                      )}
                    </div>
                  </section>
                  <section className={`panel director-panel ${pending ? 'pending' : ''}`}>
                    <div className="section-heading">
                      <span>
                        <Swords size={16} />
                        ENCOUNTER DIRECTOR
                      </span>
                      <span>
                        {pending
                          ? 'YOUR APPROVAL REQUIRED'
                          : r?.status === 'approved'
                            ? 'COMMITTED'
                            : 'HOST CONTROL'}
                      </span>
                    </div>
                    {p ? (
                      <>
                        <div className="proposal-title">
                          <div className="proposal-icon">
                            <Shield size={24} />
                          </div>
                          <div>
                            <h2>{p.name}</h2>
                            <p>{p.variant}</p>
                          </div>
                        </div>
                        <div className="budget-breakdown">
                          <div>
                            <span>Base cost</span>
                            <strong>{p.baseCost}</strong>
                          </div>
                          <ChevronRight size={15} />
                          <div>
                            <span>Available</span>
                            <strong>{p.budget}</strong>
                          </div>
                          <ChevronRight size={15} />
                          <div>
                            <span>Applied cost</span>
                            <strong className="copper">{p.cost}</strong>
                          </div>
                        </div>
                        <details>
                          <summary>Inspect the balancing calculation</summary>
                          {p.explanation.map((line) => (
                            <p key={line}>{line}</p>
                          ))}
                        </details>
                        {pending ? (
                          <div className="button-group">
                            <button
                              className="primary grow"
                              disabled={busy || !online}
                              onClick={() =>
                                action(`/proposals/${p.id}/approve`, {
                                  expectedRevision: p.expectedRevision,
                                })
                              }
                            >
                              <Swords size={16} />
                              Unleash encounter
                            </button>
                            <button
                              className="secondary"
                              disabled={busy || !online}
                              onClick={() =>
                                action(`/proposals/${p.id}/reject`, {
                                  expectedRevision: p.expectedRevision,
                                })
                              }
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <div className="resolved">
                            <Check size={16} />
                            {r?.status === 'cancelled'
                              ? 'Encounter rolled back'
                              : p.status === 'approved'
                                ? 'Approved. The world has changed.'
                                : 'Rejected. Game state preserved.'}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="director-empty">
                        <div className="director-orbit">
                          <Swords size={26} />
                        </div>
                        <h3>The next chapter is unwritten.</h3>
                        <p>
                          Close an audience vote to receive a balanced encounter.
                          <br />
                          Nothing changes until you approve.
                        </p>
                      </div>
                    )}
                    <div className="director-footer">
                      <ShieldCheck size={14} />
                      Deterministic rules. Always your decision.
                      {s?.canRollback && (
                        <button
                          disabled={busy || !online}
                          onClick={() =>
                            action('/state/rollback', { expectedRevision: s.state.revision })
                          }
                        >
                          <Undo2 size={13} />
                          Roll back
                        </button>
                      )}
                    </div>
                  </section>
                </section>
              </div>
              {rehearsal && (
                <section className="rehearsal-tools">
                  <div>
                    <FlaskConical size={19} />
                    <div>
                      <strong>Rehearsal controls</strong>
                      <p>Synthetic input only. These are never represented as Twitch events.</p>
                    </div>
                  </div>
                  <label>
                    Viewer ID
                    <input
                      aria-label="Rehearsal viewer ID"
                      value={viewer}
                      onChange={(e) => setViewer(e.target.value)}
                    />
                  </label>
                  <div className="button-group">
                    {['a', 'b', 'c'].map((choice) => (
                      <button
                        className="secondary"
                        disabled={!voting || busy || !viewer}
                        key={choice}
                        onClick={() => action('/rehearsal/vote', { user: viewer, choice })}
                      >
                        !rift {choice}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <section className="ledger-preview">
                <div className="section-heading">
                  <span>
                    <ScrollText size={16} />
                    LATEST EVIDENCE
                  </span>
                  <button onClick={() => setPage('ledger')}>
                    View full ledger <ArrowUpRight size={14} />
                  </button>
                </div>
                {s?.events.length ? (
                  s.events.slice(0, 3).map((e) => (
                    <div className="event-line" key={e.id}>
                      <span className="event-dot" />
                      <time>{new Date(e.at).toLocaleTimeString()}</time>
                      <strong>{e.type.replaceAll('.', ' / ').replaceAll('_', ' ')}</strong>
                      <span>EVENT {String(e.id).padStart(4, '0')}</span>
                    </div>
                  ))
                ) : (
                  <p className="empty-ledger">
                    Your first round will start the story. Its evidence will appear here.
                  </p>
                )}
              </section>
            </>
          )}
          {page === 'settings' && (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <div className="section-heading">
                  <span>
                    <Radio size={17} />
                    TWITCH CONNECTION
                  </span>
                </div>
                <h2>Invite your audience into the world.</h2>
                <p>
                  RIFT reads your broadcaster’s chat through Twitch EventSub. Your access token
                  stays on the server.
                </p>
                <div className="connection-box">
                  <span
                    className={`status-dot ${s?.connection.status === 'connected' ? 'green' : ''}`}
                  />
                  <div>
                    <strong>{s?.connection.status ?? 'Disconnected'}</strong>
                    <p>{s?.connection.detail ?? 'No broadcaster account connected.'}</p>
                  </div>
                </div>
                {!me?.configured && (
                  <div className="setup-instructions">
                    <h3>One-time developer setup</h3>
                    <ol>
                      <li>
                        Create an application in the{' '}
                        <a
                          href="https://dev.twitch.tv/console/apps"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Twitch developer console <ExternalLink size={12} />
                        </a>
                        .
                      </li>
                      <li>
                        Register the redirect URL:
                        <code>{location.origin}/api/auth/twitch/callback</code>
                      </li>
                      <li>
                        Copy <code>.env.example</code> to <code>.env</code>. Set your Client ID,
                        Client Secret, and matching redirect URI.
                      </li>
                      <li>Restart the RIFT server, then connect below.</li>
                    </ol>
                  </div>
                )}
                <div className="button-group">
                  <button
                    className="primary"
                    disabled={!me?.configured || busy || (signed && !!me.identity)}
                    onClick={() => location.assign('/api/auth/twitch/start')}
                  >
                    <Link2 size={16} />
                    Connect Twitch
                  </button>
                  {signed && me?.identity && (
                    <>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => action('/twitch/reconnect')}
                      >
                        Reconnect chat
                      </button>
                      <button
                        className="secondary"
                        disabled={busy || s?.connection.status === 'disconnected'}
                        onClick={() => action('/twitch/disconnect')}
                      >
                        Disconnect chat
                      </button>
                      <button className="secondary" disabled={busy} onClick={authorizeAgain}>
                        Authorize Twitch again
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => action('/auth/logout')}
                      >
                        Disconnect Twitch
                      </button>
                    </>
                  )}
                </div>
                {signed && me?.identity && (
                  <p className="muted">
                    Disconnect chat stops incoming votes and keeps you signed in. Authorize again
                    restarts Twitch consent. Disconnect Twitch signs out all RIFT browsers and
                    clears the server’s tokens.
                  </p>
                )}
                {!signed && me?.identity && (
                  <p className="muted">
                    This server is already linked to {me.identity.name}. Connect with the same
                    Twitch account to use this browser. To switch accounts, disconnect Twitch in the
                    currently signed-in RIFT window.
                  </p>
                )}
              </section>
              <section className="panel settings-panel">
                <div className="section-heading">
                  <span>
                    <ShieldCheck size={17} />
                    SESSION & TRUST
                  </span>
                </div>
                <h2>The keeper has the final say.</h2>
                <ul className="trust-list">
                  <li>
                    <Check />
                    One current vote per Twitch user
                  </li>
                  <li>
                    <Check />
                    Duplicate event protection
                  </li>
                  <li>
                    <Check />
                    Server-enforced voting deadlines
                  </li>
                  <li>
                    <Check />
                    Approval before every state change
                  </li>
                  <li>
                    <Check />
                    Read-only OBS access
                  </li>
                  <li>
                    <Check />
                    Auditable, transactional rollback
                  </li>
                </ul>
                <p className="muted">
                  RIFT uses an original encounter-scoring heuristic, not official tabletop rules.
                  Live Twitch verification requires a real connected account.
                </p>
              </section>
            </div>
          )}
          {page === 'overlay' && (
            <div className="overlay-setup">
              <div className="panel">
                <div className="section-heading">
                  <span>
                    <Eye size={17} />
                    BROADCAST PREVIEW
                  </span>
                  <span>{rehearsal ? 'REHEARSAL' : 'PREVIEW'}</span>
                </div>
                <Scene snapshot={s} />
                <div className="preview-votes">
                  <VoteBars snapshot={s} />
                </div>
              </div>
              <section className="panel settings-panel">
                <div className="eyebrow">OBS BROWSER SOURCE</div>
                <h2>A window into your world.</h2>
                <p>Add RIFT to your broadcast in three steps.</p>
                <ol className="obs-steps">
                  <li>
                    In OBS, add a <strong>Browser</strong> source.
                  </li>
                  <li>Paste your private overlay URL.</li>
                  <li>
                    Set the source to <strong>1280 × 720</strong>.
                  </li>
                </ol>
                <button
                  className="primary full"
                  disabled={!signed}
                  onClick={async () => {
                    const url = await overlayLink();
                    if (url) {
                      try {
                        await navigator.clipboard.writeText(url);
                        setCopied(true);
                      } catch {
                        setCopied(false);
                      }
                    }
                  }}
                >
                  <Copy size={16} />
                  {copied ? 'Overlay URL copied' : 'Copy overlay URL'}
                </button>
                {overlay && (
                  <>
                    <label className="overlay-url">
                      Private read-only URL
                      <input readOnly value={overlay} onFocus={(e) => e.target.select()} />
                    </label>
                    <a className="secondary full" href={overlay} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} />
                      Open browser preview
                    </a>
                  </>
                )}
                <p className="muted">
                  <ShieldCheck size={14} />
                  This URL grants view-only access. Keep it private. The overlay reconnects
                  automatically.
                </p>
              </section>
            </div>
          )}
          {page === 'ledger' && (
            <section className="panel full-ledger">
              <div className="section-heading">
                <span>
                  <ScrollText size={17} />
                  APPEND-ONLY EVENT HISTORY
                </span>
                <span>LATEST {s?.events.length ?? 0} EVENTS</span>
              </div>
              {s?.events.length ? (
                s.events.map((e) => (
                  <details className="ledger-detail" key={e.id}>
                    <summary>
                      <span className="ledger-id">#{String(e.id).padStart(4, '0')}</span>
                      <strong>{e.type.replaceAll('.', ' / ')}</strong>
                      <time>{new Date(e.at).toLocaleTimeString()}</time>
                      <ChevronRight size={15} />
                    </summary>
                    <pre>{JSON.stringify(e.detail, null, 2)}</pre>
                  </details>
                ))
              ) : (
                <div className="director-empty">
                  <ScrollText size={30} />
                  <h3>No events yet.</h3>
                  <p>Start a round to record votes, proposals, and decisions.</p>
                </div>
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>
              RIFT <span className="footer-divider">/</span> A LITTLE CHAOS. A GREAT STORY.
            </span>
            <span>
              <ShieldCheck size={12} />{' '}
              {signed
                ? rehearsal
                  ? 'REHEARSAL · NO LIVE TWITCH EVIDENCE'
                  : 'BROADCASTER SESSION'
                : 'LOCAL-FIRST ENCOUNTER ENGINE'}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
