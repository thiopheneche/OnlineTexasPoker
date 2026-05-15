const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const configuredApiBase = import.meta.env.VITE_API_BASE?.trim();
const configuredWsBase = import.meta.env.VITE_WS_BASE?.trim();
const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

export const API_BASE = trimTrailingSlash(
  configuredApiBase || (localHosts.has(window.location.hostname) ? 'http://localhost:8000' : window.location.origin)
);

export const WS_BASE = trimTrailingSlash(
  configuredWsBase || API_BASE.replace(/^http/, 'ws')
);

export const sessionWsUrl = (username: string) => (
  `${WS_BASE}/ws/session/${encodeURIComponent(username)}`
);

export const tableWsUrl = (tableId: string, clientId: string) => (
  `${WS_BASE}/ws/${encodeURIComponent(tableId)}/${encodeURIComponent(clientId)}`
);
