#!/usr/bin/env bash
# deploy.sh — Deploy the devops-challenge stack to a Kubernetes cluster.
#
# Usage:
#   ./scripts/deploy.sh <env>                              # env = dev | prod
#   ./scripts/deploy.sh dev --profile=devops-challenge     # use a named AWS profile
#   ./scripts/deploy.sh dev --skip-tf                      # skip terraform (secrets already exist)
#   ./scripts/deploy.sh dev --image-tag=sha-abc1234        # override image tag (CI sets this)
#
# Prerequisites:
#   - AWS credentials configured (AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)
#   - kubectl context pointing to the target cluster
#   - terraform >= 1.5 installed
#   - Images already built & loaded into the cluster (for kind: kind load docker-image)
#
# What it does:
#   1. Terraform: selects workspace, applies secrets to AWS Secrets Manager
#   2. Kubernetes: creates aws-sm-credentials secret for ESO
#   3. Kubernetes: applies kustomize overlay for the target environment
#   4. Waits for all deployments to roll out

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV="${1:-}"
SKIP_TF=false
AWS_PROFILE_ARG=""
IMAGE_TAG=""

# Parse flags
for arg in "$@"; do
  case $arg in
    --skip-tf) SKIP_TF=true ;;
    --profile=*) AWS_PROFILE_ARG="${arg#--profile=}" ;;
    --image-tag=*) IMAGE_TAG="${arg#--image-tag=}" ;;
  esac
done

# Set AWS_PROFILE if provided
if [[ -n "$AWS_PROFILE_ARG" ]]; then
  export AWS_PROFILE="$AWS_PROFILE_ARG"
fi

if [[ -z "$ENV" ]] || [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
  echo "Usage: $0 <dev|prod> [--skip-tf]"
  exit 1
fi

NAMESPACE="devops-challenge"
TF_DIR="$ROOT_DIR/terraform/secrets"
K8S_OVERLAY="$ROOT_DIR/k8s/overlays/$ENV"

echo "=== Deploying [$ENV] environment ==="

# ---------- Step 1: Terraform — create secrets in AWS Secrets Manager ----------
if [[ "$SKIP_TF" == "false" ]]; then
  echo ""
  echo "--- Terraform: provisioning secrets ---"
  cd "$TF_DIR"

  terraform init -input=false

  # Create workspace if it doesn't exist, then select it
  terraform workspace select "$ENV" 2>/dev/null || terraform workspace new "$ENV"

  terraform apply -auto-approve -input=false
  echo "--- Terraform: done ---"
else
  echo "--- Skipping Terraform (--skip-tf) ---"
fi

# ---------- Step 2: Create AWS credentials K8s secret for ESO ----------
echo ""
echo "--- Creating aws-sm-credentials K8s secret for ESO ---"

# Resolve AWS credentials — works with both env vars and AWS_PROFILE
AWS_AK="${AWS_ACCESS_KEY_ID:-$(aws configure get aws_access_key_id 2>/dev/null || true)}"
AWS_SK="${AWS_SECRET_ACCESS_KEY:-$(aws configure get aws_secret_access_key 2>/dev/null || true)}"

if [[ -z "$AWS_AK" ]] || [[ -z "$AWS_SK" ]]; then
  echo "Error: Could not resolve AWS credentials."
  echo "  Set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or AWS_PROFILE."
  exit 1
fi

# Ensure namespace exists
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# Create or update the secret
kubectl create secret generic aws-sm-credentials \
  --namespace "$NAMESPACE" \
  --from-literal=access-key="$AWS_AK" \
  --from-literal=secret-access-key="$AWS_SK" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "--- aws-sm-credentials: done ---"

# ---------- Step 3: Apply Kustomize overlay ----------
echo ""
echo "--- Applying Kustomize overlay: $ENV ---"

if [[ -n "$IMAGE_TAG" ]]; then
  echo "  Overriding image tags to: $IMAGE_TAG"
  # Build kustomize output, override image tags, apply
  kubectl kustomize "$K8S_OVERLAY" \
    | sed -E "s|(image: .+devops-challenge/(api-gateway\|user-service)):.*|\1:${IMAGE_TAG}|g" \
    | kubectl apply -f -
else
  kubectl apply -k "$K8S_OVERLAY"
fi
echo "--- Kustomize: done ---"

# ---------- Step 4: Wait for rollout ----------
echo ""
echo "--- Waiting for deployments to roll out ---"

for DEPLOY in redis user-service api-gateway; do
  echo "  Waiting for $DEPLOY..."
  kubectl rollout status deployment/"$DEPLOY" \
    --namespace "$NAMESPACE" \
    --timeout=120s
done

echo ""
echo "=== Deployment [$ENV] complete ==="
echo ""
echo "To test:"
echo "  kubectl port-forward svc/api-gateway 3000:3000 -n $NAMESPACE"
echo "  curl http://localhost:3000/health"
echo "  curl http://localhost:3000/api/users"
