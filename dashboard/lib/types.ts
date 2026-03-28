export type Health = 'OK' | 'DEGRADED' | 'ERROR' | 'UNKNOWN';
export type Source = 'image' | 'endpoint' | 'catalog' | 'hybrid' | 'unknown';

export interface Observation {
  cluster: string;
  namespace: string;
  deployment: string;
  image: string;
  version: string;
  replicasDesired: number;
  replicasAvailable: number;
  replicasUpdated: number;
  health: Health;
  source: Source;
  timestamp: string;
  error?: string;
}

export interface IngestResult {
  accepted: number;
  skipped: number;
}
