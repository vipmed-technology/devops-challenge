# Architecture Decisions

## System Architecture

This solution deploys three workloads inside Kubernetes:

- `api-gateway` exposes public HTTP endpoints on port `3000`
- `user-service` handles user CRUD on port `3001`
- `redis` stores user data on port `6379`

Traffic flow:

1. Client requests hit `api-gateway`
2. `api-gateway` proxies user operations to `user-service`
3. `user-service` reads and writes user data in Redis

NetworkPolicies restrict the intended east-west traffic path so only the gateway can call the user service and only the user service can talk to Redis.

## Your Decisions

### Docker Strategy

- Base image choice: `node:20-alpine`
- Multi-stage build approach: separate dependency install and runtime stages
- Security considerations: non-root runtime user, reduced image contents, no build toolchain in final stage
- Layer optimization: copy `package*.json` first, install prod deps only, then copy `src`

Trade-off:

- Alpine is small and good for this challenge, but in some production workloads I would consider distroless Node images for a tighter runtime surface area.

### Kubernetes Design

- Namespace strategy: separate `devops-challenge-dev` and `devops-challenge-prod` overlays
- Resource allocation rationale: conservative defaults for dev and moderate production limits to avoid noisy-neighbor behavior
- Health check configuration:
  - Liveness uses `/health/live`
  - Readiness uses `/health/ready`
  - Readiness depends on downstream dependencies so traffic is only sent to healthy pods
- Scaling strategy: HPA on CPU utilization for both stateless services

Redis is modeled as a `StatefulSet` because it represents state, even though this challenge uses a single replica.

### CI/CD Pipeline

- Pipeline stages: test, build-and-push, deploy
- Deployment strategy: branch-based deployment with Kustomize overlays
- Rollback approach: use immutable SHA image tags so rollback can target a known image version
- Secret management: GitHub Actions secrets for registry and kubeconfig, Kubernetes Secret for app runtime secret

### Environment & Secrets Management

- Non-sensitive configuration is stored in ConfigMaps
- Sensitive values such as `REDIS_PASSWORD` are stored in Secrets
- Dev and prod environments use separate overlays for replica counts, resources, and image references

How I would manage secrets in production:

- Source secrets from AWS Secrets Manager, GCP Secret Manager, or Azure Key Vault
- Sync them into Kubernetes via External Secrets Operator or CSI Secret Store Driver
- Use workload identity instead of static cloud credentials
- Rotate secrets automatically and avoid committing secret values into Git

### Monitoring Strategy

- Metrics collected: default Node.js process metrics plus HTTP request counters and latency histograms
- Logging format: structured JSON with request context
- Alerting rules: error rate, latency, readiness failures, restart spikes, and Redis dependency health

## Trade-offs & Assumptions

1. Trade-off:
   - Decision: Documented monitoring strategy instead of shipping a full Prometheus/Grafana deployment
   - Rationale: It keeps the repository smaller and focuses on application instrumentation plus operational reasoning
   - Alternative considered: install kube-prometheus-stack manifests

2. Assumption:
   - The CI pipeline targets an existing Kubernetes cluster and receives kubeconfig via GitHub environment secrets

3. Assumption:
   - GitHub Container Registry is the chosen image registry

## Security Considerations

- Containers run as non-root users
- App config and secrets are separated
- NetworkPolicies restrict service-to-service access
- Containers drop Linux capabilities and disable privilege escalation
- Images are tagged immutably in CI with commit SHA tags
- Secrets are not hardcoded into application source

## What I Would Improve With More Time

1. Add PodDisruptionBudgets and anti-affinity rules
2. Add Trivy image scanning and dependency scanning to CI
3. Add OpenTelemetry traces between gateway and user service

## Time Spent

Approximate effort for this implementation:

| Task | Time |
|------|------|
| Part 1: Docker | 1.5h |
| Part 2: Kubernetes | 3h |
| Part 3: CI/CD | 1.5h |
| Part 4: Monitoring | 1.5h |
| Part 5: Troubleshooting | 1h |
| Documentation | 1h |
| Total | 9.5h |
