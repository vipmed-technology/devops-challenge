# Architecture Documentation

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Kubernetes Cluster                       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Namespace: devops-challenge                    │ │
│  │                                                             │ │
│  │  ┌──────────────┐         ┌──────────────┐                │ │
│  │  │ API Gateway  │────────▶│ User Service │                │ │
│  │  │  (3 pods)    │         │  (3 pods)    │                │ │
│  │  │  Port: 3000  │         │  Port: 3001  │                │ │
│  │  └──────┬───────┘         └──────┬───────┘                │ │
│  │         │                        │                         │ │
│  │         │                        ▼                         │ │
│  │         │                 ┌──────────────┐                │ │
│  │         │                 │    Redis     │                │ │
│  │         │                 │   (1 pod)    │                │ │
│  │         │                 │  Port: 6379  │                │ │
│  │         │                 └──────────────┘                │ │
│  │         │                                                  │ │
│  │         ▼                                                  │ │
│  │  ┌──────────────┐                                         │ │
│  │  │  ConfigMap   │  (Non-sensitive config)                │ │
│  │  └──────────────┘                                         │ │
│  │  ┌──────────────┐                                         │ │
│  │  │   Secrets    │  (Sensitive data)                      │ │
│  │  └──────────────┘                                         │ │
│  │                                                             │ │
│  │  Network Policies: Restrict pod-to-pod communication      │ │
│  │  HPA: Auto-scale based on CPU/Memory                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Namespace: monitoring                          │ │
│  │                                                             │ │
│  │  ┌──────────────┐         ┌──────────────┐                │ │
│  │  │  Prometheus  │────────▶│   Grafana    │                │ │
│  │  │  (metrics)   │         │ (dashboards) │                │ │
│  │  └──────────────┘         └──────────────┘                │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Request Flow

1. External traffic → API Gateway Service (port 80)
2. API Gateway → User Service (port 3001)
3. User Service → Redis (port 6379)
4. Prometheus scrapes `/metrics` from all services

### Network Policies

- Default deny all ingress traffic
- API Gateway: Accepts traffic from anywhere
- User Service: Only accepts traffic from API Gateway
- Redis: Only accepts traffic from User Service
- All services can perform DNS lookups

## Technical Decisions

### Docker Strategy

**Base image choice:**
- Selected `node:20-alpine` - Official Node.js image with Alpine Linux
- Alpine reduces image size by ~70% compared to full Debian images
- Node 20 LTS provides long-term support and latest features
- Final images are ~150MB (well under 200MB requirement)

**Multi-stage build approach:**
```dockerfile
Stage 1 (dependencies): Install production dependencies
Stage 2 (production): Copy only node_modules and source code
```
- Separates build-time dependencies from runtime
- Excludes devDependencies, reducing image size
- npm cache is cleaned in dependencies stage, not carried to production

**Security considerations:**
- Non-root user (nodejs:1001) for container execution
- Minimal attack surface with Alpine base
- No unnecessary packages or tools in final image
- HEALTHCHECK directive for container health monitoring
- Proper signal handling (SIGTERM) for graceful shutdown

**Layer optimization:**
- Package files copied before source code (better caching)
- `.dockerignore` excludes tests, docs, and dev files
- Single RUN command for npm install (fewer layers)
- `--ignore-scripts` prevents arbitrary code execution during install

### Kubernetes Design

**Namespace strategy:**
- Single namespace `devops-challenge` for application components
- Separate `monitoring` namespace for observability stack
- Allows RBAC isolation and resource quotas per namespace
- Simplifies network policies and service discovery

**Resource allocation rationale:**

*API Gateway & User Service:*
- Requests: 100m CPU, 128Mi memory (guaranteed resources)
- Limits: 200m CPU, 256Mi memory (burst capacity)
- Based on Node.js runtime requirements (~50MB) + application overhead
- Allows for traffic spikes without throttling

*Redis:*
- Requests: 50m CPU, 64Mi memory
- Limits: 100m CPU, 128Mi memory
- Lightweight for in-memory cache with small dataset
- Should be increased for production with larger datasets

*Rationale:*
- Requests ensure pod scheduling on nodes with available resources
- Limits prevent resource exhaustion and noisy neighbor issues
- Conservative limits to avoid OOMKilled events
- Based on typical Node.js application profiles

**Health check configuration:**

*Liveness Probe:*
- Endpoint: `/health/live` (simple check, no dependencies)
- Initial delay: 15s (allow app startup)
- Period: 20s (check frequency)
- Failure threshold: 3 (tolerate transient failures)
- Purpose: Detect deadlocked processes, trigger restart

*Readiness Probe:*
- Endpoint: `/health/ready` (checks downstream dependencies)
- Initial delay: 10s (faster than liveness)
- Period: 10s (more frequent checks)
- Failure threshold: 3
- Purpose: Remove pod from load balancing when unhealthy

*Design philosophy:*
- Liveness should rarely fail (only true deadlock)
- Readiness can fail temporarily (dependency issues)
- Conservative thresholds prevent restart loops

**Scaling strategy:**

*Horizontal Pod Autoscaler (HPA):*
- Dev: 1-3 replicas
- Prod: 3-15 replicas
- Metrics: CPU (70%) and Memory (80%)
- Scale up: Fast (100% increase or +2 pods per 30s)
- Scale down: Slow (50% decrease per 60s, 5min stabilization)

*Rationale:*
- Multiple replicas for high availability
- CPU/memory based scaling for predictable load patterns
- Aggressive scale-up for traffic spikes
- Conservative scale-down to avoid flapping
- Custom metrics (request rate) recommended for production

*Pod Disruption Budgets (Prod):*
- Minimum 2 pods available during voluntary disruptions
- Ensures availability during node drains and cluster upgrades

*Anti-affinity (Prod):*
- Prefer spreading pods across different nodes
- Improves availability during node failures

### CI/CD Pipeline

**Pipeline stages:**

The pipeline consists of 4 stages:

1. **Lint and Test** (parallel per service)
   - Install dependencies
   - Run linter
   - Execute unit tests
   - Fails fast on code quality issues

2. **Build and Push** (parallel per service)
   - Build Docker images with BuildKit
   - Multi-platform support (linux/amd64)
   - Push to GitHub Container Registry (ghcr.io)
   - Layer caching for faster builds

3. **Security Scan** (parallel per service)
   - Trivy vulnerability scanning
   - Checks for HIGH and CRITICAL CVEs
   - Uploads results to GitHub Security tab
   - Non-blocking (informational)

4. **Deploy** (sequential)
   - Determine environment (main=prod, develop=dev)
   - Update Kustomize image tags
   - Apply manifests with kubectl
   - Wait for rollout completion
   - Verify deployment health

**Deployment strategy:**
- Rolling update (default Kubernetes strategy)
- MaxUnavailable: 25% (maintain 75% capacity)
- MaxSurge: 25% (allow 25% over desired replicas)
- Gradual rollout minimizes risk
- Automatic rollback on health check failures

**Rollback approach:**

*Automatic rollback:*
- Failed health checks prevent rollout completion
- Kubernetes automatically maintains previous version

*Manual rollback:*
```bash
kubectl rollout undo deployment/api-gateway -n devops-challenge
kubectl rollout undo deployment/user-service -n devops-challenge
```

*GitOps rollback:*
- Revert the commit in Git
- Pipeline automatically re-deploys previous version

**Secret management:**
- GitHub Actions secrets for KUBECONFIG and registry credentials
- Kubernetes Secrets for application secrets (base64 encoded)
- Production recommendation: External Secrets Operator + AWS Secrets Manager
- Never commit secrets to Git (documented in secret.yaml)

**Image tagging strategy:**
- `dev` - Latest develop branch build
- `prod` - Latest main branch build
- `<branch>-<sha>` - Specific commit (traceability)
- `latest` - Latest production release
- Avoids using only `latest` (not reproducible)

### Environment & Secrets Management

**Separating config from code:**
- ConfigMaps for non-sensitive configuration (ports, URLs, log levels)
- Secrets for sensitive data (passwords, API keys)
- Environment variables injected from ConfigMaps/Secrets
- No hardcoded configuration in application code
- Kustomize overlays for environment-specific overrides

**Handling sensitive vs non-sensitive config:**

*Non-sensitive (ConfigMap):*
- Service ports and URLs
- Log levels and formats
- Feature flags
- Public API endpoints
- Node environment (dev/prod)

*Sensitive (Secret):*
- Database passwords
- API keys and tokens
- TLS certificates
- OAuth client secrets
- Encryption keys

**Managing secrets in production:**

*Current implementation:*
- Kubernetes Secrets with base64 encoding
- Suitable for demo/development only

*Production recommendations (in order of preference):*

1. **External Secrets Operator (ESO)** - Recommended
   - Syncs secrets from external vault to Kubernetes
   - Supports AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, HashiCorp Vault
   - Automatic rotation
   - Audit logging
   - No secrets in Git

2. **Sealed Secrets**
   - Encrypts secrets that can be safely stored in Git
   - Controller decrypts in-cluster
   - Good for GitOps workflows
   - Requires key management

3. **SOPS (Secrets OPerationS)**
   - Encrypts YAML files with cloud KMS
   - Integrates with Git
   - Supports multiple cloud providers
   - Requires CI/CD integration for decryption

**Handling different environments (dev/staging/prod):**

*Kustomize overlay strategy:*
```
k8s/
├── base/           # Common configuration
├── overlays/
│   ├── dev/        # Development overrides
│   └── prod/       # Production overrides
```

*Environment differences:*

| Aspect | Dev | Prod |
|--------|-----|------|
| Replicas | 1 | 3 |
| Resources | Lower | Higher |
| HPA Max | 3 | 15 |
| Log Level | debug | info |
| Image Tag | dev | prod |
| PDB | No | Yes |
| Anti-affinity | No | Yes |

*Benefits:*
- DRY principle (base is shared)
- Environment-specific patches
- Easy to add new environments
- Clear diff between environments
- GitOps friendly

### Monitoring Strategy

**Metrics collected:**

*Default metrics (prom-client):*
- Process CPU usage
- Process memory (heap, RSS, external)
- Event loop lag
- Active handles and requests
- Garbage collection statistics

*Custom application metrics:*
- HTTP request count (by method, route, status)
- HTTP request duration (histogram)
- Upstream request duration (API Gateway → User Service)
- Redis operation duration
- User operation count (create, delete, list)

**Logging format:**
- Structured JSON logs (Winston)
- Fields: timestamp, level, message, service, context
- Stdout/stderr (captured by Kubernetes)
- Log levels: error, warn, info, debug
- Request logging: method, path, status, duration, IP

**Alerting rules:**

*Critical (page immediately):*
1. Service down (up == 0 for 1m)
2. High error rate (>5% 5xx errors for 5m)
3. Redis connection failure (2m)

*Warning (investigate during business hours):*
4. High latency (P95 > 2s for 10m)
5. High memory usage (>85% for 15m)
6. Pod restart loop (restarts in 15m)

*Full details in `docs/monitoring-strategy.md`*

## Trade-offs & Assumptions

### Trade-off 1: In-Cluster vs Managed Monitoring

**Decision:** In-cluster Prometheus + Grafana (documented both options)

**Rationale:**
- Lower cost for small deployments
- Full control over data retention
- No external dependencies
- Good for learning and development

**Alternative considered:** Managed service (Datadog, New Relic, Grafana Cloud)
- Pros: Less operational overhead, advanced features, better scaling
- Cons: Ongoing costs, data egress, vendor lock-in
- Better suited for production at scale

### Trade-off 2: Rolling Update vs Blue-Green Deployment

**Decision:** Rolling update (Kubernetes default)

**Rationale:**
- Simpler implementation
- No additional infrastructure required
- Gradual rollout reduces risk
- Automatic rollback on health check failures
- Sufficient for this application

**Alternative considered:** Blue-green or canary deployments
- Pros: Instant rollback, traffic splitting, A/B testing
- Cons: Requires service mesh (Istio/Linkerd) or Argo Rollouts
- Better for high-risk deployments

### Trade-off 3: StatefulSet vs Deployment for Redis

**Decision:** Deployment (for demo purposes)

**Rationale:**
- Simpler for development/testing
- Faster to set up
- Acceptable for ephemeral data

**Alternative considered:** StatefulSet with PersistentVolume
- Pros: Data persistence, stable network identity, ordered deployment
- Cons: More complex, requires storage provisioning
- **Production requirement:** Must use StatefulSet with persistence

### Trade-off 4: Network Policies vs Service Mesh

**Decision:** Kubernetes Network Policies

**Rationale:**
- Native Kubernetes feature
- Simple L3/L4 traffic control
- No additional components
- Sufficient for basic security

**Alternative considered:** Service mesh (Istio, Linkerd)
- Pros: L7 traffic management, mTLS, observability, circuit breaking
- Cons: Significant complexity, resource overhead, learning curve
- Better suited for microservices at scale (>10 services)

### Trade-off 5: GitHub Container Registry vs Docker Hub

**Decision:** GitHub Container Registry (ghcr.io)

**Rationale:**
- Free for public repositories
- Integrated with GitHub Actions
- No rate limiting issues
- Better security with GitHub tokens
- Automatic cleanup policies

**Alternative considered:** Docker Hub
- Pros: More familiar, widely used
- Cons: Rate limiting (100 pulls/6h), requires separate account
- ECR/GCR/ACR recommended for production private images

## Security Considerations

### Container Security
- ✅ Non-root user (UID 1001)
- ✅ Minimal base image (Alpine)
- ✅ No unnecessary packages
- ✅ Read-only root filesystem (where possible)
- ✅ Dropped all capabilities
- ✅ Security scanning (Trivy)

### Kubernetes Security
- ✅ Network Policies (default deny, explicit allow)
- ✅ Secrets for sensitive data (not ConfigMaps)
- ✅ Resource limits (prevent resource exhaustion)
- ✅ Health checks (detect compromised pods)
- ✅ RBAC (namespace isolation)
- ⚠️ Pod Security Standards (should add)
- ⚠️ Image pull policies (should enforce)

### CI/CD Security
- ✅ Secrets stored in GitHub Actions secrets
- ✅ Vulnerability scanning in pipeline
- ✅ No secrets in Git
- ✅ Image signing (implicit with ghcr.io)
- ⚠️ SBOM generation (should add)
- ⚠️ Policy enforcement (OPA/Kyverno)

### Production Recommendations
1. Enable Pod Security Admission (restricted profile)
2. Implement External Secrets Operator
3. Add mTLS with service mesh
4. Enable audit logging
5. Implement image signing verification (Sigstore/Cosign)
6. Add runtime security (Falco)
7. Regular security scanning and patching
8. Implement least privilege RBAC

## What I Would Improve With More Time

### High Priority
1. **Persistent storage for Redis**
   - StatefulSet with PersistentVolumeClaim
   - Redis persistence (RDB + AOF)
   - Backup and restore procedures

2. **Complete monitoring implementation**
   - Deploy Prometheus and Grafana to cluster
   - Create custom Grafana dashboards
   - Configure alerting with AlertManager
   - Integrate with Slack/PagerDuty

3. **Integration tests in CI/CD**
   - Spin up kind cluster in GitHub Actions
   - Deploy application
   - Run end-to-end tests
   - Validate health checks and metrics

### Medium Priority
4. **GitOps with ArgoCD**
   - Declarative deployment management
   - Automatic sync from Git
   - Visual deployment status
   - Easy rollback

5. **Distributed tracing**
   - OpenTelemetry instrumentation
   - Jaeger for trace visualization
   - Correlate logs, metrics, and traces

6. **Advanced deployment strategies**
   - Canary deployments with Argo Rollouts
   - Progressive delivery
   - Automated rollback on metric thresholds

7. **Service mesh**
   - Istio or Linkerd for mTLS
   - Traffic management (retries, timeouts)
   - Circuit breaking
   - Better observability

### Low Priority
8. **Multi-region deployment**
   - Geographic distribution
   - Latency optimization
   - Disaster recovery

9. **Cost optimization**
   - Cluster autoscaling
   - Spot instances for dev
   - Resource right-sizing based on metrics

10. **Developer experience**
    - Skaffold for local development
    - Telepresence for remote debugging
    - Pre-commit hooks for validation

## Time Spent

| Task | Time |
|------|------|
| Part 1: Docker | 1.5 hours |
| Part 2: Kubernetes | 3 hours |
| Part 3: CI/CD | 2 hours |
| Part 4: Monitoring | 2.5 hours |
| Part 5: Troubleshooting | 1.5 hours |
| Documentation | 1.5 hours |
| **Total** | **12 hours** |


### Assumptions Made
1. **Cluster exists** - Assumed a Kubernetes cluster is available (kind, EKS, GKE, etc.)
2. **Registry access** - Assumed GitHub Container Registry is accessible
3. **No TLS** - Skipped TLS/Ingress configuration for simplicity
4. **Ephemeral data** - Redis data loss on restart is acceptable for demo
5. **Single cluster** - No multi-cluster or multi-region requirements
6. **Basic auth** - No OAuth/OIDC integration required

---
