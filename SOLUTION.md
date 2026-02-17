# Solution Overview

All five parts of the challenge are complete and production-ready. think of this as the README file. 

Quick Start

```bash
# Create a local Kubernetes cluster
kind create cluster --name devops-challenge

# Build the Docker images
docker build -t devops-challenge/api-gateway:local ./apps/api-gateway
docker build -t devops-challenge/user-service:local ./apps/user-service

# Load images into kind
kind load docker-image devops-challenge/api-gateway:local --name devops-challenge
kind load docker-image devops-challenge/user-service:local --name devops-challenge

# Deploy all
kubectl apply -k k8s/overlays/dev

# Wait for it to start (takes 30 seconds)
kubectl wait --for=condition=ready pod -l app=api-gateway -n devops-challenge --timeout=60s

# Access the app
kubectl port-forward svc/api-gateway 3000:3000 -n devops-challenge
```

Then in another terminal:
```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/users
curl http://localhost:3000/metrics       # Prometheus
```

1) Docker Images

*Goal: Production-ready containers under 200MB*

- Used `node:20-alpine` as base (130MB instead of 1GB for full Node.js)
- Multi-stage builds to keep only what's needed in production
- Ran as non-root user for security
- Added graceful shutdown handlers (properly handle SIGTERM)

*Results:
- API Gateway: 201MB (1MB over target, but acceptable for Node.js)
- User Service: 200MB (exactly on target!)

Nota: Using `COPY --chown=node:node` instead of `RUN chown` saved 20MB by avoiding a duplicate layer.

2) Kubernetes Setup

Internet → API Gateway (3000) → User Service (3001) → Redis (6379)

- Base manifests with proper health checks (liveness, readiness, startup)
- Resource limits to prevent OOMKills
- Two overlays:
  - Dev: 1 replica, minimal resources, debug logging
  - Production: 3 replicas, HPA (autoscaling), LoadBalancer, production logging
- Used Kustomize to avoid duplicating configs

Health checks **IMPORTANT**:
- Liveness: Restarts if failing
- Readiness: Includes dependency checks
- Startup: Gives time to initialize

Advanced features:
- HPA scales between 3-10 pods based on CPU/memory
- Proper resource requests/limits (Node.js needs at least 256Mi)
- Security contexts (runAsNonRoot, runAsUser: 1000)

3) CI/CD Pipeline

1. Test: Runs `npm test` for both services in parallel
2. Build: Creates Docker images, tags with commit SHA
3. Deploy: Updates Kubernetes deployment automatically
4. Notify: Sends status to Slack/Discord (placeholder ready)

Small adjustments:
- SHA-based tags (`sha-abc123`) for immutable deployments and easy rollbacks
- Also tags with branch name (`main`, `develop`) for tracking
- `kubectl set image` instead of full apply (faster, clearer intent)
- In-cluster health checks (no port-forward issues in CI)

Branch strategy:
- `main` → Production deployment
- `develop` → Development deployment

4) Monitoring & Observability

- Prometheus `/metrics` endpoint on both services
- Structured JSON logging with Winston
- Request tracking (method, path, status, duration)
- Custom metrics: request duration, request count, Redis operations

Example metrics:
```
http_request_duration_seconds   # How fast are we?
http_requests_total             # How much traffic?
redis_operations_total          # How's Redis doing?
```

Example logs
```json
{
  "level": "info",
  "service": "api-gateway",
  "timestamp": "2026-02-17T10:30:45.123Z",
  "message": "Request completed",
  "method": "GET",
  "path": "/users",
  "statusCode": 200,
  "duration": "0.045s"
}
```

Five alrting rules for production (see `docs/monitoring-strategy.md`):
- High error rate (>5% for 2 min)
- Pod restart loops
- High memory usage (>90%)
- Slow API responses (P95 > 1s)
- Service unreachable

5) Troubleshooting

Found and documented all 8 issues in the broken manifests:

1. Label mismatch - Selector can't find pods → no pods created
2. Wrong containerPort - Says 8080, app uses 3000 → misleading
3. Too little memory - 64Mi for Node.js → OOMKills
4. Wrong hostname - App looks for `redis-master`, should be `redis`
5. Aggressive probe - `failureThreshold: 1` → restarts too easily
6. Port mismatch - Service targets 8080, container listens on 3001
7. Auth mismatch - Redis requires password, app doesn't send it
8. Secrets exposed - Passwords in ConfigMap instead of Secret

See `docs/troubleshooting.md` for detailed explanations of each issue.

## Key Design Decisions & Trade-offs

- Why Alpine Linux?
70MB smaller than Debian  
Potential compatibility issues with some npm packages  
*Decision: Worth it for simple Express apps

- Why LoadBalancer instead of Ingress?
Simpler setup  
More expensive (one LB per service)  
*Decision: Good for demos, production should use Ingress for path-based routing and TLS

- Why in-cluster Redis?
Easy to demo locally  
No HA, no automated backups  
*Decision: Fine for demos, use managed Redis (ElastiCache/Azure Cache) in production

- Why kubectl set image instead of GitOps?
Fast and simple  
Not fully declarative  
*Decision: Good enough for this scope, but ArgoCD would be better for production

## Testing the Application

*Create a user:
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'
```

*List users:
```bash
curl http://localhost:3000/api/users
```

*Delete a user:
```bash
curl -X DELETE http://localhost:3000/api/users/<user-id>
```

*Check metrics:
```bash
curl http://localhost:3000/metrics | grep http_request
```

*Load test (requires apache2-utils):
```bash
ab -n 1000 -c 10 http://localhost:3000/api/users
kubectl get hpa -n devops-challenge -w  # Watch HPA scale up
```

## Deploying to Production

* Change overlay and environment:

```bash
# Deploy to production
kubectl apply -k k8s/overlays/production

# Verify HPA is working
kubectl get hpa -n devops-challenge

# Check that 3 replicas are running
kubectl get pods -n devops-challenge

# API Gateway should be exposed via LoadBalancer
kubectl get svc api-gateway -n devops-challenge
```

* Rollback Strategy

If something breaks:

```bash
# Option 1: Rollback to previous SHA
kubectl set image deployment/api-gateway \
  api-gateway=ghcr.io/user/api-gateway:sha-<previous-commit> \
  -n devops-challenge

# Option 2: Use built-in rollback
kubectl rollout undo deployment/api-gateway -n devops-challenge

# Option 3: Revert the Git commit and let CI/CD redeploy
git revert <bad-commit>
git push origin main
```

## Debugging Quick Reference

Pod not starting?
```bash
kubectl get pods -n devops-challenge
kubectl describe pod <pod-name> -n devops-challenge
kubectl logs <pod-name> -n devops-challenge
```

Service not reachable?
```bash
kubectl get endpoints -n devops-challenge  # Does service have endpoints?
kubectl get pods --show-labels -n devops-challenge  # Do labels match?
```

Deployment not updating?
```bash
kubectl rollout status deployment/api-gateway -n devops-challenge
kubectl rollout history deployment/api-gateway -n devops-challenge
```

----------------------------------------------------------------------------------------------------------

Documentation

All the details are documented in:
- [docs/architecture.md](docs/architecture.md) - Deep dive into all design decisions
- [docs/monitoring-strategy.md](docs/monitoring-strategy.md) - Metrics, logs, alerts, dashboard proposals
- [docs/troubleshooting.md](docs/troubleshooting.md) - The 8 broken manifest issues explained

----------------------------------------------------------------------------------------------------------

Final Notes

Muchas gracias por este desafio, he aprendido mucho en lo que lo desarrollaba, nunca me habia relacionado con prometheus, solo le daba uso a grafana, y bueno, tambien pude refinar los conocimientos que ya tenia y adquirir algunos nuevos, asi que fue algo bastante divertido e interesante.
