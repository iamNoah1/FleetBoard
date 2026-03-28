# FleetBoard

FleetBoard shows which version of each Kubernetes Deployment is running across your clusters — and whether the rollout is healthy.

No database. No agents to babysit. One central dashboard, one small collector per cluster.

```
┌──────────────┬──────────┬─────────┬──────────┐
│ Deployment   │ dev      │ staging │ prod     │
├──────────────┼──────────┼─────────┼──────────┤
│ demo/api     │ 2.4.1 OK │ 2.4.0   │ 2.3.9    │
│ demo/worker  │ 1.0.3 OK │ 1.0.3   │ MISSING  │
│ demo/gateway │ DEGRADED │ 1.1.2   │ 1.1.2 OK │
└──────────────┴──────────┴─────────┴──────────┘
```

## How it works

Each cluster runs a **collector** that queries the Kubernetes API and pushes version/health snapshots to the central **dashboard** every 30 seconds. The dashboard holds all data in memory and renders a live matrix.

→ [How it works in detail](./docs/how-it-works.md)

## Quick start

**Requirements:** Node.js 20+ and a running Kubernetes cluster reachable via `kubectl`.

No cluster yet? Start a local one:
```bash
./scripts/kind-up.sh
kubectl apply -f kind/manifests/demo-namespace.yaml
kubectl apply -f kind/manifests/sample-deployments.yaml
```

Then run the stack:

```bash
# Terminal 1 — dashboard
cd dashboard && npm install
FLEETBOARD_CLUSTERS=dev FLEETBOARD_API_KEY_DEV=localkey npm run dev

# Terminal 2 — collector (uses your current kubectl context)
cd collector && npm install
CLUSTER_NAME=dev DASHBOARD_URL=http://localhost:3000 API_KEY=localkey \
DISCOVERY_MODE=namespace NAMESPACE_ALLOWLIST=demo npm run dev
```

Open `http://localhost:3000`.

→ [Full local setup guide](./docs/local-development.md)

**Automated smoke test** (requires Docker, kind, Helm, kubectl):

```bash
./scripts/kind-e2e.sh
```

## Installation (Helm)

```bash
# Dashboard — install once in a central cluster
helm upgrade --install fleetboard-dashboard \
  oci://ghcr.io/YOUR_ORG/helm/fleetboard-dashboard \
  --namespace fleetboard-system --create-namespace \
  --set clusters[0]=dev --set clusters[1]=staging --set clusters[2]=prod \
  --set apiKeys.dev=<key> --set apiKeys.staging=<key> --set apiKeys.prod=<key>

# Collector — install in each cluster you want to monitor
helm upgrade --install fleetboard-collector \
  oci://ghcr.io/YOUR_ORG/helm/fleetboard-collector \
  --namespace fleetboard-system \
  --set clusterName=prod \
  --set dashboardUrl=https://fleetboard.example.com \
  --set apiKeySecretName=fleetboard-collector-key \
  --set discoveryMode=namespace \
  --set "namespaceAllowlist={shop,payments,infra}"
```

→ [Step-by-step installation guide](./docs/installation.md)

## Discovery modes

The collector does not require any changes to your existing Deployments:

| Mode | What it watches |
|---|---|
| `namespace` | All Deployments in `NAMESPACE_ALLOWLIST` |
| `selector` | Deployments matching a label selector (e.g. `app.kubernetes.io/managed-by=Helm`) |
| `all` | Every Deployment (filtered by `NAMESPACE_ALLOWLIST` if set) |
| `label` *(default)* | Only Deployments with `fleetboard.io/enabled=true` |

→ [Discovery modes in detail](./docs/discovery-modes.md)

## Documentation

| | |
|---|---|
| [How it works](./docs/how-it-works.md) | Polling loop, local vs in-cluster auth, in-memory state |
| [Development workflows](./docs/development-workflows.md) | All ways to run the stack: fully local, mixed, fully in-cluster |
| [Installation](./docs/installation.md) | Step-by-step Helm deployment, ingress, upgrading |
| [Local development](./docs/local-development.md) | Prerequisites, running locally, multiple clusters |
| [Discovery modes](./docs/discovery-modes.md) | All four modes with examples |
| [Security](./docs/security.md) | RBAC, ServiceAccount, API key authentication |
| [API](./docs/api.md) | Ingest contract for custom collectors |

## Releasing

Images and Helm charts are published to GHCR on push to `main` and on version tags.

| Component | Tag |
|---|---|
| Dashboard | `dashboard-v1.2.3` |
| Collector | `collector-v1.2.3` |

Both components release independently.

## License

MIT
