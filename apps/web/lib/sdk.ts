import { createApi } from '@strawberry/api-client';
import { WsClient } from '@strawberry/ws-client';
import { tokenStore } from './auth';
import type { AppConfig } from './config';

export function createSdk(cfg: AppConfig) {
  const refreshToken = async (): Promise<string | null> => {
    // Placeholder: implement token refresh call if available. For now, indicate no refresh.
    return null;
  };
  const api = createApi(cfg.apiBaseUrl, tokenStore.get, refreshToken);
  const ws = () => {
    const c = new WsClient(`${cfg.wsUrl}?token=${encodeURIComponent(tokenStore.get() || '')}`);
    // Global auth error handler for WS: clear token and redirect to login
    c.on('auth_error', (_info: any) => {
      try { tokenStore.clear(); } catch {}
      if (typeof window !== 'undefined') window.location.href = '/';
    });
    // Network errors should not force logout; allow auto-reconnect
    c.on('net_error', (_info: any) => {
      /* no-op */
    });
    return c;
  };
  return { api, ws };
}
