import type { Snapshot } from '../../../../packages/shared/src/contracts';
import { choices } from '../../../../packages/shared/src/contracts';
export function Scene({
  snapshot,
  compact = false,
}: {
  snapshot: Snapshot | null;
  compact?: boolean;
}) {
  const p = snapshot?.round?.proposal;
  const approved = snapshot?.round?.status === 'approved';
  return (
    <div className={`temple-scene ${compact ? 'compact' : ''}`}>
      <img
        src="/temple.svg"
        alt="An ancient stone temple, overgrown and lit by two small braziers"
      />
      <div className="scene-shade" />
      <div className="scene-top">
        <span className="scene-kicker">THE SHATTERED REALMS</span>
        <span className="scene-tag">CHAPTER I</span>
      </div>
      <div className="scene-title">
        <div className="eyebrow">
          {approved ? 'THE WORLD HAS CHANGED' : 'ENCOUNTER 01 / ANCIENT RUINS'}
        </div>
        <h2>{approved ? p?.name : 'The Ruined Temple'}</h2>
        <p>{approved ? p?.variant : 'Beneath the silence, something is waiting.'}</p>
      </div>
      {approved && p?.effect && (
        <div className="reveal-sigil" key={p?.id} aria-hidden="true">
          {p?.choice === 'a' ? (
            <svg viewBox="0 0 120 140">
              <path d="M45 8L74 8 88 35 79 55 96 66 108 112 88 120 78 89 75 135H47L42 89 29 120 10 112 24 66 42 55 32 35Z" />
              <path className="eyes" d="M44 34H54M65 34H75" />
            </svg>
          ) : (
            <span>{p?.choice === 'b' ? '≋' : '◇'}</span>
          )}
        </div>
      )}
    </div>
  );
}
export function VoteBars({ snapshot }: { snapshot: Snapshot | null }) {
  const tally = snapshot?.round?.tally ?? { a: 0, b: 0, c: 0 };
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  return (
    <div className="vote-list">
      {choices.map((c) => (
        <div
          className={`vote-row ${snapshot?.round?.proposal?.choice === c.id ? 'winner' : ''}`}
          key={c.id}
        >
          <div className="choice-letter">{c.id.toUpperCase()}</div>
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
