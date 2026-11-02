import { useState } from 'react';
import type { Choice, Snapshot } from '../../../../packages/shared/src/contracts';
import { choices } from '../../../../packages/shared/src/contracts';
export const choiceArt: Record<Choice, string> = {
  a: '/landing/golem.webp',
  b: '/landing/fog.webp',
  c: '/landing/vault.webp',
};
export function Scene({
  snapshot,
  compact = false,
  live = false,
}: {
  snapshot: Snapshot | null;
  compact?: boolean;
  live?: boolean;
}) {
  const p = snapshot?.round?.proposal;
  const approved = snapshot?.round?.status === 'approved';
  const [motion] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  return (
    <div className={`temple-scene ${compact ? 'compact' : ''}`}>
      <img
        src="/landing/plate.webp"
        alt="An ancient stone temple, overgrown and lit by two small braziers"
      />
      {live && motion && (
        <video src="/landing/hero-loop.mp4" autoPlay muted loop playsInline aria-hidden="true" />
      )}
      {approved && p?.effect && (
        <div className="reveal-sigil" key={p?.id} aria-hidden="true">
          <img src={choiceArt[p.choice]} alt="" />
        </div>
      )}
      <div className="scene-shade" />
      <div className="scene-top">
        <span className="scene-kicker">THE SHATTERED REALMS</span>
        <span className="scene-tag">CHAPTER I</span>
      </div>
      <div className="scene-title" key={approved ? `title-${p?.id}` : 'title-waiting'}>
        <div className="eyebrow">
          {approved ? 'THE WORLD HAS CHANGED' : 'ENCOUNTER 01 / ANCIENT RUINS'}
        </div>
        <h2>{approved ? p?.name : 'The Ruined Temple'}</h2>
        <p>{approved ? p?.variant : 'Beneath the silence, something is waiting.'}</p>
      </div>
    </div>
  );
}
export function VoteBars({ snapshot }: { snapshot: Snapshot | null }) {
  const tally = snapshot?.round?.tally ?? { a: 0, b: 0, c: 0 };
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const top = Math.max(...Object.values(tally));
  const voting = snapshot?.round?.status === 'voting';
  return (
    <div className="vote-list">
      {choices.map((c) => (
        <div
          className={`vote-row ${snapshot?.round?.proposal?.choice === c.id ? 'winner' : ''} ${voting && top > 0 && tally[c.id] === top ? 'leading' : ''}`}
          key={c.id}
        >
          <div className="choice-letter" style={{ backgroundImage: `url(${choiceArt[c.id]})` }}>
            <span>{c.id.toUpperCase()}</span>
          </div>
          <div className="vote-info">
            <div className="vote-title">
              <span>{c.name}</span>
              <span className="vote-count">
                {tally[c.id]} <small>{total ? Math.round((tally[c.id] / total) * 100) : 0}%</small>
              </span>
            </div>
            <div className="vote-track">
              <div style={{ transform: `scaleX(${total ? tally[c.id] / total : 0})` }} />
            </div>
            <code>!rift {c.id}</code>
          </div>
        </div>
      ))}
    </div>
  );
}
