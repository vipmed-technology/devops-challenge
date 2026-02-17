# Architecture Documentation

1) System Architecture

The application consists of three main components deployed in Kubernetes:

For Visual Aid: https://drive.google.com/file/d/1FbUVqFjiE7dKJOJwJ2xQZw0dN9UJ90Cv/view?usp=sharing


*Traffic Flow:
1. External traffic → LoadBalancer Service (prod) or port-forward (dev) → API Gateway
2. API Gateway proxies requests to User Service via ClusterIP Service
3. User Service stores/retrieves data from Redis
4. Prometheus scrapes `/metrics` endpoints on both services

2) Docker Strategy

- Base image choice: `node:20-alpine` (130MB base)
  - Rationale: Alpine provides minimal attack surface and smallest size
  - Alternatives considered:
    - `node:20-slim` (200MB) - 70MB larger, Debian-based might have better compatibility
    - `node:20` (1GB) - full Debian, unnecessary packages for production

- Multi-stage build approach: Yes, despite single-arch deployment
  - Builder stage: Runs `npm ci` with dev dependencies for potential build steps
  - Production stage: Only copies production `node_modules`, excludes dev dependencies
  - Optimization: Used `--omit=dev --omit=optional` to reduce dependencies
  - Layer optimization: `COPY --chown=node:node` to avoid duplicate 80MB layer from separate `RUN chown`

- Security considerations:
  - Run as non-root user (`USER node`, UID 1000)
  - Minimal base image reduces attack surface
  - No secrets baked into images
  - `.dockerignore` prevents sensitive files from being copied

- Layer optimization:
  - Package files copied separately to leverage cache when source changes
  - Single `npm ci` command to flatten layer
  - Node modules cleanup in same layer as install
  - Final image sizes: API Gateway 201MB, User Service 200MB (12MB/1MB over 200MB target, acceptable for production Node.js)

3) Kubernetes Design

- Namespace strategy: Dedicated `devops-challenge` namespace
  - Isolates resources from other applications
  - Enables environment-specific RBAC policies
  - Simplifies resource quotas and network policies

- Resource allocation rationale:
  - API Gateway: 100m CPU / 256Mi memory (requests), 500m / 512Mi (limits)
  - User Service: 200m CPU / 256Mi memory (requests), 1000m / 512Mi (limits)
  - Redis: 50m CPU / 64Mi memory (requests), 200m / 128Mi (limits)
  - Rationale: Node.js requires 256Mi+ to avoid OOMKill, left headroom for traffic spikes

- Health check configuration:
  - Liveness probe: `/health/live` - checks if app is running
    - `initialDelaySeconds: 10` - allows Node.js startup time
    - `failureThreshold: 3` - tolerates transient failures
  - Readiness probe: `/health/ready` - checks if app can serve traffic (includes Redis check for user-service)
    - Prevents routing traffic to pods not ready to serve
  - Startup probe: `/health/live` with extended timeout
    - Protects slow-starting pods from premature liveness kills

- Scaling strategy:
  - Dev environment: 1 replica per service (minimal resources)
  - Prod environment:
    - API Gateway: 3 replicas + HPA (CPU 70%, memory 80%, max 10 pods)
    - User Service: 2 replicas + HPA (CPU 70%, memory 80%, max 8 pods)
    - Redis: 1 replica (stateful, no HA in basic setup)

- Service exposure:
  - Base: All services use ClusterIP (internal only)
  - Prod overlay: JSON patch converts API Gateway to LoadBalancer
  - Evolution path: Documented migration to Ingress controller for path-based routing, TLS, and better cost management

4) CI/CD Pipeline

- Pipeline stages:
  1. Test: Run unit tests in parallel for both services (matrix strategy)
  2. Build & Push: Build Docker images with multi-platform support, push to GHCR
  3. Deploy: Update Kubernetes deployment with new image tags
  4. Notify: Post deployment status (placeholder for Slack/Discord integration)

- Deployment strategy: Rolling update (Kubernetes default)
  - Zero-downtime deployments via readiness probes
  - `maxSurge: 1, maxUnavailable: 0` ensures capacity during rollout
  - `terminationGracePeriodSeconds: 30` matches graceful shutdown handler timeout

- Image tagging strategy:
  - Primary tag: Git SHA (`sha-<commit>`) for immutable, traceable deploys
  - Secondary tag: Branch name (`main`, `develop`) for environment tracking
  - Rationale: SHA enables exact rollback, branch tag shows current deployed version

- Rollback approach:
  ```bash
  # Rollback to previous SHA
  kubectl set image deployment/api-gateway \
    api-gateway=ghcr.io/user/api-gateway:sha-<previous>
  
  # Or use built-in rollout undo
  kubectl rollout undo deployment/api-gateway -n devops-challenge
  ```

- Secret management:
  - Current: Placeholder comment in CI/CD (requires cluster access configuration)
  - Production recommendation:
    - Use GitHub Secrets for `KUBE_CONFIG` (encrypted at rest)
    - Consider external-secrets operator to sync from AWS Secrets Manager/Vault
    - Never commit credentials to repository

5) Environment & Secrets Management

- Config separation from code:
  - Environment variables injected via Kubernetes ConfigMaps
  - Service URLs use Kubernetes DNS (service names)
  - Port configurations in ConfigMap, referenced in deployment specs

- Sensitive vs non-sensitive config:
  - ConfigMap: Ports, service URLs, log levels, feature flags (non-sensitive)
  - Secret: Redis password, database credentials, API keys (sensitive)
  - Base64 encoding in secrets (Kubernetes default, not encryption)

- Production secret management:
  - Recommendation: External Secrets Operator with AWS Secrets Manager or HashiCorp Vault
  - Why: 
    - Secrets encrypted at rest in dedicated secret store
    - Automatic rotation capabilities
    - Audit logging of secret access
    - RBAC separation between app teams and secret admins

- Environment management (dev/staging/prod):
  - Kustomize overlays: Base manifests + environment-specific patches
  - Dev overlay: Minimal resources, 1 replica, debug logging
  - Prod overlay: Full resources, HPA, LoadBalancer, info logging
  - Future: Staging overlay between dev and prod for pre-production testing

6) Monitoring Strategy

- Metrics collected:
  - Prometheus metrics via `/metrics` endpoint:
    - Default Node.js metrics (heap usage, event loop lag, GC stats)
    - HTTP request duration histogram (with method, route, status code labels)
    - HTTP request count counter
    - Redis operations counter (user-service only)
  - Kubernetes metrics: Pod CPU, memory, restart count, readiness status

- Logging format:
  - Structured JSON logging with Winston:
    - Timestamp (ISO 8601)
    - Log level (info, warn, error)
    - Message
    - Service name (api-gateway, user-service)
    - Contextual fields (request ID, user ID, error stack traces)
  - Rationale: JSON enables log aggregation tools (ELK, Loki) to parse and filter logs

- Alerting rules (proposed):
  ```yaml
  # High error rate
  - alert: HighErrorRate
    expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
    
  # Pod restart loop
  - alert: PodRestartLoop
    expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
    
  # High memory usage
  - alert: HighMemoryUsage
    expr: container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.9
  ```

## Trade-offs & Assumptions

Trade-off 1: Alpine vs Debian Base Image

- Decision: Used Alpine despite potential compatibility issues
- Rationale: 70MB size reduction outweighs risk for simple Node.js apps without native dependencies
- Alternative considered: node:20-slim for better compatibility with some npm packages
- Mitigation: Both services tested successfully with Alpine

Trade-off 2: ClusterIP + LoadBalancer vs Ingress

- Decision: Used Service-level LoadBalancer in prod overlay
- Rationale: Simpler initial setup, fewer components to configure
- Alternative considered: Ingress controller (nginx, traefik) with path-based routing
- Evolution path: Document migration to Ingress for TLS termination, path routing, cost optimization
- Trade-off: Pay for LoadBalancer per service vs shared Ingress LB

Trade-off 3: In-Cluster Redis vs Managed Redis

- Decision: Deploy Redis in-cluster as single pod
- Rationale: Challenge scope focuses on Kubernetes skills, not cloud service management
- Alternative considered: AWS ElastiCache, Azure Cache for Redis
- Production recommendation: Use managed Redis for:
  - High availability (automatic failover)
  - Automated backups
  - Maintenance handled by cloud provider
  - Better performance and scaling

Trade-off 4: kubectl set image vs GitOps

- Decision: Use `kubectl set image` in CI/CD pipeline
- Rationale: Simple, direct deployment for challenge demonstration
- Alternative considered: GitOps with ArgoCD/FluxCD
- Trade-off:
  - Current: Fast deployment, cluster state not versioned
  - GitOps: Git as single source of truth, audit trail, drift detection
- Production recommendation: Adopt GitOps for declarative, auditable deployments

## Security Considerations

1. Container Security:
   - Non-root user (UID 1000) in all containers
   - Minimal base images (Alpine)
   - No secrets in Dockerfiles or images
   - Security contexts in pod specs (`runAsNonRoot: true`)

2. Secret Management:
   - ConfigMap for non-sensitive config only
   - Secrets (base64) for credentials
   - Production: Recommend external secret management (Vault, AWS Secrets Manager)

3. Network Security:
   - Services default to ClusterIP (internal only)
   - Namespace isolation
   - Future: Network policies to restrict pod-to-pod communication

4. RBAC (Future):
   - Service accounts with minimal permissions
   - Role-based access to namespaces
   - Separate roles for CI/CD, developers, operators

5. Image Security:
   - Pull from ghcr.io with authentication
   - Immutable image tags (SHA-based)
   - Future: Image scanning (Trivy, Snyk) in CI pipeline
