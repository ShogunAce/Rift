import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import type { Choice, GameState, Proposal } from '../../../../packages/shared/src/contracts';
import { choices } from '../../../../packages/shared/src/contracts';
import { budget, initialState, propose } from '../../../server/src/domain/encounter';
import '../styles/landing.css';

const APP_URL = '/app';
const art: Record<Choice, { src: string; alt: string }> = {
  a: {
    src: '/landing/golem.webp',
    alt: 'A stone golem tearing free of a temple wall, copper light in its fractures',
  },
  b: {
    src: '/landing/fog.webp',
    alt: 'Teal cursed fog rolling down a ruined temple corridor',
  },
  c: {
    src: '/landing/vault.webp',
    alt: 'A colossal stone vault door grinding open, gold light spilling out',
  },
};
const steps = [
  {
    title: 'Chat votes',
    code: '!rift a   !rift b   !rift c',
    body: 'Viewers vote with a chat command. One viewer, one vote, and a new vote replaces the old one. Voting closes on time even if no browser is open.',
  },
  {
    title: 'RIFT works out the cost',
    code: 'B = clamp(round(60 × (0.5 + H/200) + 5 × (L − 3) − E), 10, 100)',
    body: 'Party health, level and active effects set a threat budget. The winning fate comes back as the strongest version that fits, and the same party always gets the same answer.',
  },
  {
    title: 'You make the call',
    code: 'Unleash encounter  /  Reject',
    body: 'Nothing has happened yet. You see the proposal and the sums behind it, then approve or reject it. Chat can never change the world by itself.',
  },
  {
    title: 'The stream changes',
    code: 'OBS browser source · 1280 × 720',
    body: 'An approved encounter tears open on your overlay and lands in the ledger. Change your mind and roll it back. The record stays.',
  },
];
const promises = [
  {
    title: 'Bounded by rules',
    body: 'Every outcome comes from a fixed list of encounters. Chat picks the direction, and your threat budget decides how hard it hits.',
  },
  {
    title: 'Nothing commits without you',
    body: 'A proposal stays a proposal until you approve it. Repeated or out-of-date commands are refused, never applied twice.',
  },
  {
    title: 'All of it on the record',
    body: 'Votes, sums, approvals and rollbacks stay in a local ledger, with rehearsal and live events labeled apart.',
  },
];
const setup = ['npm ci', 'npm run demo'];

const prefersReduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Phase = 'idle' | 'voting' | 'proposed' | 'approved' | 'rejected';
const VOTE_TICKS = 22;

function TryRound({ highlighted, sound }: { highlighted: Choice | null; sound: boolean }) {
  const [level, setLevel] = useState(3);
  const [health, setHealth] = useState(70);
  const [phase, setPhase] = useState<Phase>('idle');
  const [votes, setVotes] = useState<Record<string, Choice>>({});
  const [feed, setFeed] = useState<{ id: number; viewer: string; choice: Choice }[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const state = useMemo<GameState>(
    () => ({ ...initialState(), partyLevel: level, partyHealth: health }),
    [level, health],
  );
  const available = budget(state).available;
  const tally = useMemo(() => {
    const counts: Record<Choice, number> = { a: 0, b: 0, c: 0 };
    for (const choice of Object.values(votes)) counts[choice]++;
    return counts;
  }, [votes]);
  const total = tally.a + tally.b + tally.c;
  useEffect(() => () => window.clearInterval(timer.current), []);

  const close = (final: Record<string, Choice>) => {
    window.clearInterval(timer.current);
    const counts: Record<Choice, number> = { a: 0, b: 0, c: 0 };
    for (const choice of Object.values(final)) counts[choice]++;
    const winner = (['a', 'b', 'c'] as Choice[]).reduce((best, c) =>
      counts[c] > counts[best] ? c : best,
    );
    setProposal(propose(state, winner, 'try-a-round'));
    setPhase('proposed');
  };
  const latest = useRef<Record<string, Choice>>({});
  const start = (mine: Choice) => {
    const pool = [mine, mine, 'a', 'b', 'c'] as Choice[];
    const castOne = (tick: number) => {
      const viewer = `viewer_${String(1 + Math.floor(Math.random() * 14)).padStart(2, '0')}`;
      const choice = pool[Math.floor(Math.random() * pool.length)];
      latest.current = { ...latest.current, [viewer]: choice };
      setVotes(latest.current);
      setFeed((f) => [{ id: tick, viewer, choice }, ...f].slice(0, 7));
    };
    latest.current = { you: mine };
    setVotes(latest.current);
    setFeed([{ id: 0, viewer: 'you', choice: mine }]);
    setProposal(null);
    setPhase('voting');
    if (prefersReduced()) {
      for (let tick = 1; tick <= VOTE_TICKS; tick++) castOne(tick);
      close(latest.current);
      return;
    }
    let tick = 0;
    timer.current = window.setInterval(() => {
      tick++;
      castOne(tick);
      if (tick >= VOTE_TICKS) close(latest.current);
    }, 190);
  };
  const approve = () => {
    setPhase('approved');
    if (sound) {
      const sting = new Audio('/landing/reveal.mp3');
      sting.volume = 0.6;
      void sting.play().catch(() => undefined);
    }
  };
  const reset = () => {
    setPhase('idle');
    setVotes({});
    setFeed([]);
    setProposal(null);
  };

  const revealed = phase === 'approved' && proposal?.effect ? proposal.choice : null;
  const locked = phase !== 'idle';
  return (
    <div className="lp-round">
      <div className="lp-stage-col">
        <div className="lp-stage">
          <img src="/landing/stage.webp" alt="The ruined temple at dusk beneath a tear of light" />
          {revealed && (
            <img
              key={revealed}
              className="lp-stage-reveal"
              src={art[revealed].src}
              alt={art[revealed].alt}
            />
          )}
          <div className="lp-stage-copy">
            <span>
              {phase === 'approved' ? 'The world has changed' : 'Encounter 01 / Ancient ruins'}
            </span>
            <strong>{phase === 'approved' ? proposal?.name : 'The Ruined Temple'}</strong>
            <em>
              {phase === 'approved'
                ? proposal?.variant
                : 'Beneath the silence, something is waiting.'}
            </em>
          </div>
        </div>
        <ul className="lp-bars">
          {choices.map((c) => (
            <li key={c.id} className={proposal?.choice === c.id ? 'is-winner' : ''}>
              <span>{c.short}</span>
              <span className="lp-bar-track">
                <span style={{ transform: `scaleX(${total ? tally[c.id] / total : 0})` }} />
              </span>
              <span className="lp-bar-count">{tally[c.id]}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="lp-desk">
        <div className="lp-desk-fields">
          <label>
            <span>
              Party level <b>{level}</b>
            </span>
            <input
              type="range"
              min={1}
              max={20}
              value={level}
              disabled={locked}
              onChange={(e) => setLevel(Number(e.target.value))}
            />
          </label>
          <label>
            <span>
              Party health <b>{health}%</b>
            </span>
            <input
              type="range"
              min={1}
              max={100}
              value={health}
              disabled={locked}
              onChange={(e) => setHealth(Number(e.target.value))}
            />
          </label>
          <p className="lp-budget">
            Threat budget <b>{available}</b>
          </p>
        </div>
        {phase === 'idle' && (
          <div className="lp-vote">
            <p>
              Cast the first vote. A crowd of simulated viewers will join you, and may overrule you.
            </p>
            <div className="lp-vote-buttons">
              {choices.map((c) => (
                <button
                  key={c.id}
                  className={highlighted === c.id ? 'is-highlighted' : ''}
                  onClick={() => start(c.id)}
                >
                  <code>!rift {c.id}</code>
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {phase === 'voting' && (
          <div className="lp-feed">
            <div className="lp-feed-head">
              <span>Voting open</span>
              <button onClick={() => close(latest.current)}>Close voting</button>
            </div>
            <ol aria-hidden="true">
              {feed.map((line) => (
                <li key={line.id}>
                  <b>{line.viewer}</b> !rift {line.choice}
                </li>
              ))}
            </ol>
          </div>
        )}
        {phase === 'proposed' && proposal && (
          <div className="lp-proposal">
            <span className="lp-tag">Proposal: nothing has changed yet</span>
            <h3>{proposal.name}</h3>
            <p className="lp-variant">{proposal.variant}</p>
            <div className="lp-meter">
              <span
                style={{
                  transform: `scaleX(${proposal.budget ? proposal.cost / proposal.budget : 0})`,
                }}
              />
            </div>
            <p className="lp-meter-label">
              Final cost {proposal.cost} of a {proposal.budget} threat budget
            </p>
            <code className="lp-sum">{proposal.explanation[2]}</code>
            <p className="lp-why">{proposal.explanation[3]}</p>
            <div className="lp-decide">
              <button className="lp-pill lp-pill-solid" onClick={approve}>
                <Check size={17} />
                Unleash encounter
              </button>
              <button className="lp-pill lp-pill-ghost" onClick={() => setPhase('rejected')}>
                <X size={17} />
                Reject
              </button>
            </div>
          </div>
        )}
        {phase === 'approved' && proposal && (
          <div className="lp-result">
            <span className="lp-tag">Approved</span>
            <p>{proposal.outcome?.summary}</p>
            <p className="lp-result-note">On a real stream, this is when your overlay changes.</p>
            <button className="lp-pill lp-pill-ghost" onClick={reset}>
              <RotateCcw size={17} />
              Roll back and run another
            </button>
          </div>
        )}
        {phase === 'rejected' && (
          <div className="lp-result">
            <span className="lp-tag">Rejected</span>
            <p>Nothing changed. The stream never saw it, and the party is untouched.</p>
            <button className="lp-pill lp-pill-ghost" onClick={reset}>
              <RotateCcw size={17} />
              Run another round
            </button>
          </div>
        )}
        <p className="lp-sr" role="status">
          {phase === 'voting' && 'Voting is open.'}
          {phase === 'proposed' && `Proposal ready: ${proposal?.name}, ${proposal?.variant}.`}
          {phase === 'approved' && 'Encounter approved.'}
          {phase === 'rejected' && 'Proposal rejected.'}
        </p>
      </div>
    </div>
  );
}

function CopySetup() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="lp-term">
      <button
        aria-label="Copy setup commands"
        onClick={() => {
          void navigator.clipboard?.writeText(setup.join('\n')).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          });
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>
        {setup.map((line) => (
          <code key={line}>{line}</code>
        ))}
      </pre>
    </div>
  );
}

function RiftMark() {
  return (
    <svg viewBox="0 0 24 32" aria-hidden="true" className="lp-mark">
      <path d="M14.5 0 9 11.5l4 1.5L7 32l10.5-20.5-4.3-1.7L17.5 0z" fill="currentColor" />
    </svg>
  );
}

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const ambience = useRef<HTMLAudioElement | null>(null);
  const [reduced] = useState(prefersReduced);
  const [videoReady, setVideoReady] = useState(false);
  const [sound, setSound] = useState(false);
  const [highlighted, setHighlighted] = useState<Choice | null>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || reduced) return;
    const rise = [
      { opacity: 0, transform: 'translateY(22px)' },
      { opacity: 1, transform: 'none' },
    ];
    const drop = [
      { opacity: 0, transform: 'translateY(-18px)' },
      { opacity: 1, transform: 'none' },
    ];
    const spring = [
      { opacity: 0, filter: 'blur(14px)', transform: 'translateY(46px)' },
      { opacity: 1, filter: 'blur(0)', transform: 'none' },
    ];
    const soft = 'cubic-bezier(.2,.75,.25,1)';
    const bouncy = 'cubic-bezier(.2,1.28,.36,1)';
    const timeline: [string, Keyframe[], number, number, string][] = [
      ['.lp-logo', drop, 80, 620, soft],
      ['.lp-navpill', drop, 150, 620, soft],
      ['.lp-navcta', drop, 220, 620, soft],
      [
        '.lp-kicker',
        [
          { opacity: 0, filter: 'blur(12px)' },
          { opacity: 1, filter: 'blur(0)' },
        ],
        360,
        720,
        soft,
      ],
      ['.lp-line-1', spring, 520, 900, bouncy],
      ['.lp-line-2', spring, 680, 900, bouncy],
      ['.lp-sub', rise, 1000, 700, soft],
      ['.lp-cta-main', rise, 1130, 660, soft],
      ['.lp-cta-alt', rise, 1210, 660, soft],
      ['.lp-row-title', rise, 1340, 660, soft],
      ['.lp-row-link', rise, 1400, 660, soft],
    ];
    const running = timeline.flatMap(([selector, frames, delay, duration, easing]) =>
      [...el.querySelectorAll(selector)].map((node) =>
        node.animate(frames, { delay, duration, easing, fill: 'backwards' }),
      ),
    );
    el.querySelectorAll('.lp-card').forEach((node, i) => {
      running.push(
        node.animate(rise, {
          delay: 1480 + i * 120,
          duration: 760,
          easing: soft,
          fill: 'backwards',
        }),
      );
    });
    return () => running.forEach((a) => a.cancel());
  }, [reduced]);

  useEffect(() => {
    const el = root.current;
    if (!el || reduced || typeof IntersectionObserver !== 'function') return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          seen.unobserve(entry.target);
          entry.target.animate(
            [
              { opacity: 0, transform: 'translateY(28px)' },
              { opacity: 1, transform: 'none' },
            ],
            { duration: 820, easing: 'cubic-bezier(.2,.75,.25,1)' },
          );
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    el.querySelectorAll('.lp-reveal').forEach((node) => seen.observe(node));
    return () => seen.disconnect();
  }, [reduced]);

  useEffect(() => {
    const clip = video.current;
    if (!clip) return;
    clip.muted = true;
    void clip.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!sound) {
      ambience.current?.pause();
      return;
    }
    ambience.current ??= Object.assign(new Audio('/landing/ambience.mp3'), {
      loop: true,
      volume: 0.35,
    });
    void ambience.current.play().catch(() => setSound(false));
  }, [sound]);
  useEffect(() => () => ambience.current?.pause(), []);

  return (
    <div className="lp" ref={root}>
      <header className="lp-hero">
        <div className="lp-scene" aria-hidden="true">
          <img src="/landing/plate.webp" alt="" fetchPriority="high" />
          {!reduced && (
            <video
              ref={video}
              className={videoReady ? 'is-ready' : ''}
              src="/landing/hero-loop.mp4"
              muted
              autoPlay
              loop
              playsInline
              preload="auto"
              onPlaying={() => setVideoReady(true)}
            />
          )}
        </div>
        <div className="lp-scrim" aria-hidden="true" />
        <div className="lp-frame">
          <nav className="lp-nav" aria-label="Main">
            <a className="lp-logo" href="/" aria-label="RIFT home">
              <RiftMark />
              RIFT
            </a>
            <div className="lp-navpill">
              <a href="#how">How it works</a>
              <a href="#round">Try a round</a>
              <a href="#control">Control room</a>
              <a href="#run">Run it</a>
            </div>
            <button
              className="lp-sound"
              aria-pressed={sound}
              aria-label={sound ? 'Turn sound off' : 'Turn sound on'}
              onClick={() => setSound((on) => !on)}
            >
              {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <a className="lp-navcta" href={APP_URL}>
              Open RIFT
            </a>
          </nav>
          <h1 className="lp-title">
            <span className="lp-kicker">The audience</span>
            <span className="lp-line lp-line-1">Controls</span>
            <span className="lp-line lp-line-2">the world</span>
          </h1>
          <p className="lp-sub">
            Your Twitch chat votes on what happens next. RIFT turns the result into a balanced
            encounter. You make the final call, and the stream changes.
          </p>
          <div className="lp-ctas">
            <a className="lp-cta-main" href={APP_URL}>
              Open the control room
            </a>
            <a className="lp-cta-alt" href="#round">
              <svg viewBox="0 0 20 22" aria-hidden="true">
                <path
                  d="M3 3.2v15.6c0 1 1.1 1.6 2 1.1l13-7.8c.8-.5.8-1.7 0-2.2L5 2.1c-.9-.5-2 .1-2 1.1z"
                  fill="currentColor"
                />
              </svg>
              Try a round
            </a>
          </div>
          <h2 className="lp-row-title">Three fates</h2>
          <a className="lp-row-link" href="#round">
            pick one and run it <span aria-hidden="true">›</span>
          </a>
          <div className="lp-cards">
            {choices.map((c) => (
              <a className="lp-card" key={c.id} href="#round" onClick={() => setHighlighted(c.id)}>
                <span className="lp-card-art">
                  <img src={art[c.id].src} alt={art[c.id].alt} />
                </span>
                <code>!rift {c.id}</code>
                <span className="lp-card-copy">
                  <strong>{c.name}</strong>
                  <span>{c.description}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </header>

      <main>
        <section className="lp-section lp-how" id="how">
          <div className="lp-how-intro lp-reveal">
            <p className="lp-eyebrow">How a round works</p>
            <h2>Chat gets the vote. You keep the veto.</h2>
          </div>
          <ol className="lp-steps">
            {steps.map((step, i) => (
              <li className="lp-reveal" key={step.title}>
                <span className="lp-step-num">{i + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <code>{step.code}</code>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section lp-try" id="round">
          <div className="lp-try-head lp-reveal">
            <p className="lp-eyebrow">Try a round</p>
            <h2>Take the final call yourself.</h2>
            <p>
              This is RIFT’s real encounter engine, running in your browser. The votes are simulated
              and nothing connects to Twitch. Lower the party’s health and watch the same vote come
              back gentler.
            </p>
          </div>
          <div className="lp-reveal">
            <TryRound highlighted={highlighted} sound={sound} />
          </div>
        </section>

        <section className="lp-section lp-control" id="control">
          <div className="lp-control-copy lp-reveal">
            <div>
              <p className="lp-eyebrow">The control room</p>
              <h2>The audience controls the world. The streamer survives it.</h2>
            </div>
            <dl>
              {promises.map((p) => (
                <div key={p.title}>
                  <dt>{p.title}</dt>
                  <dd>{p.body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <figure className="lp-shots lp-reveal">
            <img
              className="lp-shot-app"
              src="/landing/shot-control.webp"
              alt="The RIFT control room with a pending proposal awaiting approval"
              loading="lazy"
            />
            <img
              className="lp-shot-overlay"
              src="/landing/shot-overlay.webp"
              alt="The RIFT stream overlay showing an approved encounter"
              loading="lazy"
            />
            <figcaption>
              The control room and stream overlay, captured from a rehearsal round.
            </figcaption>
          </figure>
        </section>

        <section className="lp-section lp-run" id="run">
          <div className="lp-reveal">
            <p className="lp-eyebrow">Run it</p>
            <h2>It runs on your machine.</h2>
            <p className="lp-run-lede">
              Node 24 is all it takes. There’s no external database, paid service or API key to get
              started, and rehearsal runs without a Twitch account. The demo command prints the
              address to open.
            </p>
            <CopySetup />
          </div>
          <div className="lp-run-side lp-reveal">
            <h3>Then, when you are ready to go live</h3>
            <ol>
              <li>
                <b>Add the overlay.</b> Copy its private URL into an OBS browser source at 1280 ×
                720, 30 FPS.
              </li>
              <li>
                <b>Connect Twitch.</b> Register an app in the Twitch developer console and add its
                keys to <code>.env</code>.
              </li>
              <li>
                <b>Start a round.</b> Chat votes with <code>!rift a</code>, and you take it from
                there.
              </li>
            </ol>
            <div className="lp-status">
              <h4>Where it stands today</h4>
              <p>
                The local rehearsal loop, transactional rules and browser overlay are tested. The
                Twitch integration is implemented and its provider behavior is covered with mocks. A
                real broadcast has not been verified yet.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-close">
          <img src="/landing/closing.webp" alt="" loading="lazy" />
          <div className="lp-close-copy lp-reveal">
            <h2>Something is waiting beneath the temple.</h2>
            <p>Chat is about to decide what.</p>
            <a className="lp-cta-main" href={APP_URL}>
              Open the control room
            </a>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <span className="lp-logo lp-logo-small">
          <RiftMark />
          RIFT
        </span>
        <span>A local-first Twitch encounter director.</span>
        <span>Art and sound generated with ElevenLabs.</span>
      </footer>
    </div>
  );
}
