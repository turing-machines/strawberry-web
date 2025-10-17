import type { HttpEnvelope } from '@strawberry/shared';

export class ApiClient {
  constructor(private baseUrl: string, private getToken?: () => string | null) {}

  private headers() {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = this.getToken?.();
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  }

  private async unwrap<T>(res: Response): Promise<T> {
    const env = (await res.json()) as HttpEnvelope<T>;
    if (env.status_code !== 0) {
      const e = new Error(env.message || 'API error') as any;
      e.status_code = env.status_code;
      e.details = env.data;
      throw e;
    }
    return (env.data as T) ?? ({} as T);
  }

  get<T>(path: string) {
    return fetch(`${this.baseUrl}${path}`, { headers: this.headers() }).then((r) => this.unwrap<T>(r));
  }

  post<T>(path: string, body?: unknown) {
    return fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body ?? {}),
    }).then((r) => this.unwrap<T>(r));
  }

  put<T>(path: string, body?: unknown) {
    return fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body ?? {}),
    }).then((r) => this.unwrap<T>(r));
  }

  patch<T>(path: string, body?: unknown) {
    return fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body ?? {}),
    }).then((r) => this.unwrap<T>(r));
  }
}

