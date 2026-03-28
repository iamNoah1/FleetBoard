# How FleetBoard works

## Overview

FleetBoard has two components:

- **Dashboard** — a stateless Next.js app that receives data and renders the matrix UI
- **Collector** — a small Node.js service, one per cluster, that reads the Kubernetes API and pushes snapshots to the dashboard

```
Kubernetes API
     │  (list deployments)
     ▼
 collector          POST /api/ingest
(per cluster)  ──────────────────────▶  dashboard
                    X-API-Key                │
                                             ▼
                                      in-memory store
                                             │
                                             ▼
                                      matrix UI (Next.js)
```

## What the collector does

The collector runs a polling loop on a fixed interval (`SCRAPE_INTERVAL_MS`, default 30s):

1. **Query** — calls `GET /apis/apps/v1/deployments` on the Kubernetes API, optionally filtered by label selector depending on the discovery mode
2. **Filter** — applies the namespace allowlist client-side if configured
3. **Build observations** — for each selected deployment, reads the container image tag, parses the version, and computes health from replica counts
4. **Push** — POSTs all observations to `POST /api/ingest` on the dashboard with an `X-API-Key` header
5. **Retry** — if the POST fails, retries with exponential backoff (up to 5 attempts, starting at 1s, capped at 30s)
6. **Sleep** — waits for the next interval and repeats

The collector has no persistent state. If it restarts, the first cycle simply overwrites whatever was in the dashboard for that cluster.

## How the collector authenticates to Kubernetes

This differs depending on where the collector is running.

### Running locally (`npm run dev`)

`loadFromDefault()` reads your local kubeconfig — the same file `kubectl` uses:

- `KUBECONFIG` env var if set
- `~/.kube/config` otherwise

It uses whichever context is currently active (`kubectl config current-context`). The collector makes API calls with the credentials of that context — your personal user, a service account token, or whatever is configured there.

### Running inside the cluster (Helm deployment)

`loadFromDefault()` detects it is running inside a pod and switches to **in-cluster auth** automatically. Kubernetes injects the following into every pod at startup:

```
/var/run/secrets/kubernetes.io/serviceaccount/token      ← JWT identifying the pod's ServiceAccount
/var/run/secrets/kubernetes.io/serviceaccount/ca.crt     ← cluster CA cert for TLS verification
/var/run/secrets/kubernetes.io/serviceaccount/namespace  ← namespace the pod is in
```

The Kubernetes API server address is also available as `KUBERNETES_SERVICE_HOST` / `KUBERNETES_SERVICE_PORT` env vars. The collector uses these to reach the API server inside the cluster network — no external URL, no kubeconfig file.

The ServiceAccount the pod runs as is created by the Helm chart and has a `ClusterRole` granting exactly `get/list/watch` on `deployments`. See [Security](./security.md) for details.

## How the dashboard stores data

The dashboard is fully stateless — there is no database. All data lives in a `Map` stored on `globalThis`:

```
Map<clusterName, Map<"namespace/deployment", Observation>>
```

Each ingest call upserts the latest snapshot for that cluster. Only the most recent observation per deployment is kept. If the dashboard restarts, all data is lost and the collectors will repopulate it within one scrape interval.

Because state is in-memory, **the dashboard must run as a single replica**. Running multiple replicas would result in each pod holding a different subset of data.

## Staleness detection

Each observation carries a `timestamp` set by the collector at the time of collection. The dashboard computes age on every page render: if `now - timestamp > FLEETBOARD_STALE_AFTER_SECONDS`, the cell is marked stale. No background job is needed — stale detection is purely a render-time calculation.
