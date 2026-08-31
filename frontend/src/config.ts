const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const configuredApiBase = import.meta.env.VITE_API_BASE?.trim();
const configuredWsBase = import.meta.env.VITE_WS_BASE?.trim();
const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

// 本地开发时沿用页面自身的主机名（而不是写死 localhost）：
// 会话 cookie 是 SameSite=Lax，页面在 127.0.0.1 而 API 在 localhost 会被判定为跨站，
// cookie 不会随请求发出，登录态就丢了。线上前后端同源，不受影响。
export const API_BASE = trimTrailingSlash(
  configuredApiBase ||
    (localHosts.has(window.location.hostname)
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : window.location.origin)
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
