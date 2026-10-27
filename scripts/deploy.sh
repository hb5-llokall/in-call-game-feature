#!/usr/bin/env bash
# Deploy a release: run migrations once, then roll the Deployment.
#   IMAGE=ghcr.io/hb5-llokall/in-call-game-feature:<sha> ./scripts/deploy.sh
set -euo pipefail

: "${IMAGE:?set IMAGE to the image to deploy, e.g. ghcr.io/hb5-llokall/in-call-game-feature:abc123}"
NAMESPACE=dostt-games
# Unique per release so a re-deploy of the same image doesn't collide with an old Job.
RELEASE="${RELEASE:-$(date +%Y%m%d%H%M%S)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

kubectl apply -f "$ROOT/k8s/namespace.yaml"

echo "==> Running migrations (job dostt-call-games-migrate-$RELEASE)"
IMAGE="$IMAGE" RELEASE="$RELEASE" envsubst '${IMAGE} ${RELEASE}' < "$ROOT/k8s/migrate-job.yaml" | kubectl apply -f -

if ! kubectl -n "$NAMESPACE" wait --for=condition=complete --timeout=600s "job/dostt-call-games-migrate-$RELEASE"; then
  echo "Migration failed; not rolling out. Logs:" >&2
  kubectl -n "$NAMESPACE" logs "job/dostt-call-games-migrate-$RELEASE" >&2 || true
  exit 1
fi

echo "==> Rolling out $IMAGE"
kubectl kustomize "$ROOT/k8s" \
  | sed "s#image: ghcr.io/hb5-llokall/in-call-game-feature:latest#image: $IMAGE#" \
  | kubectl apply -f -
kubectl -n "$NAMESPACE" rollout status deployment/dostt-call-games --timeout=300s
