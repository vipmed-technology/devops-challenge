# Troubleshooting Report

* Issue 1: Label Mismatch in API Gateway

- File: `api-gateway.yaml`
- What is wrong: The Deployment selector uses `app: api-gateway` but the Pod template has label `app: gateway`
- Why it causes a problem: The selector cannot match any pods, so the Deployment creates no pods and the service has no endpoints. Users get connection refused errors.
- How to fix it: Change the Pod template label from `app: gateway` to `app: api-gateway` to match the selector

* Issue 2: Wrong Container Port in API Gateway

- File: `api-gateway.yaml`
- What is wrong: The containerPort is set to 8080, but the environment variable `PORT=3000` means the application actually listens on port 3000
- Why it causes a problem: Kubernetes documentation field is misleading. While the app still listens on 3000 (which the Service correctly targets), the containerPort should match for clarity and proper monitoring.
- How to fix it: Change `containerPort` from 8080 to 3000

* Issue 3: Insufficient Memory Limit for Node.js

- File: `api-gateway.yaml`
- What is wrong: Memory limit is only 64Mi for a Node.js application
- Why it causes a problem: Node.js runtime typically requires at least 128-256Mi. The pod will be OOMKilled (Out Of Memory Killed) repeatedly, causing crashes and restarts.
- How to fix it: Increase memory limits to at least 256Mi (requests: 128Mi, limits: 256Mi or higher)

* Issue 4: Wrong Redis Hostname

- File: `user-service.yaml`
- What is wrong: The `REDIS_HOST` environment variable is set to `redis-master`, but the Redis Service is named `redis`
- Why it causes a problem: User service cannot connect to Redis because DNS lookup for `redis-master` fails. All user operations fail with connection errors.
- How to fix it: Change `REDIS_HOST` value from `redis-master` to `redis`

* Issue 5: Overly Aggressive Liveness Probe

- File: `user-service.yaml`
- What is wrong: The liveness probe has `failureThreshold: 1`, meaning a single failed health check causes pod restart
- Why it causes a problem: Temporary issues (network hiccup, brief Redis connection delay, GC pause) will trigger immediate restarts, causing instability and cascading failures.
- How to fix it: Increase `failureThreshold` to 3 or higher to tolerate transient failures

* Issue 6: Service Port Mismatch

- File: `user-service.yaml`
- What is wrong: The Service `targetPort` is 8080 but the container `containerPort` is 3001
- Why it causes a problem: The Service forwards traffic to port 8080 on the pods, but nothing is listening there. All requests to user-service fail with connection refused.
- How to fix it: Change Service `targetPort` from 8080 to 3001

* Issue 7: Redis Authentication Mismatch

- File: `redis.yaml`
- What is wrong: Redis is started with `--requirepass supersecret`, requiring authentication, but the user-service doesn't provide any password when connecting
- Why it causes a problem: User service gets authentication errors when trying to connect to Redis. All Redis operations fail with "NOAUTH Authentication required" errors.
- How to fix it: Either remove `--requirepass` from Redis command (for dev/test) or configure user-service with REDIS_PASSWORD environment variable and update the Redis client to use authentication

* Issue 8: Sensitive Data in ConfigMap

- File: `configmap.yaml`
- What is wrong: Sensitive data like `REDIS_PASSWORD: "supersecret"` and `DATABASE_URL` with embedded credentials are stored in a ConfigMap
- Why it causes a problem: ConfigMaps are not encrypted at rest and can be read by anyone with access to the namespace. This is a security vulnerability exposing credentials.
- How to fix it:
  - Create a Secret instead: `kubectl create secret generic app-secrets --from-literal=REDIS_PASSWORD=supersecret`
  - Move all sensitive values to the Secret
  - Reference them in pod specs using `envFrom.secretRef` or individual `valueFrom.secretKeyRef`
  - Remove sensitive data from the ConfigMap

* Summary

Found 8 critical issues across the broken manifests:
- 3 configuration mismatches (labels, ports, hostnames)
- 2 resource allocation problems (memory limits, probe thresholds)
- 3 security/authentication issues (Redis auth, secrets in configmap)

All issues would prevent the application from functioning properly in production and must be resolved before deployment.
