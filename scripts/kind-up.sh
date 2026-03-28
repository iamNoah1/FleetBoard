#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${KIND_CLUSTER_NAME:-fleetboard}"

if ! command -v kind >/dev/null 2>&1; then
  echo "kind not found. Install from https://kind.sigs.k8s.io/"
  exit 1
fi

if kind get clusters | grep -qx "${CLUSTER_NAME}"; then
  echo "kind cluster '${CLUSTER_NAME}' already exists"
  exit 0
fi

kind create cluster --name "${CLUSTER_NAME}"
echo "kind cluster '${CLUSTER_NAME}' is ready"
