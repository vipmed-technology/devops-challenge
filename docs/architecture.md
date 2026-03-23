# Architecture Decisions

## System Architecture

This is a small application with three main pieces:

- `api-gateway` exposes public HTTP endpoints on port `3000`
- `user-service` handles user CRUD on port `3001`
- `redis` stores user data on port `6379`

Traffic flow:

1. Client requests hit `api-gateway`
2. `api-gateway` proxies user operations to `user-service`
3. `user-service` reads and writes user data in Redis

NetworkPolicies restrict the intended east-west traffic path so only the gateway can call the user service and only the user service can talk to Redis.

## Your Decisions

### Docker

I used `node:20-alpine` with a multi-stage build for both services.

Why:

- it keeps the images small
- it is simple to explain
- it is a reasonable trade-off for a coding challenge

The final containers run as a non-root user and only include production dependencies plus the application source.

If I had more time to harden this, I would probably look at a distroless runtime image.

### Kubernetes

I used a reusable `base` plus `dev` and `prod` overlays with Kustomize.

The base contains:

- Deployments for the Node.js services
- a StatefulSet for Redis
- Services
- ConfigMap
- Secret
- HPA
- NetworkPolicies

The overlays mainly adjust:

- namespaces
- replica counts
- resource sizing
- image references
- dev vs prod secret values

For probes, I kept it simple:

- `/health/live` for liveness
- `/health/ready` for readiness

Readiness depends on real downstream dependencies, because I wanted Kubernetes to stop sending traffic when the app is technically running but not actually usable.

### CI/CD

The pipeline is branch-based:

- `develop` deploys to `dev`
- `main` deploys to `prod`

It runs:

- dependency install
- lint
- tests
- image build and push
- deploy with Kustomize

I used immutable SHA-based image tags because they make rollback and incident review much easier than relying on `latest`.

### Config and Secrets

I separated non-sensitive settings from sensitive ones:

- ConfigMap for ports, URLs, log level, and metric prefixes
- Secret for `REDIS_PASSWORD`

For a real production setup, I would not keep long-lived secrets directly in Kubernetes as the source of truth. I would use something like AWS Secrets Manager, GCP Secret Manager, or Azure Key Vault together with External Secrets Operator or a CSI-based secret integration.

### Monitoring

I instrumented both services with:

- `/metrics`
- structured JSON logs
- request counters
- request latency histograms

I decided to document the monitoring approach instead of installing a full Prometheus and Grafana stack in the repo. For this exercise, that felt more useful than adding a lot of extra manifests just to check the box.

## Trade-offs and Assumptions

- I assumed the deployment target is an existing Kubernetes cluster and that access is provided to GitHub Actions through environment secrets.
- I assumed GHCR is the image registry.
- I kept Redis as a single-replica StatefulSet because full Redis high availability felt outside the scope of the challenge.

## Security Notes

- Containers run as non-root
- privilege escalation is disabled
- capabilities are dropped
- secrets are separated from normal config
- east-west traffic is restricted with NetworkPolicies
- CI uses immutable image tags

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
