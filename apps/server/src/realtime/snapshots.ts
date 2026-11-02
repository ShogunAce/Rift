import type { Snapshot } from '../../../../packages/shared/src/contracts.js';
import type WebSocket from 'ws';
export function overlaySnapshot(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    events: [],
    round: snapshot.round
      ? {
          ...snapshot.round,
          id: '',
          seed: '',
          proposal: snapshot.round.proposal ? { ...snapshot.round.proposal, id: '' } : null,
        }
      : null,
  };
}
// A lagging client reconnects to a fresh snapshot instead of retaining an unbounded queue.
export function sendSnapshot(
  ws: Pick<WebSocket, 'readyState' | 'bufferedAmount' | 'terminate' | 'send'>,
  payload: string,
) {
  if (ws.readyState !== 1) return;
  if (ws.bufferedAmount > 1024 * 1024) {
    ws.terminate();
    return;
  }
  ws.send(payload);
}
