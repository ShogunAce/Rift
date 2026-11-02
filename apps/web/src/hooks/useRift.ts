import { useEffect, useState, useCallback } from 'react';
import type { Snapshot } from '../../../../packages/shared/src/contracts';
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}
export function useRift(enabled: boolean, overlay = false) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const data = overlay
        ? await fetch('/api/overlay/bootstrap', {
            headers: { Authorization: 'Bearer ' + location.hash.slice(1) },
          }).then(async (r) => {
            if (!r.ok) throw new Error('Invalid overlay link. Copy a fresh link from Settings.');
            return r.json();
          })
        : await api('/snapshot');
      setSnapshot((old) => (!old || data.sequence >= old.sequence ? data : old));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [overlay]);
  useEffect(() => {
    if (!enabled) {
      setSnapshot(null);
      setOnline(false);
      setError('');
      return;
    }
    let disposed = false;
    let socket: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    void refresh();
    function connect() {
      socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${overlay ? '?role=overlay' : ''}`,
      );
      socket.onopen = () => {
        if (overlay) socket.send(JSON.stringify({ overlayToken: location.hash.slice(1) }));
      };
      socket.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as Snapshot;
          setSnapshot((old) => (!old || data.sequence >= old.sequence ? data : old));
          setOnline(true);
          setError('');
        } catch {
          setError('Invalid server update');
        }
      };
      socket.onclose = () => {
        setOnline(false);
        if (!disposed) retry = setTimeout(connect, 2000);
      };
      socket.onerror = () => socket.close();
    }
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [enabled, overlay, refresh]);
  return { snapshot, online, error, refresh };
}
