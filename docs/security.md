# Security

## Collector — Kubernetes RBAC

The collector needs to read Deployments from the Kubernetes API. When deployed via Helm, it runs under a dedicated ServiceAccount with the minimum permissions required.

The Helm chart creates:

- A **ServiceAccount** for the collector pod
- A **ClusterRole** with exactly these rules:
  ```yaml
  rules:
    - apiGroups: ["apps"]
      resources: ["deployments"]
      verbs: ["get", "list", "watch"]
  ```
- A **ClusterRoleBinding** that grants the ClusterRole to the ServiceAccount

The collector cannot create, update, or delete any resource. It has no access to Secrets, Pods, ConfigMaps, Nodes, or any other resource type.

### Why ClusterRole and not Role

A `Role` is namespace-scoped. Because the collector watches Deployments across all namespaces (or a filtered subset), it needs cluster-wide read access. The namespace filtering configured via `NAMESPACE_ALLOWLIST` or `DISCOVERY_MODE` happens in the collector code — it is not enforced at the RBAC level.

If you want RBAC-level namespace restriction, you can disable the default ClusterRole in the Helm values and create your own namespace-scoped `Role` and `RoleBinding` for each namespace the collector should access.

### Running locally

When running the collector locally with `npm run dev`, it uses your active kubeconfig context and authenticates as whoever that context identifies (your personal user, a CI service account, etc.). It needs the same `get/list/watch` on `deployments` to function.

## Dashboard — API key authentication

Each collector authenticates to the dashboard's ingest endpoint using a per-cluster API key sent in the `X-API-Key` request header.

- Keys are configured on the dashboard as environment variables: `FLEETBOARD_API_KEY_<CLUSTER>`
- The collector receives its key from a Kubernetes Secret (via `secretKeyRef` in the Helm chart — never in plaintext in the Deployment spec)
- The dashboard validates the key against the expected value for the cluster name in the payload — a key for `dev` cannot be used to ingest data for `prod`
- If the key is missing or wrong, the dashboard returns `401` and the collector logs the failure

### Key rotation

To rotate a key:
1. Generate a new key
2. Update the dashboard: `helm upgrade ... --set apiKeys.<cluster>=<new-key>`
3. Update the collector secret: `kubectl create secret generic fleetboard-collector-key --from-literal=api-key=<new-key> --dry-run=client -o yaml | kubectl apply -f -`
4. Restart the collector pod to pick up the new secret value

## Dashboard — no UI authentication

The dashboard UI has no authentication in the current version. Anyone who can reach the dashboard URL can see the deployment matrix. For production use, restrict access at the network or ingress level (IP allowlist, VPN, internal-only ingress, etc.).
