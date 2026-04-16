# Troubleshooting Report

## Debugging Process

I deployed the broken manifests to a local kind cluster to observe real failures:

```
kubectl apply -f k8s/broken/namespace.yaml
kubectl apply -f k8s/broken/
```

**Immediate results:**
- `api-gateway` Deployment **rejected by the API server** due to selector/label mismatch
- `user-service` pods entered **ImagePullBackOff** (image `devops-challenge/user-service:latest` resolved to Docker Hub, which doesn't have it)
- `redis` pod started successfully
- `api-gateway` Service had **no endpoints** (no matching pods exist)
- `user-service` Service had **no endpoints** (pods not ready)

I then reviewed each manifest line by line against the application code to find configuration errors that would cause failures even after the deployment-blocking issues are fixed.

---

## Issues Found

### Issue 1: api-gateway selector/label mismatch

- **File:** `api-gateway.yaml`
- **What is wrong:** The Deployment `spec.selector.matchLabels` is `app: api-gateway` but the pod template `metadata.labels` is `app: gateway`. These must match.
- **Why it causes a problem:** Kubernetes rejects the Deployment entirely. The API server returns `Invalid value: selector does not match template labels`. No pods are created at all. The Service (which selects `app: api-gateway`) would also find zero endpoints even if pods existed.
- **How to fix it:**
  ```yaml
  # In the pod template:
  metadata:
    labels:
      app: api-gateway  # was: gateway
  ```

### Issue 2: api-gateway containerPort mismatch

- **File:** `api-gateway.yaml`
- **What is wrong:** `containerPort` is set to `8080` but the application listens on port `3000` (set via the `PORT` env var in the same manifest).
- **Why it causes a problem:** While `containerPort` is mostly informational in Kubernetes, it's misleading and breaks any tooling or network policies that rely on it. The probes correctly target port 3000, but the declared port is inconsistent.
- **How to fix it:**
  ```yaml
  ports:
    - containerPort: 3000  # was: 8080
  ```

### Issue 3: api-gateway resource limits too low

- **File:** `api-gateway.yaml`
- **What is wrong:** Memory limit is `64Mi` and request is `32Mi`. Node.js typically needs 80-150Mi just to start, and Express with dependencies needs more.
- **Why it causes a problem:** The container will be **OOMKilled** immediately on startup. Kubernetes will keep restarting it, resulting in a `CrashLoopBackOff` state.
- **How to fix it:**
  ```yaml
  resources:
    requests:
      cpu: "100m"
      memory: "128Mi"   # was: 32Mi
    limits:
      cpu: "250m"        # was: 50m
      memory: "256Mi"    # was: 64Mi
  ```

### Issue 4: user-service wrong REDIS_HOST

- **File:** `user-service.yaml`
- **What is wrong:** `REDIS_HOST` is set to `redis-master` but the Redis Service is named `redis` (in `redis.yaml`).
- **Why it causes a problem:** DNS resolution for `redis-master` fails because there is no Service with that name. The user-service cannot connect to Redis, so the readiness probe fails (`/health/ready` checks Redis connectivity) and the pod never becomes Ready. No traffic is routed to it.
- **How to fix it:**
  ```yaml
  - name: REDIS_HOST
    value: "redis"  # was: redis-master
  ```

### Issue 5: user-service missing REDIS_PASSWORD

- **File:** `user-service.yaml`
- **What is wrong:** No `REDIS_PASSWORD` environment variable is set, but Redis is started with `--requirepass supersecret` (in `redis.yaml`).
- **Why it causes a problem:** The user-service connects to Redis without authentication. Redis rejects all commands with `NOAUTH Authentication required`. Every data operation fails with a 500 error.
- **How to fix it:**
  ```yaml
  env:
    # ... existing vars ...
    - name: REDIS_PASSWORD
      valueFrom:
        secretKeyRef:
          name: redis-credentials
          key: password
  ```
  (And create a Secret for the password - see Issue 8.)

### Issue 6: user-service Service targetPort mismatch

- **File:** `user-service.yaml`
- **What is wrong:** The Service has `targetPort: 8080` but the user-service container listens on port `3001`.
- **Why it causes a problem:** Traffic arriving at the Service on port 3001 is forwarded to port 8080 on the pod, where nothing is listening. All requests to user-service fail with connection refused. The api-gateway gets 502 errors when proxying to user-service.
- **How to fix it:**
  ```yaml
  ports:
    - port: 3001
      targetPort: 3001  # was: 8080
  ```

### Issue 7: user-service liveness probe failureThreshold too aggressive

- **File:** `user-service.yaml`
- **What is wrong:** `failureThreshold: 1` on the liveness probe means a single failed health check triggers a pod restart.
- **Why it causes a problem:** Any transient issue (a slow response, brief GC pause, or momentary network blip) causes an immediate restart. Combined with `periodSeconds: 5`, the pod has only one 5-second window before being killed. This leads to excessive restarts and potential `CrashLoopBackOff`.
- **How to fix it:**
  ```yaml
  livenessProbe:
    httpGet:
      path: /health/live   # also fix the path (see Issue 9)
      port: 3001
    initialDelaySeconds: 5
    periodSeconds: 10
    failureThreshold: 3     # was: 1
  ```

### Issue 8: Secrets stored in ConfigMap

- **File:** `configmap.yaml`
- **What is wrong:** `REDIS_PASSWORD: "supersecret"` and `DATABASE_URL: "postgresql://admin:p4ssw0rd@db:5432/app"` are stored in a ConfigMap in plaintext.
- **Why it causes a problem:** ConfigMaps are not encrypted and are visible to anyone with read access to the namespace. This violates security best practices: passwords and connection strings with credentials should never be in ConfigMaps. They're also stored in plain text in etcd. Additionally, the `DATABASE_URL` references a PostgreSQL database that doesn't exist in this stack, likely leftover config or a copy-paste error.
- **How to fix it:** Move sensitive values to a Kubernetes Secret (or use an external secrets manager):
  ```yaml
  apiVersion: v1
  kind: Secret
  metadata:
    name: app-secrets
    namespace: devops-challenge
  type: Opaque
  stringData:
    REDIS_PASSWORD: "supersecret"
  ```
  Remove `REDIS_PASSWORD` and `DATABASE_URL` from the ConfigMap entirely.

### Issue 9: user-service liveness probe uses wrong endpoint

- **File:** `user-service.yaml`
- **What is wrong:** The liveness probe path is `/health` instead of `/health/live`.
- **Why it causes a problem:** The `/health` endpoint is a general status check. The `/health/live` endpoint is the dedicated liveness endpoint, designed to be lightweight and only confirm the process is alive. Using `/health` for liveness is not ideal but functional. However, the correct pattern is to use `/health/live` for liveness and `/health/ready` for readiness, as the application already implements both.
- **How to fix it:**
  ```yaml
  livenessProbe:
    httpGet:
      path: /health/live  # was: /health
      port: 3001
  ```

---

## Summary

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | **Critical** | api-gateway.yaml | Selector/label mismatch - Deployment rejected |
| 2 | Medium | api-gateway.yaml | containerPort 8080 vs app listening on 3000 |
| 3 | **Critical** | api-gateway.yaml | Memory limit 64Mi OOMKills Node.js |
| 4 | **Critical** | user-service.yaml | REDIS_HOST `redis-master` - wrong Service name |
| 5 | **Critical** | user-service.yaml | Missing REDIS_PASSWORD - auth fails |
| 6 | **Critical** | user-service.yaml | Service targetPort 8080 - nothing listening |
| 7 | High | user-service.yaml | failureThreshold: 1 - excessive restarts |
| 8 | High | configmap.yaml | Passwords in ConfigMap - security violation |
| 9 | Low | user-service.yaml | Liveness probe on /health instead of /health/live |

**Root cause chain:** Even if Issues 1 and 3 were fixed so api-gateway starts, it proxies to user-service via `http://user-service:3001`. Issue 6 means that traffic hits port 8080 on the pod (nothing there). Even if Issue 6 were fixed, Issue 4 means Redis is unreachable (wrong hostname), and Issue 5 means auth fails even with the right host. The entire application chain is broken at multiple levels.
