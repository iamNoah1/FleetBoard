# FleetBoard Project Status

Last updated: 2026-03-28

## Structure

Monorepo. One GitHub repo, three published artifacts (dashboard image, collector image, two Helm charts).

```
fleetboard/
  dashboard/        Next.js 14 dashboard
  collector/        Node.js Kubernetes collector
  kind/             Local test manifests
  scripts/          kind-up/down/e2e scripts
  docs/             Documentation
  .github/workflows/
    release-dashboard.yml
    release-collector.yml
    e2e.yml
```

## Current implementation state

### dashboard/

- Next.js 14, React Server Components
- In-memory store on `globalThis` (`lib/store.ts`) — no database, single replica only
- `POST /api/ingest` — Zod-validated, per-cluster API key auth, full snapshot replacement per cluster
- Matrix UI with namespace + deployment substring filters
- Stale detection at render time (`FLEETBOARD_STALE_AFTER_SECONDS`, default 120s)
- Stale cells render with amber border, dimmed version, "STALE" badge, "last known: X" note

### collector/

- Polls Kubernetes via `@kubernetes/client-node`, `loadFromDefault()` (kubeconfig locally, ServiceAccount in-cluster)
- Startup probe — fails fast with a clear message if the cluster is unreachable
- Four discovery modes via `DISCOVERY_MODE` env var:
  - `label` (default) — `fleetboard.io/enabled=true` on each Deployment
  - `namespace` — all Deployments in `NAMESPACE_ALLOWLIST`
  - `selector` — Deployments matching `LABEL_SELECTOR`, passed to k8s API server-side
  - `all` — everything, filtered by `NAMESPACE_ALLOWLIST` if set
- `NAMESPACE_ALLOWLIST` applies as a cross-cutting filter in all modes
- Exponential backoff retry on ingest (5 attempts, 1s→30s)
- Structured JSON logs with stable event names

### Helm charts

- `dashboard/helm/fleetboard-dashboard` — secret uses `range` loop (dynamic cluster names)
- `collector/helm/fleetboard-collector` — exposes `discoveryMode`, `labelSelector`, `namespaceAllowlist`

### docs/

- `how-it-works.md` — polling loop, local vs in-cluster auth, state model
- `installation.md` — step-by-step Helm, ingress, upgrade/uninstall
- `local-development.md` — prerequisites, running locally, Helm bridge at end
- `development-workflows.md` — all four workflows (full local → both in cluster)
- `discovery-modes.md` — all four modes with examples
- `security.md` — RBAC, ServiceAccount, API keys, key rotation
- `api.md` — ingest contract for custom collectors

## Known gaps / next work

- Alternate version source adapters (`endpoint`, `catalog`, `hybrid`) not yet implemented — contract already supports them in the ingest API
- No UI authentication (documented as intentional for MVP — restrict at network/ingress level)
- Full kind e2e run not yet verified in this environment (Docker socket required)

## Key design decisions made

- **Monorepo** over 3-repo split — easier for contributors, single issue tracker
- **Full snapshot replacement** in `upsertBatch` — each collector POST replaces all data for that cluster; deleted deployments disappear within one scrape interval
- **Stale ≠ healthy** — stale cells render amber/dimmed, not green, so operators notice
- **Discovery mode as strategy** — `DISCOVERY_MODE` env var, not hardcoded label requirement
- **Kubernetes label domain** `fleetboard.io/` (not `fleetboard.myco/`)
- **Helm secret** uses `range` loop so any cluster name works, not just dev/staging/prod

## How to resume with Claude

Read `CLAUDE.md` and this file. The codebase is clean and typechecks pass on both components.
