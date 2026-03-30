# Local development

Run the dashboard and collector directly on your machine — no Docker, no Helm required.

## Prerequisites

- **Node.js 20+**
- **A running Kubernetes cluster** accessible via `kubectl`

The collector reads your active kubeconfig context. Verify it is reachable before starting:

```bash
kubectl cluster-info
```

If you do not have a cluster, start a local one with [kind](https://kind.sigs.k8s.io/):

```bash
# Install kind first: https://kind.sigs.k8s.io/docs/user/quick-start/#installation
./scripts/kind-up.sh
```

Then apply some sample workloads so the collector has something to report:

```bash
kubectl apply -f kind/manifests/demo-namespace.yaml
kubectl apply -f kind/manifests/sample-deployments.yaml
```

## Running the dashboard

```bash
cd dashboard
npm install
FLEETBOARD_CLUSTERS=dev \
FLEETBOARD_API_KEY_DEV=localkey \
npm run dev
```

The dashboard is available at `http://localhost:3000`.

Authentication is automatically disabled when `FLEETBOARD_BASIC_AUTH_USER` and `FLEETBOARD_BASIC_AUTH_PASSWORD` are not set, so local development requires no auth configuration.

Add more cluster names to `FLEETBOARD_CLUSTERS` as you bring up more collectors:

```bash
FLEETBOARD_CLUSTERS=dev,staging \
FLEETBOARD_API_KEY_DEV=localkey \
FLEETBOARD_API_KEY_STAGING=otherkey \
npm run dev
```

## Running the collector

Open a second terminal. The collector uses your current `kubectl` context automatically.

```bash
cd collector
npm install
CLUSTER_NAME=dev \
DASHBOARD_URL=http://localhost:3000 \
API_KEY=localkey \
DISCOVERY_MODE=namespace \
NAMESPACE_ALLOWLIST=demo \
npm run dev
```

`CLUSTER_NAME` must match one of the names in `FLEETBOARD_CLUSTERS` on the dashboard, and `API_KEY` must match the corresponding `FLEETBOARD_API_KEY_<CLUSTER>`.

Data appears in the dashboard within one scrape interval. Set `SCRAPE_INTERVAL_MS=5000` to speed this up during development:

```bash
CLUSTER_NAME=dev \
DASHBOARD_URL=http://localhost:3000 \
API_KEY=localkey \
DISCOVERY_MODE=namespace \
NAMESPACE_ALLOWLIST=demo \
SCRAPE_INTERVAL_MS=5000 \
npm run dev
```

## Watching multiple clusters simultaneously

Each collector instance watches one cluster — the one your active kubeconfig context points to. To watch a second cluster, open a third terminal and run another collector instance pointed at a different context:

```bash
# Terminal 3 — collector for a second cluster
KUBECONFIG=~/.kube/config-staging \
CLUSTER_NAME=staging \
DASHBOARD_URL=http://localhost:3000 \
API_KEY=otherkey \
DISCOVERY_MODE=namespace \
NAMESPACE_ALLOWLIST=shop \
npm run dev
```

The dashboard will show both clusters as columns as soon as data arrives.

## Common errors

**`Cannot connect to the Kubernetes API server`**

The collector could not reach the cluster. Check:

```bash
kubectl cluster-info          # is the cluster running?
kubectl config current-context  # is this the right context?
```

If you are using kind, the cluster may not be running. Start it with `./scripts/kind-up.sh`.

**`Unauthorized` from the dashboard**

The `API_KEY` on the collector does not match `FLEETBOARD_API_KEY_<CLUSTER>` on the dashboard. They must be identical strings.

**`CLUSTER_NAME` does not appear in the dashboard columns**

The cluster name the collector reports must be listed in `FLEETBOARD_CLUSTERS` on the dashboard. Add it and restart the dashboard process.

## Typechecking

```bash
cd dashboard && npm run typecheck
cd collector && npm run typecheck
```

## Automated e2e test

To run the full smoke test (requires Docker, kind, Helm, kubectl):

```bash
./scripts/kind-e2e.sh
```

This builds both images, deploys them into a kind cluster via Helm, and verifies the dashboard shows expected data. Run this before submitting a PR.

## Next step — deploying into a cluster with Helm

Running locally with `npm run dev` is convenient for development, but at some point you will want to deploy the collector (or both components) as proper pods into a cluster — with real RBAC, real ServiceAccount tokens, and the full Helm chart configuration.

The quickest way to try this with local changes is to build a Docker image and deploy it using the local Helm chart:

```bash
# Build the collector image
docker build -t fleetboard-collector:dev ./collector

# Load it into your kind cluster (skip this if using a remote cluster with a registry)
kind load docker-image fleetboard-collector:dev --name fleetboard

# Deploy via the local Helm chart
kubectl create namespace fleetboard-system --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic fleetboard-collector-key \
  --from-literal=api-key=localkey \
  --namespace fleetboard-system --dry-run=client -o yaml | kubectl apply -f -

helm upgrade --install fleetboard-collector ./collector/helm/fleetboard-collector \
  --namespace fleetboard-system \
  --set image.repository=fleetboard-collector \
  --set image.tag=dev \
  --set image.pullPolicy=Never \
  --set clusterName=dev \
  --set dashboardUrl=http://host.docker.internal:3000 \
  --set apiKeySecretName=fleetboard-collector-key \
  --set discoveryMode=namespace \
  --set "namespaceAllowlist={demo}"
```

The dashboard can keep running locally on `http://localhost:3000` — `host.docker.internal` is how pods inside the cluster reach your machine.

For deploying both components into a cluster, or deploying from published Helm charts on GHCR, see the [Installation guide](./installation.md).
