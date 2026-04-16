# Architecture Documentation

## System Architecture



The system follows a lightweight microservices architecture deployed on Kubernetes:
1. **API Gateway (Node.js/Express):** Acts as the single entry point. It handles incoming HTTP requests on port 3000 and routes them to downstream services.
2. **User Service (Node.js/Express):** A domain-specific microservice listening on port 3001 that handles CRUD operations for users.
3. **Redis Store:** Acts as the primary database for the User Service, running on port 6379.

Traffic flows linearly: `Client -> API Gateway -> User Service -> Redis`.

## Your Decisions

### Docker Strategy
- **Base image choice:** `node:20-alpine`. Chosen for its minimal footprint and reduced attack surface, helping us easily stay under the 200MB size limit requirement.
- **Multi-stage build approach:** Implemented a `builder` and `runner` pattern. The `builder` stage installs all dependencies (including `devDependencies` for testing), while the `runner` stage only copies the compiled artifacts and production dependencies, drastically reducing the final image size (approx. ~55MB).
- **Security considerations:** Configured the container to run as an unprivileged user (`USER node`) instead of `root`. 
- **Layer optimization:** Copied `package*.json` files before the source code (`src/`) to leverage Docker's layer caching. If the code changes but dependencies do not, Docker reuses the `npm ci` layer, significantly speeding up the pipeline.
- **Lifecycle Management:** Implemented graceful shutdown by catching `SIGTERM` and `SIGINT` signals in Node.js to close HTTP servers and database connections cleanly before exiting.

### Kubernetes Design
- **Namespace strategy:** All resources are encapsulated within the `devops-challenge` namespace to logically isolate the application from other cluster workloads.
- **Resource allocation rationale:** `Requests` are set conservatively to ensure scheduling efficiency (e.g., 10m CPU), while `Limits` are set higher to prevent OOMKills and CPU throttling during traffic spikes.
- **Health check configuration:** - `Liveness probes` (`/health/live`): Used to detect deadlocks. If it fails, the kubelet restarts the container.
  - `Readiness probes` (`/health/ready`): Checks downstream dependencies (e.g., API Gateway checking User Service, User Service pinging Redis). Ensures the pod only receives traffic when fully operational.
- **Scaling strategy:** Configured a Horizontal Pod Autoscaler (HPA) targeting CPU utilization to automatically scale the API Gateway and User Service pods based on demand.

### CI/CD Pipeline
- **Pipeline stages:** 1. **Build & Test:** Runs `npm test` natively to ensure code quality.
  2. **Push:** Uses Docker Buildx to build and push the image to GitHub Container Registry (GHCR).
  3. **Deploy:** Uses `kubectl apply -k` to deploy the Kustomize manifests.
- **Deployment strategy:** Branch-based deployment. Pushes to `main` apply the `prod` Kustomize overlay, while pushes to `develop` apply the `dev` overlay.
- **Rollback approach:** Git acts as the source of truth. Rollbacks are performed by reverting the Git commit, which triggers the pipeline to deploy the previous stable state.
- **Secret management:** CI/CD variables (like GHCR tokens and Kubeconfig) are stored securely in GitHub Actions Secrets.

### Environment & Secrets Management
- **How do you separate config from code?** By using `ConfigMaps` for non-sensitive data (ports, URLs, log levels) and `Secrets` for sensitive data, injecting them as environment variables.
- **How do you handle sensitive vs non-sensitive config?** Using Kustomize `configMapGenerator` and `secretGenerator`. Sensitive data is never hardcoded in the base manifests.
- **How would you manage secrets in production?** In a real production environment, I would NEVER commit secrets to Git. I would use **HashiCorp Vault** or **AWS Secrets Manager** integrated via the **External Secrets Operator (ESO)**. Alternatively, for a strict GitOps approach, I would use **Sealed Secrets** or **SOPS** to encrypt manifests before committing.
- **How do you handle different environments?** Through Kustomize Overlays (`k8s/base`, `k8s/overlays/dev`, `k8s/overlays/prod`). The base contains common specs, and overlays apply specific patches (e.g., higher replica counts and HPA in production).

### Monitoring Strategy
- **Metrics collected:** Node.js process metrics and custom RED metrics (Rate, Errors, Duration) using `prom-client` exposed on `/metrics`.
- **Logging format:** Replaced standard `console.log` with `Pino` to generate machine-readable structured JSON logs, enabling easy parsing by EFK/Loki stacks.
- **Alerting rules (proposed):** High Error Rate (5xx > 5%), High Request Latency (P95 > 1s), and Pod CrashLooping limits.

## Trade-offs & Assumptions

1. **Trade-off 1: Direct CI/CD Deploy vs GitOps**
   - **Decision:** Used a "Push" deployment model via GitHub Actions running `kubectl apply`.
   - **Rationale:** Faster to implement for a challenge scope. 
   - **Alternative considered:** A "Pull" model using ArgoCD or Flux (GitOps), which is much more secure and robust for production environments.

2. **Trade-off 2: Stateful Workloads in Kubernetes**
   - **Decision:** Deployed Redis as a native Kubernetes Deployment.
   - **Rationale:** Keeps the challenge self-contained.
   - **Alternative considered:** In production, using a managed service like AWS ElastiCache is preferred to reduce operational overhead regarding backups, scaling, and high availability.

## Security Considerations
- **Non-root Containers:** Ensured all images drop root privileges.
- **Network Policies:** Implemented default-deny network policies, explicitly allowing only the API Gateway to talk to the User Service, and only the User Service to talk to Redis.
- **Immutable Tags:** Overcame the `:latest` anti-pattern by utilizing the Git SHA (`${{ github.sha }}`) to tag container images, ensuring immutability and reliable rollbacks.

## What I Would Improve With More Time
1. Implement a true GitOps workflow using **ArgoCD**.
2. Add distributed tracing using **OpenTelemetry** and Jaeger to track requests seamlessly between the Gateway and the User Service.
3. Integrate Security Scanning tools like **Trivy** in the GitHub Actions pipeline to scan Docker images and Kubernetes manifests for vulnerabilities before deployment.
4. Replace the single Redis pod with a highly available Redis Sentinel or Cluster setup for production resilience.

## Time Spent

| Task | Time |
|------|------|
| Part 1: Docker | 2.0 hours |
| Part 2: Kubernetes | 3.0 hours |
| Part 3: CI/CD | 2.5 hours |
| Part 4: Monitoring | 2.0 hours |
| Part 5: Troubleshooting | 1.0 hours |
| Documentation | 1.0 hours |
| **Total** | **11.5 hours** |