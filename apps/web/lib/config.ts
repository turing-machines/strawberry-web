export type AppConfig = {
  apiBaseUrl: string;
  wsUrl: string;
  releaseTag?: string;
  minServerVersion?: string;
};

export async function loadConfig(): Promise<AppConfig> {
  const res = await fetch('/app-config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load app-config.json');
  return res.json();
}

