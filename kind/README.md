# FleetBoard kind E2E

This test setup creates a local kind cluster, deploys sample workloads, installs both FleetBoard Helm charts, and verifies that the dashboard shows collected versions.

## Prerequisites

- `docker`
- `kind`
- `kubectl`
- `helm`
- `curl`

## One-command e2e

From the repo root:

```bash
./scripts/kind-e2e.sh
```

What it does:

1. Creates kind cluster (`fleetboard`) if missing
2. Applies test manifests from `kind/manifests`
3. Builds local images:
   - `fleetboard-dashboard:e2e`
   - `fleetboard-collector:e2e`
4. Loads images into kind
5. Installs Helm charts:
   - dashboard release: `fleetboard-dashboard`
   - collector release: `fleetboard-collector`
6. Waits for rollouts
7. Port-forwards dashboard and checks the UI contains:
   - `demo/orders-api`
   - `1.27.0`

## Utility scripts

Create cluster only:

```bash
./scripts/kind-up.sh
```

Delete cluster:

```bash
./scripts/kind-down.sh
```

## Useful env overrides

- `KIND_CLUSTER_NAME`
- `E2E_NAMESPACE`
- `E2E_API_KEY`
- `E2E_LOCAL_PORT`
- `DASHBOARD_IMAGE`
- `COLLECTOR_IMAGE`

Example:

```bash
E2E_LOCAL_PORT=3100 E2E_API_KEY=my-key ./scripts/kind-e2e.sh
```

If repositories are not side-by-side, override source paths:

```bash
DASHBOARD_REPO_DIR=/path/to/fleetboard-dashboard \
COLLECTOR_REPO_DIR=/path/to/fleetboard-collector \
./scripts/kind-e2e.sh
```

In GitHub Actions, use `.github/workflows/kind-e2e.yml` from this repo.

## Inspect runtime state

```bash
kubectl -n fleetboard-system get pods
kubectl -n fleetboard-system logs deploy/fleetboard-collector-fleetboard-collector -f
kubectl -n fleetboard-system get secret fleetboard-collector-key
```
