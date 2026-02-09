# Troubleshooting Report: Broken Production Deployment

## Summary

Analysis of the broken manifests in `k8s/broken/` identified **10 critical issues** that prevent the application from functioning correctly.

---

## Issue #1: Label Mismatch in API Gateway Deployment

**File:** `k8s/broken/api-gateway.yaml`

**What is wrong:**
```yaml
spec:
  selector:
    matchLabels:
      app: api-gateway  # Selector expects 'api-gateway'
  template:
    metadata:
      labels:
        app: gateway    # Pod has label 'gateway'
```

**Why it causes a problem:**
The Deployment controller cannot find matching pods. No pods will be created, the Service will have no endpoints, and users will get 503 errors.

**How to fix it:**
```yaml
template:
  metadata:
    labels:
      app: api-gateway  # Must match selector
```

---

## Issue #2: Wrong Container Port in API Gateway

**File:** `k8s/broken/api-gateway.yaml`

**What is wrong:**
```yaml
containers:
  - ports:
      - containerPort: 8080  # Declared as 8080
    env:
      - name: PORT
        value: "3000"        # But app listens on 3000
```

**Why it causes a problem:**
While the app works, this creates confusion for monitoring tools, service meshes, and debugging. The declared port doesn't match reality.

**How to fix it:**
```yaml
ports:
  - containerPort: 3000  # Match actual application port
```

---

## Issue #3: Insufficient Memory Limit for Node.js

**File:** `k8s/broken/api-gateway.yaml`

**What is wrong:**
```yaml
resources:
  limits:
    memory: "64Mi"  # Too low for Node.js
```

**Why it causes a problem:**
Node.js runtime needs ~30-50MB alone. With application code, 64MB is insufficient. Pods will be OOMKilled and restart in a crash loop.

**How to fix it:**
```yaml
resources:
  requests:
    memory: "128Mi"
  limits:
    memory: "256Mi"  # Minimum for Node.js apps
```

---

## Issue #4: Wrong Redis Hostname in User Service

**File:** `k8s/broken/user-service.yaml`

**What is wrong:**
```yaml
env:
  - name: REDIS_HOST
    value: "redis-master"  # Wrong hostname
```

**Why it causes a problem:**
The Redis Service is named `redis`, not `redis-master`. DNS lookup fails, user-service cannot connect to Redis, readiness probe fails, and no traffic is routed to the pod.

**How to fix it:**
```yaml
env:
  - name: REDIS_HOST
    value: "redis"  # Match the Service name
```

---

## Issue #5: Overly Aggressive Liveness Probe

**File:** `k8s/broken/user-service.yaml`

**What is wrong:**
```yaml
livenessProbe:
  failureThreshold: 1  # Only 1 failure allowed
```

**Why it causes a problem:**
A single failed health check (e.g., during GC or CPU spike) will restart the container. This creates unnecessary restarts and service instability.

**How to fix it:**
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3001
  initialDelaySeconds: 15
  periodSeconds: 20
  timeoutSeconds: 3
  failureThreshold: 3  # Allow 3 consecutive failures
```

---

## Issue #6: Service Port Mismatch in User Service

**File:** `k8s/broken/user-service.yaml`

**What is wrong:**
```yaml
# In Deployment
ports:
  - containerPort: 3001

# In Service
ports:
  - port: 3001
    targetPort: 8080  # Wrong! Should be 3001
```

**Why it causes a problem:**
Traffic is routed to port 8080 on the pod, but the container listens on 3001. All requests fail with connection refused errors.

**How to fix it:**
```yaml
ports:
  - port: 3001
    targetPort: 3001  # Must match containerPort
```

---

## Issue #7: Redis Password Mismatch

**File:** `k8s/broken/redis.yaml`

**What is wrong:**
```yaml
command: ["redis-server", "--requirepass", "supersecret"]
```

**Why it causes a problem:**
Redis requires authentication, but the user-service application doesn't provide a password. All Redis connections are rejected with "NOAUTH Authentication required" error.

**How to fix it:**

**Option 1 (Recommended):** Remove password requirement
```yaml
# Remove the command entirely
# Rely on Network Policies for security
```

**Option 2:** Add password to application
```yaml
# In user-service Deployment
env:
  - name: REDIS_PASSWORD
    valueFrom:
      secretKeyRef:
        name: redis-secret
        key: password
```

---

## Issue #8: Sensitive Data in ConfigMap

**File:** `k8s/broken/configmap.yaml`

**What is wrong:**
```yaml
data:
  REDIS_PASSWORD: "supersecret"
  DATABASE_URL: "postgresql://admin:p4ssw0rd@db:5432/app"
```

**Why it causes a problem:**
ConfigMaps are not encrypted and are visible to anyone with namespace read access. This is a security vulnerability and violates compliance requirements.

**How to fix it:**
```yaml
# Move to Secret
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
stringData:
  REDIS_PASSWORD: "supersecret"
  DATABASE_URL: "postgresql://admin:p4ssw0rd@db:5432/app"
```

Then reference in Deployment:
```yaml
env:
  - name: REDIS_PASSWORD
    valueFrom:
      secretKeyRef:
        name: app-secrets
        key: REDIS_PASSWORD
```

---

## Issue #9: Missing Environment Variable References

**File:** `k8s/broken/user-service.yaml` and `k8s/broken/api-gateway.yaml`

**What is wrong:**
```yaml
# Environment variables are hardcoded
env:
  - name: PORT
    value: "3001"
```

**Why it causes a problem:**
Configuration is duplicated between ConfigMap and Deployment. Changes to ConfigMap don't affect running pods. This creates configuration drift and makes environment-specific overrides difficult.

**How to fix it:**
```yaml
env:
  - name: PORT
    valueFrom:
      configMapKeyRef:
        name: app-config
        key: USER_SERVICE_PORT
```

---

## Issue #10: Insufficient Redis Resources

**File:** `k8s/broken/redis.yaml`

**What is wrong:**
```yaml
resources:
  requests:
    memory: "64Mi"
  limits:
    memory: "128Mi"
```

**Why it causes a problem:**
Redis is a critical dependency. 64Mi memory is insufficient for any meaningful dataset. Redis may be evicted under memory pressure or OOMKilled, causing data loss.

**How to fix it:**
```yaml
resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

---

## Issues by Severity

### Critical (Application Non-Functional)
1. Label mismatch - No pods created
2. Wrong Redis hostname - Cannot connect to database
3. Service port mismatch - Traffic routing fails
4. Redis password mismatch - Authentication fails

### High (Stability Issues)
5. Insufficient memory - OOMKilled pods
6. Aggressive liveness probe - Unnecessary restarts
7. Low Redis resources - Performance degradation

### Medium (Security & Best Practices)
8. Secrets in ConfigMap - Security vulnerability
9. Hardcoded environment variables - Configuration management issues
10. Wrong containerPort - Misleading configuration

---

## Verification Commands

After fixing all issues:

```bash
# Check all pods are Running and Ready
kubectl get pods -n devops-challenge

# Check Service endpoints
kubectl get endpoints -n devops-challenge

# Test API Gateway
kubectl port-forward svc/api-gateway 3000:80 -n devops-challenge
curl http://localhost:3000/health
curl http://localhost:3000/api/users

# Check logs for errors
kubectl logs -l app=api-gateway -n devops-challenge --tail=50
kubectl logs -l app=user-service -n devops-challenge --tail=50

# Check events
kubectl get events -n devops-challenge --sort-by='.lastTimestamp'
```

---
