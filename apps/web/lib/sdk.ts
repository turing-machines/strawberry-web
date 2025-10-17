import { createApi } from '@strawberry/api-client';
import { WsClient } from '@strawberry/ws-client';
import { tokenStore } from './auth';
import type { AppConfig } from './config';

export function createSdk(cfg: AppConfig) {
  const api = createApi(cfg.apiBaseUrl, tokenStore.get);
  const ws = () => new WsClient(`${cfg.wsUrl}?token=${encodeURIComponent(tokenStore.get() || '')}`);
  return { api, ws };
}

