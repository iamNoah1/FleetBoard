# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

FleetBoard is a multi-cluster Kubernetes deployment visibility tool. It consists of three sub-projects:

- **`collector`** — per-cluster TypeScript service that watches Kubernetes Deployments and ships version/health snapshots to the dashboard
- **`dashboard`** — stateless Next.js 14 app that receives collector snapshots, stores latest data in memory, and renders a cluster matrix UI
- **`scripts/`** — local e2e and cluster management scripts
- **`kind/`** — test manifests for local kind cluster

## Commands

### collector

```bash
cd collector
npm install
npm run dev          # run with tsx (no build step)
npm run typecheck    # tsc --noEmit
npm run build        # compile to dist/
```

### dashboard

```bash
cd dashboard
npm install
npm run dev          # next dev
npm run typecheck    # tsc --noEmit
npm run build        # next build
npm run lint         # next lint
```

### End-to-end integration test (requires docker, helm, kind, kubectl, curl)

```bash
./scripts/kind-e2e.sh
```

This script builds both Docker images, spins up a `kind` cluster, installs both Helm charts, and runs a smoke check against the live dashboard.

## Architecture

### Data flow

```
Kubernetes API
     │
     ▼
collector  ──POST /api/ingest──▶  dashboard
(one per cluster)          X-API-Key               (central)
```

The collector polls Kubernetes every `SCRAPE_INTERVAL_MS` (default 30s), filters Deployments with label `fleetboard.io/enabled=true`, builds `Observation` objects, and POSTs them with exponential backoff retry (max 5 attempts, starting at 1s).

### Dashboard state model

The dashboard is **fully stateless at the process level** — all data lives in a module-level `Map<cluster, Map<namespace/deployment, Observation>>` on `globalThis` (`dashboard/lib/store.ts`). There is no database or external state. Hot-module-reload in Next.js dev mode preserves state via the `globalThis` trick.

The `POST /api/ingest` route (`app/api/ingest/route.ts`) validates the `X-API-Key` header against per-cluster keys from env vars (`FLEETBOARD_API_KEY_<CLUSTER>`), then calls `upsertBatch()`. The main page (`app/page.tsx`) calls `snapshot()` directly at render time — this is a React Server Component with no client-side fetching.

### Key Kubernetes details

- Label `fleetboard.io/enabled=true` on a Deployment to include it
- Annotation `fleetboard.io/container-name` to select a specific container (defaults to `containers[0]`)
- The collector needs `get/list/watch` on `deployments` cluster-wide (ClusterRole provided in the Helm chart)

### Version extraction

- `repo/app:2.4.1` → `2.4.1`
- Digest-only (`@sha256:abc123...`) → `digest:<first12>`
- No tag → `unknown`

### Health classification

- `OK`: `availableReplicas == desiredReplicas`
- `DEGRADED`: available < desired
- `ERROR`: configured container annotation not found
- `UNKNOWN`: fallthrough

Entries are marked stale after `FLEETBOARD_STALE_AFTER_SECONDS` (default 120s) without an update.

## Helm charts

- `collector/helm/fleetboard-collector`
- `dashboard/helm/fleetboard-dashboard`

Both are deployed in `scripts/kind-e2e.sh` via `helm upgrade --install`. Refer to each chart's `values.yaml` for configurable fields.
