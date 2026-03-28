import Filters from './components/Filters';
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

export default function Home({
  searchParams
}: {
  searchParams: { namespace?: string; q?: string };
}) {
  const config = getConfig();
  const data = snapshot();

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

  const rows = Array.from(rowKeys)
    .filter((key) => {
      const [ns, deployment] = key.split('/');
      if (nsFilter && ns !== nsFilter) return false;
      if (qFilter && !deployment.toLowerCase().includes(qFilter)) return false;
      return true;
    })
    .sort();

  const totalCells = rows.length * config.clusters.length;
  let okCount = 0;
  let degradedCount = 0;
  let errorCount = 0;
  let unknownCount = 0;
  let staleCount = 0;

  for (const row of rows) {
    for (const cluster of config.clusters) {
      const obs = data.get(cluster)?.get(row);
      if (!obs) {
        continue;
      }
      if (obs.health === 'OK') okCount += 1;
      if (obs.health === 'DEGRADED') degradedCount += 1;
      if (obs.health === 'ERROR') errorCount += 1;
      if (obs.health === 'UNKNOWN') unknownCount += 1;
      if (isStale(obs.timestamp, config.staleAfterSeconds)) staleCount += 1;
    }
  }

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">FleetBoard</p>
        <h1>Deployment Version Dashboard</h1>
        <p className="subtitle">
          Live image-tag and rollout status matrix across configured Kubernetes clusters.
        </p>
      </section>

      <section className="stats">
        <div className="stat">
          <span className="label">Visible Services</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="stat">
          <span className="label">Cluster Cells</span>
          <strong>{totalCells}</strong>
        </div>
        <div className="stat ok">
          <span className="label">OK</span>
          <strong>{okCount}</strong>
        </div>
        <div className="stat degraded">
          <span className="label">Degraded</span>
          <strong>{degradedCount}</strong>
        </div>
        <div className="stat error">
          <span className="label">Error</span>
          <strong>{errorCount}</strong>
        </div>
        <div className="stat unknown">
          <span className="label">Unknown</span>
          <strong>{unknownCount}</strong>
        </div>
        <div className="stat stale">
          <span className="label">Stale</span>
          <strong>{staleCount}</strong>
        </div>
      </section>

      <Filters namespaces={Array.from(namespaces).sort()} />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Namespace/Deployment</th>
              {config.clusters.map((cluster) => (
                <th key={cluster}>{cluster}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <td className="service-name">{row}</td>
                {config.clusters.map((cluster) => {
                  const obs = data.get(cluster)?.get(row);
                  const stale = obs ? isStale(obs.timestamp, config.staleAfterSeconds) : false;
                  return (
                    <td key={`${row}-${cluster}`}>
                      <article className={`cell ${statusClass(obs, stale)}`}>
                        {!obs ? (
                          <div className="missing-text">No report</div>
                        ) : (
                          <>
                            <div className="cell-top">
                              <strong className={`version${stale ? ' version-stale' : ''}`}>{obs.version}</strong>
                              <span className={`badge ${statusClass(obs, stale)}`}>{statusText(obs, stale)}</span>
                            </div>
                            <div className="meta">{obs.replicasAvailable}/{obs.replicasDesired} replicas</div>
                            <div className="meta">source: {obs.source}</div>
                            <div className="meta">last seen: {new Date(obs.timestamp).toLocaleString()}</div>
                            {stale ? <div className="meta stale-note">last known: {obs.health}</div> : null}
                          </>
                        )}
                      </article>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
