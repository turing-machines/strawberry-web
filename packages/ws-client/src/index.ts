import type { WsRequest, WsEvent, WsResponse } from '@strawberry/shared';

export class WsClient {
  private ws?: WebSocket;
  private listeners = new Map<string, Set<(e: any) => void>>();
  private backoff = 500;
  private manualClose = false;
  constructor(private url: string) {}

  on(event: string, fn: (ev: any) => void) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(fn);
    this.listeners.set(event, set);
    return () => set.delete(fn);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.manualClose = false;
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this.backoff = 500;
        resolve();
      };
      this.ws.onerror = (e) => {
        this.emit('net_error', { error: 'ws_error', event: e });
        reject(e);
      };
      this.ws.onclose = (ev: CloseEvent) => {
        // Inspect close reason to detect auth failures
        const reason = ev?.reason;
        if (reason === 'token_expired' || reason === 'invalid_token') {
          this.emit('auth_error', { error: reason });
          this.manualClose = true; // stop reconnecting on auth errors
          return;
        }
        if (!this.manualClose) {
          setTimeout(() => this.connect().catch(() => {}), this.backoff);
          this.backoff = Math.min(this.backoff * 2, 30000);
        }
      };
      this.ws.onmessage = (msg) => {
        try {
          const data = JSON.parse((msg.data as string) ?? '{}') as WsEvent | WsResponse;
          const name = 'event' in data && (data as any).event ? (data as any).event : 'action' in data ? (data as any).action : 'message';
          this.emit(name, data);
        } catch {}
      };
    });
  }

  send<T>(action: string, data: T, request_id: string) {
    const payload: WsRequest<T> = { type: 'request', version: '1', action, request_id, data };
    this.ws?.send(JSON.stringify(payload));
  }

  close() {
    this.manualClose = true;
    try {
      this.ws?.close();
    } catch {}
  }
}
