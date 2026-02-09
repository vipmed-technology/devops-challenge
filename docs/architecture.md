# Architecture Documentation

## System Architecture

Draw or describe the architecture of your deployment.

## Your Decisions
- GitOps tools like ArgoCD/Flux were not implemented due to time constraints and scope prioritization. The focus was on delivering a working CI/CD pipeline, core Kubernetes manifests, and observability first. GitOps would be a natural next step once the baseline is stable.
- Decision: only GitHub commit status is used for deployment notifications in this iteration.
### Docker Strategy

- Base image choice: `node:20-alpine` means the container already has Node.js 20 installed and is smaller than full Linux images, so builds download less and run faster.
- Multi-stage build approach: first stage installs dependencies; second stage copies only what the app needs to run (`node_modules` + `src`). This keeps the final image smaller and cleaner.
- Security considerations: run as a non-root user (`USER node`) so the app has fewer permissions. `NODE_ENV=production` disables dev features. `tini` helps handle stop signals so the app exits cleanly.
- Layer optimization: copy `package*.json` before `src` so Docker can reuse the dependency layer when only code changes, which speeds up rebuilds.

### Kubernetes Design

- Namespace strategy: use `default` for local testing to keep setup simple; can be split later into `dev` and `prod` namespaces.
- Resource allocation rationale: small requests/limits sized for lightweight Node.js services and Redis to run on a local kind cluster without exhausting resources.
- Health check configuration: HTTP probes on `/health/ready` and `/health/live` for both services; Redis uses TCP probes on port 6379.
- Scaling strategy: HPA scales `api-gateway` and `user-service` from 2 to 5 replicas based on CPU; overlays set dev replicas to 1 and prod to 3.
- Kustomize usage: `kustomization.yaml` groups base manifests so they can be applied with `kubectl apply -k` and enables dev/prod overlays.

### CI/CD Pipeline

- Pipeline stages: run tests per service, build and push Docker images, then deploy to the cluster.
- Deployment strategy: branch-based deploy (`develop` -> dev overlay, `main` -> prod overlay) using `kubectl apply -k`.
- Rollback approach: re-deploy a previous image tag by updating the deployment image to an older `${{ github.sha }}` tag.
- Secret management: `GITHUB_TOKEN` for registry auth and `KUBE_CONFIG_DATA` secret for kubeconfig; no secrets stored in repo.

### Environment & Secrets Management

- How do you separate config from code? Use ConfigMaps for non-sensitive values (ports, URLs, log levels) and Secrets for sensitive values.
- How do you handle sensitive vs non-sensitive config? Non-sensitive in ConfigMaps; sensitive in Secrets, referenced as environment variables.
- How would you manage secrets in production? Use a secret manager (e.g., Vault or external-secrets) and avoid storing plaintext secrets in Git.
- How do you handle different environments (dev/staging/prod)? Use Kustomize overlays per environment and adjust replicas/images/resources as needed.

### Monitoring Strategy

- Metrics collected: Prometheus `/metrics` endpoints with request latency histogram and default Node.js process metrics.
- Logging format: structured JSON logs via Winston (timestamp, level, message, request context).
- Alerting rules (proposed): high 5xx rate in API, high p95 latency in user-service, Redis down.

## Trade-offs & Assumptions

1. **Trade-off 1:**
   - Decision: Redis is deployed without persistent storage (no PVC) for now.
   - Rationale: keeps local/kind setup simple and fast for testing.
   - Alternative considered: add a PersistentVolumeClaim for durable storage in production.

## Security Considerations

- Containers run as non-root (`USER node`) and Kubernetes `securityContext` disables privilege escalation.
- Secrets are not stored in Git; sensitive values are referenced via Kubernetes Secrets and GitHub Actions secrets.
- NetworkPolicies restrict pod-to-pod traffic (only required paths are allowed).

## What I Would Improve With More Time

1. Implement GitOps with ArgoCD to keep the cluster state synced from Git and enable safer, auditable deployments.
2. Add external notifications (Microsoft Teams webhook or email) for deploy success/failure.
3.

## Time Spent

| Task | Time |
|------|------|
| Part 1: Docker | 1.5-2 hours |
| Part 2: Kubernetes | 2.5-3.5 hours |
| Part 3: CI/CD | 1.5-2 hours |
| Part 4: Monitoring | 1.5-2 hours |
| Part 5: Troubleshooting | 2-3 hours |
| Documentation | 1-1.5 hours |
| **Total** | 10-14 hours |
