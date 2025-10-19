import type { HttpEnvelope } from '@strawberry/shared';

export class ApiClient {
  constructor(
    private baseUrl: string,
    private getToken?: () => string | null,
    private refreshToken?: () => Promise<string | null>,
  ) {}

  private headers() {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = this.getToken?.();
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  }

  private parseWwwAuthenticate(res: Response): string | undefined {
    const hdr = res.headers.get('WWW-Authenticate');
    if (!hdr) return undefined;
    const m = hdr.match(/error="([^"]+)"/i);
    return m?.[1];
  }

  private async unwrap<T>(res: Response, original?: { method?: string; body?: string; path?: string }, didRetry = false): Promise<T> {
    const env = (await res.json()) as HttpEnvelope<T>;
    if (env.status_code !== 0) {
      // Auth handling: token expired vs invalid
      const authHeaderErr = res.status === 401 ? this.parseWwwAuthenticate(res) : null;
      const dataErr = (env as any)?.data?.error as string | undefined;
      const appCode = env.status_code;
      const isExpired = authHeaderErr === 'token_expired' || appCode === 4002 || dataErr === 'token_expired';
      const isInvalid = authHeaderErr === 'invalid_token' || appCode === 4003 || dataErr === 'invalid_token';

      if (res.status === 401 && isExpired && this.refreshToken && !didRetry) {
        try {
          const newTok = await this.refreshToken();
          if (newTok) {
            // Retry original request once with refreshed token
            if (original?.path) {
              const retry = await fetch(`${this.baseUrl}${original.path}`, {
                method: original.method || 'GET',
                headers: this.headers(),
                body: original.body,
              });
              return this.unwrap<T>(retry, original, true);
            }
          }
        } catch {}
      }

      const e = new Error(env.message || 'API error') as any;
      e.status_code = env.status_code;
      e.details = env.data;
      if (isExpired) e.auth_error = 'token_expired';
      if (isInvalid) e.auth_error = 'invalid_token';
      throw e;
    }
    return (env.data as T) ?? ({} as T);
  }

  private request<T>(path: string, init?: RequestInit & { method?: string; body?: string }) {
    const reqInit: RequestInit = { ...init, headers: this.headers() };
    const original = { method: init?.method, body: init?.body as string | undefined, path };
    return fetch(`${this.baseUrl}${path}`, reqInit).then((r) => this.unwrap<T>(r, original));
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
  }
}
