import { API_BASE_URL } from './http';

function toWsUrl(httpUrl: string): string {
  if (httpUrl.startsWith('https://')) return httpUrl.replace('https://', 'wss://');
  if (httpUrl.startsWith('http://')) return httpUrl.replace('http://', 'ws://');
  // Fallback: assume http
  return `ws://${httpUrl}`;
}

export function connectGameSocket(gameId: string, email: string): WebSocket {
  const base = API_BASE_URL || 'http://localhost:3000';
  const wsBase = toWsUrl(base);
  const url = `${wsBase}/ws?game_id=${encodeURIComponent(gameId)}&email=${encodeURIComponent(email)}`;
  const socket = new WebSocket(url);

  socket.onopen = () => {
    console.log('[WS] Connected', { gameId, email });
  };

  socket.onclose = (ev) => {
    console.log('[WS] Closed', ev.code, ev.reason);
  };

  socket.onerror = (err) => {
    console.error('[WS] Error', err);
  };

  // Consumers should set onmessage; we keep default no-op

  return socket;
}
