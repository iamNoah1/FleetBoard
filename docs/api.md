# Ingest API

The dashboard exposes a single write endpoint that collectors use to push observations.

This document is relevant if you want to build a custom collector or push data from a source other than the built-in Kubernetes collector.

## `POST /api/ingest`

### Authentication

```
X-API-Key: <cluster-specific-key>
```

The key must match `FLEETBOARD_API_KEY_<CLUSTER>` configured on the dashboard, where `<CLUSTER>` is the uppercased cluster name from the payload.

### Request body

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
      "health": "OK",
      "source": "image",
      "timestamp": "2026-03-28T12:00:00Z"
    }
  ]
}
```

### Fields

**Top-level:**

| Field | Type | Required | Description |
|---|---|---|---|
| `cluster` | string | yes | Must match a cluster name configured on the dashboard |
| `observations` | array | yes | List of deployment observations |

**Per observation:**

| Field | Type | Required | Description |
|---|---|---|---|
| `namespace` | string | yes | Kubernetes namespace |
| `deployment` | string | yes | Deployment name |
| `image` | string | yes | Full image reference (may be empty for non-image sources) |
| `version` | string | yes | Extracted version string shown in the UI |
| `replicasDesired` | integer | yes | `.spec.replicas` |
| `replicasAvailable` | integer | yes | `.status.availableReplicas` |
| `replicasUpdated` | integer | yes | `.status.updatedReplicas` |
| `health` | enum | yes | `OK` · `DEGRADED` · `ERROR` · `UNKNOWN` |
| `source` | enum | no | `image` (default) · `endpoint` · `catalog` · `hybrid` · `unknown` |
| `timestamp` | string | yes | ISO 8601 timestamp of when the observation was taken |
| `error` | string | no | Human-readable error detail, shown in the UI when `health=ERROR` |

### Health values

| Value | Meaning |
|---|---|
| `OK` | Deployment is fully available (`availableReplicas == desiredReplicas`) |
| `DEGRADED` | Deployment is partially available |
| `ERROR` | Deployment has a configuration or collection error |
| `UNKNOWN` | Health could not be determined |

### Source values

`source` describes how the version was obtained. The built-in collector always sends `image`. Custom collectors can use other values to indicate alternative version sources.

| Value | Meaning |
|---|---|
| `image` | Version extracted from the container image tag |
| `endpoint` | Version obtained from a runtime endpoint (e.g. `/version`) |
| `catalog` | Version obtained from a service catalog or registry |
| `hybrid` | Version from a combination of sources |
| `unknown` | Source not specified or not applicable |

### Response

**200 OK**
```json
{
  "cluster": "staging",
  "accepted": 5,
  "skipped": 0
}
```

`accepted` is the number of observations written to the store. `skipped` is the number of observations that failed validation and were ignored (the rest are still accepted).

**400 Bad Request** — malformed JSON or missing required top-level fields

**401 Unauthorized** — missing or incorrect `X-API-Key`

### Behaviour

- Each call **replaces** the latest snapshot for every deployment in the payload. Previous data for deployments not included in the call is not removed — it ages out via the stale threshold.
- Observations with an invalid `timestamp` are skipped individually without failing the whole batch.
- Unknown `source` values are normalised to `unknown`.
