import { it, expect, vi } from 'vitest';
import { sendSnapshot } from '../../apps/server/src/realtime/snapshots';
it('disconnects slow consumers rather than extending their queued snapshots', () => {
  const ws = { readyState: 1, bufferedAmount: 1024 * 1024 + 1, terminate: vi.fn(), send: vi.fn() };
  sendSnapshot(ws as any, 'snapshot');
  expect(ws.terminate).toHaveBeenCalledOnce();
  expect(ws.send).not.toHaveBeenCalled();
});
it('does not send to a closing client and delivers to a healthy client', () => {
  const ws = { readyState: 2, bufferedAmount: 0, terminate: vi.fn(), send: vi.fn() };
  sendSnapshot(ws as any, 'snapshot');
  expect(ws.send).not.toHaveBeenCalled();
  ws.readyState = 1;
  sendSnapshot(ws as any, 'snapshot');
  expect(ws.send).toHaveBeenCalledWith('snapshot');
});
