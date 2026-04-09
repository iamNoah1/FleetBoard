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

  let okCount = 0;
  let degradedCount = 0;
  let errorCount = 0;
  let unknownCount = 0;
  let staleCount = 0;

  for (const row of rows) {
    for (const cluster of config.clusters) {
      const obs = data.get(cluster)?.get(row);
      if (!obs) continue;
      if (obs.health === 'OK') okCount += 1;
      if (obs.health === 'DEGRADED') degradedCount += 1;
      if (obs.health === 'ERROR') errorCount += 1;
      if (obs.health === 'UNKNOWN') unknownCount += 1;
      if (isStale(obs.timestamp, config.staleAfterSeconds)) staleCount += 1;
    }
  }

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
            <span className="cmd-meta-value">{rows.length}</span>
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
            <table className="matrix">
              <thead>
                <tr>
                  <th>DEPLOYMENT</th>
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
                        <td key={`${row}-${cluster}`} className="matrix-cell-td">
                          <div className={`cell ${statusClass(obs, stale)}`}>
                            {!obs ? (
                              <div className="cell-missing">— NO REPORT</div>
                            ) : (
                              <>
                                <div className="cell-header">
                                  <span className={`cell-led ${statusClass(obs, stale)}`} />
                                  <span className={`cell-badge ${statusClass(obs, stale)}`}>{statusText(obs, stale)}</span>
                                </div>
                                <div className={`cell-version${stale ? ' stale' : ''}`}>{obs.version}</div>
                                <div className="cell-meta">{obs.replicasAvailable}/{obs.replicasDesired} replicas</div>
                                <div className="cell-meta">{new Date(obs.timestamp).toLocaleString()}</div>
                                {stale && <div className="cell-meta">was: {obs.health}</div>}
                              </>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
