import { AppsV1Api, KubeConfig, type V1Deployment } from '@kubernetes/client-node';

type Health = 'OK' | 'DEGRADED' | 'ERROR' | 'UNKNOWN';
type Source = 'image' | 'endpoint' | 'catalog' | 'hybrid' | 'unknown';
type DiscoveryMode = 'label' | 'namespace' | 'selector' | 'all';

interface Observation {
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

interface Config {
  clusterName: string;
  dashboardUrl: string;
  apiKey: string;
  scrapeIntervalMs: number;
  namespaceAllowlist: Set<string> | null;
  discoveryMode: DiscoveryMode;
  labelSelector: string | null;
}

interface LoggerContext {
  service: string;
  cluster: string;
  version: string;
  commit: string;
}

interface IngestResult {
  attempts: number;
  statusCode: number;
}

const ENABLE_LABEL = 'fleetboard.io/enabled';
const CONTAINER_ANNOTATION = 'fleetboard.io/container-name';

function stringError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isKubeConnectionError(error: unknown): boolean {
  const msg = stringError(error);
  return (
    msg.includes('ECONNREFUSED') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNRESET')
  );
}

function kubeConnectionHint(error: unknown): string {
  const raw = stringError(error);
  return (
    `Cannot connect to the Kubernetes API server (${raw}). ` +
    `Is a cluster running and reachable? Run: kubectl cluster-info`
  );
}

class Logger {
  constructor(private readonly context: LoggerContext) {}

  info(event: string, fields: Record<string, unknown> = {}): void {
    this.emit('info', event, fields);
  }

  error(event: string, fields: Record<string, unknown> = {}): void {
    this.emit('error', event, fields);
  }

  private emit(level: 'info' | 'error', event: string, fields: Record<string, unknown>): void {
    const payload = {
      level,
      event,
      timestamp: new Date().toISOString(),
      ...this.context,
      ...fields
    };
    console.log(JSON.stringify(payload));
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

const VALID_DISCOVERY_MODES: DiscoveryMode[] = ['label', 'namespace', 'selector', 'all'];

function loadConfig(): Config {
  const namespaces = process.env.NAMESPACE_ALLOWLIST
    ?.split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const rawMode = (process.env.DISCOVERY_MODE ?? 'label').trim() as DiscoveryMode;
  if (!VALID_DISCOVERY_MODES.includes(rawMode)) {
    throw new Error(
      `Invalid DISCOVERY_MODE "${rawMode}". Must be one of: ${VALID_DISCOVERY_MODES.join(', ')}`
    );
  }

  const labelSelector = process.env.LABEL_SELECTOR?.trim() || null;
  if (rawMode === 'selector' && !labelSelector) {
    throw new Error('DISCOVERY_MODE=selector requires LABEL_SELECTOR to be set');
  }

  return {
    clusterName: requiredEnv('CLUSTER_NAME'),
    dashboardUrl: requiredEnv('DASHBOARD_URL').replace(/\/$/, ''),
    apiKey: requiredEnv('API_KEY'),
    scrapeIntervalMs: Number(process.env.SCRAPE_INTERVAL_MS ?? 30_000),
    namespaceAllowlist: namespaces?.length ? new Set(namespaces) : null,
    discoveryMode: rawMode,
    labelSelector
  };
}

function parseImageVersion(image: string): string {
  if (image.includes('@sha256:')) {
    const digest = image.split('@sha256:')[1];
    if (digest) return `digest:${digest.slice(0, 12)}`;
  }

  const slashIndex = image.lastIndexOf('/');
  const tagIndex = image.lastIndexOf(':');
  if (tagIndex > slashIndex) {
    const tag = image.slice(tagIndex + 1);
    return tag || 'unknown';
  }

  return 'unknown';
}

function computeHealth(desired: number, available: number): Health {
  return available === desired ? 'OK' : 'DEGRADED';
}

function toObservation(deployment: V1Deployment): Observation {
  const namespace = deployment.metadata?.namespace ?? 'default';
  const name = deployment.metadata?.name ?? 'unknown';
  const annotations = deployment.metadata?.annotations ?? {};
  const containers = deployment.spec?.template?.spec?.containers ?? [];

  const requestedContainer = annotations[CONTAINER_ANNOTATION];
  const chosen = requestedContainer
    ? containers.find((c) => c.name === requestedContainer)
    : containers[0];

  const desired = deployment.spec?.replicas ?? 0;
  const available = deployment.status?.availableReplicas ?? 0;
  const updated = deployment.status?.updatedReplicas ?? 0;

  if (requestedContainer && !chosen) {
    return {
      namespace,
      deployment: name,
      image: '',
      version: 'unknown',
      replicasDesired: desired,
      replicasAvailable: available,
      replicasUpdated: updated,
      health: 'ERROR',
      source: 'image',
      timestamp: new Date().toISOString(),
      error: `Configured container '${requestedContainer}' not found`
    };
  }

  const image = chosen?.image ?? '';

  return {
    namespace,
    deployment: name,
    image,
    version: parseImageVersion(image),
    replicasDesired: desired,
    replicasAvailable: available,
    replicasUpdated: updated,
    health: computeHealth(desired, available),
    source: 'image',
    timestamp: new Date().toISOString()
  };
}

async function postWithRetry(
  config: Config,
  observations: Observation[],
  logger: Logger,
  maxAttempts = 5
): Promise<IngestResult> {
  let attempt = 0;
  let delayMs = 1000;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const response = await fetch(`${config.dashboardUrl}/api/ingest`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey
        },
        body: JSON.stringify({
          cluster: config.clusterName,
          observations
        })
      });

      if (!response.ok) {
        throw new Error(`Ingest failed (${response.status})`);
      }

      return {
        attempts: attempt,
        statusCode: response.status
      };
    } catch (error) {
      logger.error('collector_ingest_attempt_failed', {
        attempt,
        maxAttempts,
        retryDelayMs: attempt >= maxAttempts ? 0 : delayMs,
        error: stringError(error)
      });
      if (attempt >= maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 2, 30_000);
    }
  }
  throw new Error('Ingest retry loop exited unexpectedly');
}

function apiLabelSelector(config: Config): string | undefined {
  if (config.discoveryMode === 'label') return `${ENABLE_LABEL}=true`;
  if (config.discoveryMode === 'selector') return config.labelSelector ?? undefined;
  return undefined;
}

async function collectOnce(config: Config, api: AppsV1Api, logger: Logger): Promise<void> {
  const startedAt = Date.now();

  // Pass label selector to the API for 'label' and 'selector' modes so Kubernetes
  // does the filtering server-side. For 'namespace' and 'all', we fetch everything.
  const result = await api.listDeploymentForAllNamespaces(
    undefined, undefined, undefined, apiLabelSelector(config)
  );
  const fetched = result.body.items;

  // Namespace allowlist is always applied client-side regardless of discovery mode.
  let selected = fetched;
  let namespaceSkipped = 0;
  if (config.namespaceAllowlist) {
    selected = fetched.filter((dep) => {
      const ns = dep.metadata?.namespace ?? 'default';
      return config.namespaceAllowlist!.has(ns);
    });
    namespaceSkipped = fetched.length - selected.length;
  }

  const observations: Observation[] = [];
  let deploymentErrors = 0;

  for (const dep of selected) {
    try {
      observations.push(toObservation(dep));
    } catch (error) {
      deploymentErrors += 1;
      logger.error('collector_deployment_error', {
        deployment: dep.metadata?.name ?? 'unknown',
        namespace: dep.metadata?.namespace ?? 'default',
        error: stringError(error)
      });
    }
  }

  const ingest = await postWithRetry(config, observations, logger);
  const healthBreakdown = observations.reduce<Record<Health, number>>(
    (acc, obs) => {
      acc[obs.health] += 1;
      return acc;
    },
    { OK: 0, DEGRADED: 0, ERROR: 0, UNKNOWN: 0 }
  );

  logger.info('collector_cycle_summary', {
    durationMs: Date.now() - startedAt,
    discoveryMode: config.discoveryMode,
    deploymentsFetched: fetched.length,
    deploymentsObserved: observations.length,
    deploymentErrors,
    namespaceSkipped,
    healthOk: healthBreakdown.OK,
    healthDegraded: healthBreakdown.DEGRADED,
    healthError: healthBreakdown.ERROR,
    healthUnknown: healthBreakdown.UNKNOWN,
    ingestAttempts: ingest.attempts,
    ingestStatusCode: ingest.statusCode
  });
}

async function run(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger({
    service: 'fleetboard-collector',
    cluster: config.clusterName,
    version: process.env.SERVICE_VERSION ?? 'dev',
    commit: process.env.GIT_COMMIT_SHA ?? 'unknown'
  });

  logger.info('collector_started', {
    scrapeIntervalMs: config.scrapeIntervalMs,
    dashboardHost: new URL(config.dashboardUrl).host,
    discoveryMode: config.discoveryMode,
    labelSelector: config.labelSelector ?? undefined,
    namespaceAllowlistEnabled: Boolean(config.namespaceAllowlist),
    namespaceAllowlistCount: config.namespaceAllowlist?.size ?? 0
  });

  const kc = new KubeConfig();
  kc.loadFromDefault();
  const api = kc.makeApiClient(AppsV1Api);

  // Probe the Kubernetes API before entering the loop so we fail fast with a
  // clear message instead of silently retrying a broken connection every cycle.
  try {
    await api.listDeploymentForAllNamespaces(undefined, undefined, undefined, undefined, 1);
  } catch (error) {
    throw new Error(
      isKubeConnectionError(error) ? kubeConnectionHint(error) : stringError(error)
    );
  }

  while (true) {
    try {
      await collectOnce(config, api, logger);
    } catch (error) {
      const msg = isKubeConnectionError(error) ? kubeConnectionHint(error) : stringError(error);
      logger.error('collector_cycle_failed', { error: msg });
    }

    await new Promise((resolve) => setTimeout(resolve, config.scrapeIntervalMs));
  }
}

run().catch((error) => {
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'collector_fatal',
      timestamp: new Date().toISOString(),
      error: stringError(error)
    })
  );
  process.exit(1);
});
