#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER_NAME="${KIND_CLUSTER_NAME:-fleetboard}"
NAMESPACE="${E2E_NAMESPACE:-fleetboard-system}"
DASHBOARD_RELEASE="${E2E_DASHBOARD_RELEASE:-fleetboard-dashboard}"
COLLECTOR_RELEASE="${E2E_COLLECTOR_RELEASE:-fleetboard-collector}"
API_KEY="${E2E_API_KEY:-dev-local-key}"
DASHBOARD_IMAGE="${DASHBOARD_IMAGE:-fleetboard-dashboard:e2e}"
COLLECTOR_IMAGE="${COLLECTOR_IMAGE:-fleetboard-collector:e2e}"
WAIT_TIMEOUT="${E2E_WAIT_TIMEOUT:-180s}"
DASHBOARD_REPO_DIR="${DASHBOARD_REPO_DIR:-${ROOT_DIR}/dashboard}"
COLLECTOR_REPO_DIR="${COLLECTOR_REPO_DIR:-${ROOT_DIR}/collector}"

ensure_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 not found in PATH"
    exit 1
  fi
}

wait_for_rollout() {
  local deployment_name="$1"
  kubectl -n "${NAMESPACE}" rollout status "deployment/${deployment_name}" --timeout="${WAIT_TIMEOUT}"
}

ensure_command docker
ensure_command helm
ensure_command kind
ensure_command kubectl
ensure_command curl

if [ ! -d "${DASHBOARD_REPO_DIR}" ]; then
  echo "dashboard repo not found: ${DASHBOARD_REPO_DIR}"
  exit 1
fi
if [ ! -d "${COLLECTOR_REPO_DIR}" ]; then
  echo "collector repo not found: ${COLLECTOR_REPO_DIR}"
  exit 1
fi

if ! kind get clusters | grep -qx "${CLUSTER_NAME}"; then
  "${ROOT_DIR}/scripts/kind-up.sh"
fi

kubectl config use-context "kind-${CLUSTER_NAME}" >/dev/null
kubectl create namespace "${NAMESPACE}" >/dev/null 2>&1 || true

kubectl apply -f "${ROOT_DIR}/kind/manifests/demo-namespace.yaml"
kubectl apply -f "${ROOT_DIR}/kind/manifests/sample-deployments.yaml"

echo "Building local images..."
docker build -t "${DASHBOARD_IMAGE}" "${DASHBOARD_REPO_DIR}"
docker build -t "${COLLECTOR_IMAGE}" "${COLLECTOR_REPO_DIR}"

echo "Loading images into kind..."
kind load docker-image --name "${CLUSTER_NAME}" "${DASHBOARD_IMAGE}"
kind load docker-image --name "${CLUSTER_NAME}" "${COLLECTOR_IMAGE}"

kubectl -n "${NAMESPACE}" create secret generic fleetboard-collector-key \
  --from-literal=api-key="${API_KEY}" \
  --dry-run=client -o yaml | kubectl apply -f -

DASHBOARD_REPO="${DASHBOARD_IMAGE%:*}"
DASHBOARD_TAG="${DASHBOARD_IMAGE##*:}"
COLLECTOR_REPO="${COLLECTOR_IMAGE%:*}"
COLLECTOR_TAG="${COLLECTOR_IMAGE##*:}"

helm upgrade --install "${DASHBOARD_RELEASE}" \
  "${DASHBOARD_REPO_DIR}/helm/fleetboard-dashboard" \
  --namespace "${NAMESPACE}" \
  --set image.repository="${DASHBOARD_REPO}" \
  --set image.tag="${DASHBOARD_TAG}" \
  --set image.pullPolicy=IfNotPresent \
  --set apiKeys.dev="${API_KEY}" \
  --set apiKeys.staging=dummy \
  --set apiKeys.prod=dummy \
  --set clusters[0]=dev

helm upgrade --install "${COLLECTOR_RELEASE}" \
  "${COLLECTOR_REPO_DIR}/helm/fleetboard-collector" \
  --namespace "${NAMESPACE}" \
  --set image.repository="${COLLECTOR_REPO}" \
  --set image.tag="${COLLECTOR_TAG}" \
  --set image.pullPolicy=IfNotPresent \
  --set clusterName=dev \
  --set dashboardUrl="http://${DASHBOARD_RELEASE}-fleetboard-dashboard" \
  --set scrapeIntervalMs=5000 \
  --set namespaceAllowlist[0]=demo \
  --set apiKeySecretName=fleetboard-collector-key \
  --set apiKeySecretKey=api-key

wait_for_rollout "${DASHBOARD_RELEASE}-fleetboard-dashboard"
wait_for_rollout "${COLLECTOR_RELEASE}-fleetboard-collector"

DASHBOARD_POD_IP=$(kubectl get pod -n "${NAMESPACE}" \
  -l "app.kubernetes.io/instance=${DASHBOARD_RELEASE}" \
  -o jsonpath='{.items[0].status.podIP}')

echo "Running smoke check against dashboard (pod IP: ${DASHBOARD_POD_IP})..."
HTML=""
for i in $(seq 1 20); do
  HTML="$(docker exec "${CLUSTER_NAME}-control-plane" \
    curl -fsS "http://${DASHBOARD_POD_IP}:3000/" 2>/dev/null)"
  if [[ "${HTML}" == *"demo/orders-api"* ]]; then
    break
  fi
  echo "  attempt ${i}/20 — waiting for collector data, retrying in 3s..."
  sleep 3
  HTML=""
done

if [[ -z "${HTML}" ]]; then
  echo "Smoke check failed: dashboard did not respond after retries"
  echo "--- pod status ---"
  kubectl get pods -n "${NAMESPACE}"
  echo "--- dashboard pod logs ---"
  kubectl logs -n "${NAMESPACE}" -l "app.kubernetes.io/instance=${DASHBOARD_RELEASE}" --tail=50 || true
  exit 1
fi
if [[ "${HTML}" != *"demo/orders-api"* ]]; then
  echo "Smoke check failed: demo/orders-api not found in dashboard output"
  exit 1
fi
if [[ "${HTML}" != *"1.27.0"* ]]; then
  echo "Smoke check failed: expected image version 1.27.0 not found"
  exit 1
fi

echo "Success: FleetBoard is running and collecting deployment versions."
echo "Collector logs: kubectl -n ${NAMESPACE} logs deploy/${COLLECTOR_RELEASE}-fleetboard-collector -f"
