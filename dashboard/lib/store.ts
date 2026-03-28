import type { IngestResult, Observation } from './types';

interface State {
  byCluster: Map<string, Map<string, Observation>>;
}

const globalForState = globalThis as unknown as { fleetboardState?: State };

const state: State =
  globalForState.fleetboardState ?? {
    byCluster: new Map<string, Map<string, Observation>>()
  };

globalForState.fleetboardState = state;

function idFor(observation: Observation): string {
  return `${observation.namespace}/${observation.deployment}`;
}

function parseTimestamp(input: string): string | null {
  const ms = Date.parse(input);
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms).toISOString();
}

export function upsertBatch(cluster: string, incoming: Observation[]): IngestResult {
  // Each ingest call is a complete snapshot of what the collector currently sees.
  // Build a fresh map so deployments absent from this batch are immediately removed.
  const clusterMap = new Map<string, Observation>();
  let accepted = 0;
  let skipped = 0;

  for (const item of incoming) {
    const timestamp = parseTimestamp(item.timestamp);
    if (!timestamp) {
      skipped += 1;
      continue;
    }

    clusterMap.set(idFor(item), { ...item, cluster, timestamp });
    accepted += 1;
  }

  state.byCluster.set(cluster, clusterMap);
  return { accepted, skipped };
}

export function snapshot(): Map<string, Map<string, Observation>> {
  return state.byCluster;
}
