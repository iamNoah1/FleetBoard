# Development workflows

There are several ways to run FleetBoard depending on what you are working on. This guide covers all of them from most local to most production-like.

---

## Workflow 1 — Everything local (fastest iteration)

**When to use:** Developing either the dashboard or collector. No Docker or cluster setup needed beyond having `kubectl` pointing at a cluster.

```
your machine
├── dashboard   (npm run dev → localhost:3000)
└── collector   (npm run dev → reads kubeconfig)
```

```bash
# Terminal 1 — dashboard
cd dashboard && npm install
FLEETBOARD_CLUSTERS=dev FLEETBOARD_API_KEY_DEV=localkey npm run dev

# Terminal 2 — collector
cd collector && npm install
CLUSTER_NAME=dev \
DASHBOARD_URL=http://localhost:3000 \
API_KEY=localkey \
DISCOVERY_MODE=namespace \
NAMESPACE_ALLOWLIST=demo \
SCRAPE_INTERVAL_MS=5000 \
npm run dev
```

→ See [Local development](./local-development.md) for prerequisites and troubleshooting.

---

## Workflow 2 — Local dashboard, collector in cluster

**When to use:** You are working on the dashboard and want a real collector running in a cluster pushing live data at it. Or you want to test the collector running as an actual pod (real RBAC, real ServiceAccount) while still iterating on the dashboard quickly.

```
your machine
└── dashboard   (npm run dev → localhost:3000)

kind cluster (or any cluster)
└── collector pod  (Helm) → pushes to host.docker.internal:3000
```

### Important: reaching your local dashboard from inside the cluster

A pod inside the cluster cannot use `localhost` to reach your machine — `localhost` inside a pod refers to the pod itself. Use `host.docker.internal` instead, which Docker and kind map to your host machine on Mac and Windows.

On Linux, use the Docker bridge gateway IP instead (usually `172.17.0.1`):
```bash
ip route show default | awk '{print $3}'   # find the gateway IP
```

### Steps

**1. Start the dashboard locally:**

```bash
cd dashboard && npm install
FLEETBOARD_CLUSTERS=dev FLEETBOARD_API_KEY_DEV=localkey npm run dev
```

**2. Make sure you have a kind cluster running:**

```bash
./scripts/kind-up.sh
kubectl apply -f kind/manifests/demo-namespace.yaml
kubectl apply -f kind/manifests/sample-deployments.yaml
```

**3. Build the collector image and load it into kind:**

```bash
docker build -t fleetboard-collector:dev ./collector
kind load docker-image fleetboard-collector:dev --name fleetboard
```

**4. Create the API key secret:**

```bash
kubectl create namespace fleetboard-system --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic fleetboard-collector-key \
  --from-literal=api-key=localkey \
  --namespace fleetboard-system \
  --dry-run=client -o yaml | kubectl apply -f -
```

**5. Deploy the collector via Helm, pointing it at your local dashboard:**

```bash
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

`image.pullPolicy=Never` tells Kubernetes to use the locally loaded image rather than trying to pull from a registry.

**6. Check the collector logs:**

```bash
kubectl logs -n fleetboard-system deploy/fleetboard-collector -f
```

You should see `collector_cycle_summary` log lines, and the dashboard at `http://localhost:3000` will populate.

**To redeploy the collector after code changes:**

```bash
docker build -t fleetboard-collector:dev ./collector
kind load docker-image fleetboard-collector:dev --name fleetboard
kubectl rollout restart deployment/fleetboard-collector -n fleetboard-system
```

---

## Workflow 3 — Both in cluster with local images

**When to use:** Testing the full stack end-to-end in a real cluster environment before shipping. Both components run as pods with real networking between them.

```
kind cluster
├── dashboard pod  (Helm, local image)
└── collector pod  (Helm, local image) → pushes to dashboard Service
```

### Steps

**1. Make sure you have a kind cluster:**

```bash
./scripts/kind-up.sh
kubectl apply -f kind/manifests/demo-namespace.yaml
kubectl apply -f kind/manifests/sample-deployments.yaml
```

**2. Build both images and load them into kind:**

```bash
docker build -t fleetboard-dashboard:dev ./dashboard
docker build -t fleetboard-collector:dev ./collector
kind load docker-image fleetboard-dashboard:dev --name fleetboard
kind load docker-image fleetboard-collector:dev --name fleetboard
```

**3. Create the namespace and API key secret:**

```bash
kubectl create namespace fleetboard-system --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic fleetboard-collector-key \
  --from-literal=api-key=localkey \
  --namespace fleetboard-system \
  --dry-run=client -o yaml | kubectl apply -f -
```

**4. Deploy the dashboard:**

```bash
helm upgrade --install fleetboard-dashboard ./dashboard/helm/fleetboard-dashboard \
  --namespace fleetboard-system \
  --set image.repository=fleetboard-dashboard \
  --set image.tag=dev \
  --set image.pullPolicy=Never \
  --set clusters[0]=dev \
  --set apiKeys.dev=localkey
```

**5. Deploy the collector:**

The collector needs to reach the dashboard via the Kubernetes Service DNS name. The default Service name follows the pattern `<release-name>-fleetboard-dashboard`.

```bash
helm upgrade --install fleetboard-collector ./collector/helm/fleetboard-collector \
  --namespace fleetboard-system \
  --set image.repository=fleetboard-collector \
  --set image.tag=dev \
  --set image.pullPolicy=Never \
  --set clusterName=dev \
  --set dashboardUrl=http://fleetboard-dashboard-fleetboard-dashboard.fleetboard-system.svc \
  --set apiKeySecretName=fleetboard-collector-key \
  --set discoveryMode=namespace \
  --set "namespaceAllowlist={demo}"
```

**6. Open the dashboard:**

```bash
kubectl port-forward svc/fleetboard-dashboard-fleetboard-dashboard 8080:80 \
  -n fleetboard-system
# Open http://localhost:8080
```

**To redeploy after code changes:**

```bash
# Rebuild and reload whichever image changed
docker build -t fleetboard-dashboard:dev ./dashboard
kind load docker-image fleetboard-dashboard:dev --name fleetboard
kubectl rollout restart deployment/fleetboard-dashboard-fleetboard-dashboard -n fleetboard-system

# or for the collector:
docker build -t fleetboard-collector:dev ./collector
kind load docker-image fleetboard-collector:dev --name fleetboard
kubectl rollout restart deployment/fleetboard-collector-fleetboard-collector -n fleetboard-system
```

### Automated version of this workflow

The `kind-e2e.sh` script does all of the above in one command and adds a smoke check at the end:

```bash
./scripts/kind-e2e.sh
```

Use the manual steps above when you want more control (e.g. keeping the cluster alive between changes, checking logs, experimenting with values).

---

## Workflow 4 — Both in cluster with released images

**When to use:** Deploying a released version to a real cluster (staging, prod, or a shared dev cluster). No local building required.

```bash
# Dashboard
helm upgrade --install fleetboard-dashboard \
  oci://ghcr.io/YOUR_ORG/helm/fleetboard-dashboard \
  --namespace fleetboard-system --create-namespace \
  --set clusters[0]=dev \
  --set apiKeys.dev=<key>

# Collector (after creating the API key secret)
helm upgrade --install fleetboard-collector \
  oci://ghcr.io/YOUR_ORG/helm/fleetboard-collector \
  --namespace fleetboard-system \
  --set clusterName=dev \
  --set dashboardUrl=https://fleetboard.example.com \
  --set apiKeySecretName=fleetboard-collector-key \
  --set discoveryMode=namespace \
  --set "namespaceAllowlist={shop,payments}"
```

→ See [Installation](./installation.md) for the full step-by-step guide.

---

## Checking what's running

Regardless of workflow, these commands are useful:

```bash
# Collector logs (what is it seeing and sending?)
kubectl logs -n fleetboard-system deploy/fleetboard-collector -f

# Dashboard logs (what is it receiving?)
kubectl logs -n fleetboard-system deploy/fleetboard-dashboard-fleetboard-dashboard -f

# All pods in the namespace
kubectl get pods -n fleetboard-system

# Collector RBAC — confirm the ServiceAccount has the right permissions
kubectl auth can-i list deployments \
  --as=system:serviceaccount:fleetboard-system:fleetboard-collector-fleetboard-collector \
  --all-namespaces
```

## Linting Helm charts

Before shipping chart changes:

```bash
helm lint ./dashboard/helm/fleetboard-dashboard
helm lint ./collector/helm/fleetboard-collector
```

## Tearing down the kind cluster

```bash
./scripts/kind-down.sh
```
