import Filters from './components/Filters';
import DeploymentMatrix, { type RowData, type CellData } from './components/DeploymentMatrix';
import { getConfig } from '@/lib/config';
import { snapshot } from '@/lib/store';
import type { Observation } from '@/lib/types';

function isStale(timestamp: string, thresholdSeconds: number): boolean {
  const ageMs = Date.now() - Date.parse(timestamp);
  return ageMs > thresholdSeconds * 1000;
}

function statusClass(obs?: Observation, stale = false): string {
  if (!obs) return 'missing';
  if (stale) return 'stale';
  if (obs.health === 'OK') return 'ok';
  if (obs.health === 'ERROR') return 'error';
  if (obs.health === 'UNKNOWN') return 'unknown';
  return 'degraded';
}

function statusText(obs?: Observation, stale = false): string {
  if (!obs) return 'MISSING';
  if (stale) return 'STALE';
  return obs.health;
}

function parseRepoMap(raw: string): Set<string> {
  const deployments = new Set<string>()
  for (const entry of raw.split(',')) {
    const eq = entry.indexOf('=')
    if (eq !== -1) deployments.add(entry.slice(0, eq).trim())
  }
  return deployments
}

export default function Home({
  searchParams
}: {
  searchParams: { namespace?: string; q?: string };
}) {
  const config = getConfig();
  const data = snapshot();
  const configuredDeployments = parseRepoMap(process.env.FLEETBOARD_REPO_MAP ?? '')

  const rowKeys = new Set<string>();
  const namespaces = new Set<string>();

  for (const clusterMap of data.values()) {
    for (const [key, obs] of clusterMap.entries()) {
      rowKeys.add(key);
      namespaces.add(obs.namespace);
    }
  }

  const nsFilter = (searchParams.namespace ?? '').trim();
  const qFilter = (searchParams.q ?? '').trim().toLowerCase();

  const filteredKeys = Array.from(rowKeys)
    .filter((key) => {
      const [ns, deployment] = key.split('/');
      if (nsFilter && ns !== nsFilter) return false;
      if (qFilter && !deployment.toLowerCase().includes(qFilter)) return false;
      return true;
    })
    .sort();

  let okCount = 0;
  let degradedCount = 0;
  let errorCount = 0;
  let unknownCount = 0;
  let staleCount = 0;

  const rows: RowData[] = filteredKeys.map(key => {
    const [, deployment] = key.split('/')
    const cells: Record<string, CellData | null> = {}

    for (const cluster of config.clusters) {
      const obs = data.get(cluster)?.get(key)
      if (!obs) {
        cells[cluster] = null
        continue
      }
      const stale = isStale(obs.timestamp, config.staleAfterSeconds)
      if (obs.health === 'OK') okCount += 1;
      if (obs.health === 'DEGRADED') degradedCount += 1;
      if (obs.health === 'ERROR') errorCount += 1;
      if (obs.health === 'UNKNOWN') unknownCount += 1;
      if (stale) staleCount += 1;
      cells[cluster] = {
        statusClass: statusClass(obs, stale),
        statusText: statusText(obs, stale),
        version: obs.version,
        replicasAvailable: obs.replicasAvailable,
        replicasDesired: obs.replicasDesired,
        timestamp: obs.timestamp,
        isStale: stale,
      }
    }

    return {
      key,
      deployment,
      hasRepoConfig: configuredDeployments.has(deployment),
      cells,
    }
  })

  return (
    <div className="cmd-shell">
      <header className="cmd-header">
        <div className="cmd-brand">
          <div className="cmd-brand-indicator" />
          <div>
            <div className="cmd-brand-name">FLEETBOARD</div>
            <div className="cmd-brand-sub">DEPLOYMENT CONTROL MATRIX</div>
          </div>
        </div>
        <div className="cmd-header-meta">
          <div className="cmd-meta-item">
            <span className="cmd-meta-label">CLUSTERS</span>
            <span className="cmd-meta-value">{config.clusters.length}</span>
          </div>
          <div className="cmd-meta-item">
            <span className="cmd-meta-label">SERVICES</span>
            <span className="cmd-meta-value">{filteredKeys.length}</span>
          </div>
        </div>
      </header>

      <main className="cmd-main">
        <div className="sys-status">
          <div className="sys-stat ok">
            <span className="sys-stat-led" />
            <span className="sys-stat-label">OK</span>
            <strong className="sys-stat-val">{okCount}</strong>
          </div>
          <div className="sys-stat degraded">
            <span className="sys-stat-led" />
            <span className="sys-stat-label">DEGRADED</span>
            <strong className="sys-stat-val">{degradedCount}</strong>
          </div>
          <div className="sys-stat error">
            <span className="sys-stat-led" />
            <span className="sys-stat-label">ERROR</span>
            <strong className="sys-stat-val">{errorCount}</strong>
          </div>
          <div className="sys-stat unknown">
            <span className="sys-stat-led" />
            <span className="sys-stat-label">UNKNOWN</span>
            <strong className="sys-stat-val">{unknownCount}</strong>
          </div>
          <div className="sys-stat stale">
            <span className="sys-stat-led" />
            <span className="sys-stat-label">STALE</span>
            <strong className="sys-stat-val">{staleCount}</strong>
          </div>
        </div>

        <Filters namespaces={Array.from(namespaces).sort()} />

        <div className="matrix-frame">
          <span className="corner-tl" aria-hidden="true" />
          <div className="matrix-wrap">
            <DeploymentMatrix clusters={config.clusters} rows={rows} />
          </div>
        </div>
      </main>
    </div>
  );
}
