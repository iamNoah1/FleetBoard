# FleetBoard Collector

FleetBoard Collector is a per-cluster Kubernetes service that discovers Deployments and ships version/health snapshots to FleetBoard Dashboard.

## What it does

- Queries the Kubernetes API for Deployments using a configurable discovery mode
- Optionally selects container via annotation: `fleetboard.io/container-name`
- Extracts version from image tag/digest
- Computes rollout health from replica counts
- Sends snapshots to Dashboard ingest API with API key auth
- Retries ingest with exponential backoff

## Discovery modes

Controlled by `DISCOVERY_MODE`. No changes to existing Deployments are required for most modes.

| Mode | Behaviour |
|---|---|
| `label` *(default)* | Only Deployments with `fleetboard.io/enabled=true` |
| `namespace` | All Deployments in `NAMESPACE_ALLOWLIST` |
| `selector` | Deployments matching `LABEL_SELECTOR` (passed to the k8s API) |
| `all` | All Deployments (filtered by `NAMESPACE_ALLOWLIST` if set) |

`NAMESPACE_ALLOWLIST` is an additional filter that applies in every mode.

## Configuration

Environment variables:

- `CLUSTER_NAME` — required (e.g. `dev`, `staging`, `prod`)
- `DASHBOARD_URL` — required (e.g. `http://fleetboard-dashboard`)
- `API_KEY` — required
- `DISCOVERY_MODE` — `label` | `namespace` | `selector` | `all` (default: `label`)
- `LABEL_SELECTOR` — required when `DISCOVERY_MODE=selector` (e.g. `app.kubernetes.io/managed-by=Helm`)
- `NAMESPACE_ALLOWLIST` — optional, comma-separated (e.g. `shop,payments`)
- `SCRAPE_INTERVAL_MS` — default `30000`
- `SERVICE_VERSION` — optional, included in logs
- `GIT_COMMIT_SHA` — optional, included in logs

## Local development

```bash
npm install
npm run dev
```

Typecheck/build:

```bash
npm run typecheck
npm run build
```

## Version extraction rules

- `repo/app:2.4.1` -> `2.4.1`
- No tag -> `unknown`
- Digest only (`@sha256:...`) -> `digest:<first12>`

## Logging

The collector emits structured JSON logs with stable event names:

- `collector_started`
- `collector_deployment_error`
- `collector_ingest_attempt_failed`
- `collector_cycle_summary`
- `collector_cycle_failed`
- `collector_fatal`

## Helm chart

Chart path: `helm/fleetboard-collector`

Configurable via `values.yaml`:

- `clusterName`
- `dashboardUrl`
- `apiKeySecretName`
- `discoveryMode`
- `labelSelector`
- `scrapeIntervalMs`
- `namespaceAllowlist`
- `image.repository`, `image.tag`

Includes:

- ServiceAccount
- ClusterRole + ClusterRoleBinding (`get/list/watch deployments`)
- Deployment

## Container image

Dockerfile path: `Dockerfile`

Build locally:

```bash
docker build -t fleetboard-collector:local .
```

## GitHub Actions release

Workflow path: `.github/workflows/release-collector.yml`

On push to `main` or a tag `collector-v*`, it:

- Builds and pushes Docker image to GHCR:
  - `ghcr.io/<org-or-user>/fleetboard-collector`
- Packages Helm chart and pushes as OCI artifact to GHCR:
  - `oci://ghcr.io/<org-or-user>/helm`

Requires repository permissions:

- `contents: read`
- `packages: write`

## License

MIT (see `LICENSE`).
