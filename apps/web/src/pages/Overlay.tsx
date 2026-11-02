import type { Round } from '../../../../packages/shared/src/contracts';
import { useRift } from '../hooks/useRift';
import { Scene, VoteBars } from '../components/Scene';
const statusLabel: Record<Round['status'], string> = {
  voting: 'VOTING OPEN',
  proposed: 'VOTING CLOSED',
  approved: 'UNLEASHED',
  rejected: 'REJECTED',
  cancelled: 'NO ENCOUNTER',
};
export default function Overlay() {
  const { snapshot, online, error } = useRift(true, true);
  return (
    <main className="broadcast" data-status={snapshot?.round?.status ?? 'idle'}>
      <div className="broadcast-header">
        <span className="brand">
          RIFT<span> / ENCOUNTER DIRECTOR</span>
        </span>
        <span className="badge">
          {snapshot?.mode === 'rehearsal'
            ? 'REHEARSAL · SIMULATED VOTES'
            : snapshot?.connection.status === 'connected'
              ? 'TWITCH CONNECTED'
              : 'TWITCH DISCONNECTED'}
          {!online ? ' · SYNC LOST' : ''}
        </span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <Scene snapshot={snapshot} live />
      <div className="broadcast-bottom">
        <section>
          <div className="section-heading">
            <span>YOUR CHOICE. THEIR FATE.</span>
            <span>
              {snapshot?.round?.status ? statusLabel[snapshot.round.status] : 'NEXT VOTE SOON'}
            </span>
          </div>
          <VoteBars snapshot={snapshot} />
        </section>
        <aside>
          <div className="eyebrow">
            ROUND {String(Math.max(1, snapshot?.state.round ?? 1)).padStart(2, '0')}
          </div>
          <h2>
            {snapshot?.round?.status === 'approved'
              ? 'Encounter unleashed'
              : snapshot?.round?.status === 'proposed'
                ? 'The keeper decides'
                : 'Shape what comes next'}
          </h2>
          <p>
            {snapshot?.round?.status === 'proposed'
              ? 'Chat has spoken. The final call is the keeper’s.'
              : snapshot?.round?.status === 'approved'
                ? `${snapshot.round.proposal?.variant}. The keeper has approved it.`
                : snapshot?.round?.status === 'voting'
                  ? 'Vote in chat with !rift a, !rift b or !rift c.'
                  : 'The next vote opens when the keeper starts a round.'}
          </p>
          <div className="threat-label">
            <span>THREAT</span>
            <strong>
              {snapshot?.state.threat ?? 0} / {snapshot?.state.maxThreat ?? 60}
            </strong>
          </div>
          <div className="meter">
            <i
              style={{
                transform: `scaleX(${snapshot ? snapshot.state.threat / snapshot.state.maxThreat : 0})`,
              }}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
