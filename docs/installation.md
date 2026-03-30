# Installation

FleetBoard ships two Helm charts published to GHCR. Install the dashboard once in a central location, then install a collector in each cluster you want to monitor.

## Prerequisites

- Helm 3+
- `kubectl` configured for each target cluster
- Access to push to (or pull from) the GHCR registry where the charts are published

## Step 1 — Install the dashboard

Pick a cluster to host the dashboard. This is typically a shared platform or ops cluster, but it can be any cluster that is reachable from the clusters running collectors.

Generate a strong random API key for each cluster you plan to monitor:

```bash
openssl rand -hex 32   # run once per cluster
```

Install the dashboard chart:

```bash
helm upgrade --install fleetboard-dashboard \
  oci://ghcr.io/iamnoah1/helm/fleetboard-dashboard \
  --namespace fleetboard-system --create-namespace \
  --set clusters[0]=dev \
  --set clusters[1]=staging \
  --set clusters[2]=prod \
  --set apiKeys.dev=<key-for-dev> \
  --set apiKeys.staging=<key-for-staging> \
  --set apiKeys.prod=<key-for-prod>
```

The `clusters` list controls which columns appear in the UI and in what order. The `apiKeys` map must have one entry per cluster name.

Wait for the pod to be ready:

```bash
kubectl rollout status deployment/fleetboard-dashboard -n fleetboard-system
```

### Accessing the dashboard

By default the dashboard is exposed as a `ClusterIP` service. To access it from outside the cluster, either:

**Port-forward (quick test):**
```bash
kubectl port-forward svc/fleetboard-dashboard-fleetboard-dashboard 8080:80 -n fleetboard-system
# Open http://localhost:8080
```

**Ingress (production):**
```bash
helm upgrade --install fleetboard-dashboard \
  oci://ghcr.io/iamnoah1/helm/fleetboard-dashboard \
  --namespace fleetboard-system \
  ... \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=fleetboard.example.com \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix
```

## Step 2 — Install a collector in each cluster

Repeat this for every cluster you want to monitor. Switch your `kubectl` context to the target cluster first.

```bash
kubectl config use-context <target-cluster-context>
```

Create a secret with the API key for this cluster (use the key you generated for it in Step 1):

```bash
kubectl create secret generic fleetboard-collector-key \
  --from-literal=api-key=<key-for-this-cluster> \
  --namespace fleetboard-system --create-namespace
```

Install the collector chart:

```bash
helm upgrade --install fleetboard-collector \
  oci://ghcr.io/iamnoah1/helm/fleetboard-collector \
  --namespace fleetboard-system \
  --set clusterName=prod \
  --set dashboardUrl=https://fleetboard.example.com \
  --set apiKeySecretName=fleetboard-collector-key \
  --set discoveryMode=namespace \
  --set "namespaceAllowlist={shop,payments,infra}"
```

`clusterName` must exactly match one of the names in `clusters` on the dashboard.

`dashboardUrl` must be reachable from inside the target cluster. If the dashboard is in the same cluster, use the in-cluster service DNS name:

```bash
--set dashboardUrl=http://fleetboard-dashboard-fleetboard-dashboard.fleetboard-system.svc
```

See [Discovery modes](./discovery-modes.md) for the full range of `discoveryMode` options.

## Step 3 — Verify

Check the collector started and is sending data:

```bash
kubectl logs -n fleetboard-system deploy/fleetboard-collector -f
```

A healthy collector emits a `collector_cycle_summary` log line every scrape interval:

```json
{
  "event": "collector_cycle_summary",
  "discoveryMode": "namespace",
  "deploymentsFetched": 8,
  "deploymentsObserved": 8,
  "healthOk": 7,
  "healthDegraded": 1,
  "ingestStatusCode": 200
}
```

Open the dashboard — each cluster column should start populating within one scrape interval (default 30 seconds).

## Upgrading

```bash
# Upgrade dashboard
helm upgrade fleetboard-dashboard \
  oci://ghcr.io/iamnoah1/helm/fleetboard-dashboard \
  --namespace fleetboard-system \
  --reuse-values

# Upgrade a collector (run in the target cluster context)
helm upgrade fleetboard-collector \
  oci://ghcr.io/iamnoah1/helm/fleetboard-collector \
  --namespace fleetboard-system \
  --reuse-values
```

## Uninstalling

```bash
helm uninstall fleetboard-dashboard -n fleetboard-system
helm uninstall fleetboard-collector -n fleetboard-system
kubectl delete namespace fleetboard-system   # if no longer needed
```

## Optional: enable UI authentication

The dashboard supports HTTP Basic Auth. When enabled, browsers prompt for credentials before displaying the matrix. The `/api/ingest` endpoint is unaffected.

```bash
helm upgrade --install fleetboard-dashboard \
  oci://ghcr.io/iamnoah1/helm/fleetboard-dashboard \
  --namespace fleetboard-system \
  ... \
  --set auth.enabled=true \
  --set auth.basicAuthUser=fleetboard \
  --set auth.basicAuthPassword=<strong-password>
```

See [Security](./security.md) for full details.

## Configuration reference

### Dashboard values

| Value | Default | Description |
|---|---|---|
| `clusters` | `[]` | Ordered list of cluster names shown as columns |
| `apiKeys.<cluster>` | — | API key per cluster, must match the collector's key |
| `staleAfterSeconds` | `120` | Seconds before a cell is marked stale |
| `replicaCount` | `1` | Must stay at 1 — state is in-memory |
| `ingress.enabled` | `false` | Enable ingress |
| `ingress.annotations` | `{}` | Ingress annotations (e.g. cert-manager, nginx) |
| `auth.enabled` | `false` | Enable HTTP Basic Auth for the UI |
| `auth.basicAuthUser` | `""` | Username |
| `auth.basicAuthPassword` | `""` | Password — inject via `--set`, do not store in plain values |
| `resources` | `{}` | Pod resource requests/limits |

### Collector values

| Value | Default | Description |
|---|---|---|
| `clusterName` | `dev` | Name reported to the dashboard |
| `dashboardUrl` | — | Base URL of the dashboard |
| `apiKeySecretName` | `fleetboard-collector-key` | Name of the Secret containing the API key |
| `apiKeySecretKey` | `api-key` | Key inside the Secret |
| `discoveryMode` | `label` | `label` · `namespace` · `selector` · `all` |
| `labelSelector` | `""` | Required when `discoveryMode=selector` |
| `namespaceAllowlist` | `[]` | List of namespaces to include |
| `scrapeIntervalMs` | `30000` | Polling interval in milliseconds |
| `resources` | `{}` | Pod resource requests/limits |
