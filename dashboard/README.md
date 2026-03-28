# FleetBoard Dashboard

FleetBoard Dashboard is a stateless Next.js service that shows deployed image tags and rollout health for labeled Kubernetes Deployments across multiple clusters.

## What it does

- Accepts collector snapshots via `POST /api/ingest`
- Validates per-cluster API keys
- Stores only latest data in memory (`Map<cluster, Map<namespace/deployment, Observation>>`)
- Renders a cluster matrix (`dev|staging|prod` by default)
- Marks stale entries when last update exceeds threshold

## Configuration

Environment variables:

- `FLEETBOARD_CLUSTERS` (default: `dev,staging,prod`)
- `FLEETBOARD_STALE_AFTER_SECONDS` (default: `120`)
- `FLEETBOARD_API_KEY_DEV`
- `FLEETBOARD_API_KEY_STAGING`
- `FLEETBOARD_API_KEY_PROD`

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

## API contract

### `POST /api/ingest`

Header:

- `X-API-Key: <cluster-specific-key>`

Payload:

```json
{
  "cluster": "staging",
  "observations": [
    {
      "namespace": "shop",
      "deployment": "orders-api",
      "image": "ghcr.io/org/orders-api:2.4.1",
      "version": "2.4.1",
      "replicasDesired": 3,
      "replicasAvailable": 3,
      "replicasUpdated": 3,
      "source": "image",
      "health": "OK",
      "timestamp": "2026-02-12T13:10:00Z"
    }
  ]
}
```

Notes:

- `health` supports `OK`, `DEGRADED`, `ERROR`, `UNKNOWN`
- `source` is optional (`image` default). Supported values: `image`, `endpoint`, `catalog`, `hybrid`, `unknown`
- `image` may be empty for non-image sources

## Helm chart

Chart path: `helm/fleetboard-dashboard`

Configurable via `values.yaml`:

- `image.repository`, `image.tag`
- `apiKeys.dev`, `apiKeys.staging`, `apiKeys.prod`
- `clusters`
- `staleAfterSeconds`
- `service.type`
- `ingress.enabled`
- `resources`

## Container image

Dockerfile path: `Dockerfile`

Build locally:

```bash
docker build -t fleetboard-dashboard:local .
```

## GitHub Actions release

Workflow path: `.github/workflows/release.yml`

On push to `main` or a semver tag (`v*`), it:

- Builds and pushes Docker image to GHCR:
  - `ghcr.io/<org-or-user>/fleetboard-dashboard`
- Packages Helm chart and pushes as OCI artifact to GHCR:
  - `oci://ghcr.io/<org-or-user>/helm`

Requires repository permissions:

- `contents: read`
- `packages: write`

## License

MIT (see `LICENSE`).
