export interface DashboardConfig {
  clusters: string[];
  staleAfterSeconds: number;
  apiKeys: Record<string, string>;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function getConfig(): DashboardConfig {
  const clusters = (env('FLEETBOARD_CLUSTERS') ?? 'dev,staging,prod')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  const staleAfterSeconds = Number(env('FLEETBOARD_STALE_AFTER_SECONDS') ?? 120);

  const apiKeys: Record<string, string> = {};
  for (const cluster of clusters) {
    const keyName = `FLEETBOARD_API_KEY_${cluster.toUpperCase()}`;
    const key = env(keyName);
    if (key) {
      apiKeys[cluster] = key;
    }
  }

  return {
    clusters,
    staleAfterSeconds: Number.isFinite(staleAfterSeconds) ? staleAfterSeconds : 120,
    apiKeys
  };
}
