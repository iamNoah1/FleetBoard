# Discovery modes

The collector supports four modes for deciding which Deployments to report on, controlled by the `DISCOVERY_MODE` env var. The default is `label`.

No changes to your existing Deployments are required for most modes.

## `namespace` — all Deployments in specific namespaces

The collector reports every Deployment found in the namespaces listed in `NAMESPACE_ALLOWLIST`. Nothing needs to be added to the Deployments themselves.

```bash
DISCOVERY_MODE=namespace
NAMESPACE_ALLOWLIST=shop,payments,infra
```

Use this when your namespaces map cleanly to what you want to monitor (e.g. one namespace per team or service domain).

> `NAMESPACE_ALLOWLIST` is required in `namespace` mode. Without it, the collector would report every Deployment in the cluster.

## `selector` — Deployments matching an existing label

Matches Deployments using a standard Kubernetes label selector. The selector is passed directly to the Kubernetes API, so filtering happens server-side — efficient even in large clusters.

```bash
DISCOVERY_MODE=selector
LABEL_SELECTOR=app.kubernetes.io/managed-by=Helm
```

```bash
DISCOVERY_MODE=selector
LABEL_SELECTOR=environment=production,tier=backend
```

Use this when your Deployments already carry meaningful labels (from Helm, your own conventions, or GitOps tooling) and you want to reuse them rather than add new ones.

The selector syntax is standard Kubernetes — equality (`key=value`, `key!=value`) and set-based (`key in (v1,v2)`, `key notin (v1,v2)`, `key`) expressions are all supported.

## `all` — every Deployment in the cluster

Reports every Deployment the collector can see. Combine with `NAMESPACE_ALLOWLIST` to constrain scope.

```bash
DISCOVERY_MODE=all
NAMESPACE_ALLOWLIST=shop,payments   # optional but recommended
```

Use this for complete visibility, or when you are still exploring what is running in the cluster.

## `label` — explicit opt-in per Deployment *(default)*

Only reports Deployments that carry the label `fleetboard.io/enabled=true`. This is the most selective mode and requires adding a label to each Deployment you want to track.

```yaml
metadata:
  labels:
    fleetboard.io/enabled: "true"
```

Use this when you want precise, per-Deployment control over what appears in the dashboard.

## Container selection (all modes)

In every discovery mode, you can annotate a Deployment to select a specific container to read the image from. By default the first container is used.

```yaml
metadata:
  annotations:
    fleetboard.io/container-name: app
```

If the named container does not exist, the observation is reported with `health: ERROR` and an error message in the dashboard cell.

## `NAMESPACE_ALLOWLIST` as a cross-cutting filter

`NAMESPACE_ALLOWLIST` applies in every discovery mode as an additional filter. In `namespace` mode it defines the selection. In all other modes it narrows it.

```bash
# selector mode: match Helm-managed deployments, but only in shop and payments
DISCOVERY_MODE=selector
LABEL_SELECTOR=app.kubernetes.io/managed-by=Helm
NAMESPACE_ALLOWLIST=shop,payments
```

## Choosing a mode

| Situation | Recommended mode |
|---|---|
| Namespaces map to teams or domains | `namespace` |
| Deployments already have meaningful labels | `selector` |
| Want full visibility, exploring the cluster | `all` |
| Need per-Deployment opt-in control | `label` |
