# Troubleshooting Report

> **Note to Candidate:** Document all the issues you found in the `k8s/broken/` manifests.

## Issues Found

### Issue 1: Deployment Label Mismatch

- **File:** `api-gateway.yaml` (Deployment)
- **What is wrong:** The Deployment `selector.matchLabels` is looking for `app: api-gateway`, but the pod template is labeled as `app: gateway`.
- **Why it causes a problem:** The ReplicaSet created by the Deployment relies on labels to track its Pods. Because the labels don't match, the ReplicaSet will never "see" the pods it creates and will get stuck in an infinite creation loop or fail to manage them.
- **How to fix it:** Change the template label to match the selector: `app: api-gateway`.

### Issue 2: Service TargetPort Mismatch

- **File:** `user-service.yaml` (Service)
- **What is wrong:** The Service routes traffic to `targetPort: 8080`, but the User Service container is actually configured to listen on port `3001`.
- **Why it causes a problem:** When the API Gateway tries to communicate with the User Service, the Kubernetes Service will forward the traffic to a closed port inside the pod, resulting in "Connection Refused" (502 Bad Gateway) errors.
- **How to fix it:** Change the `targetPort` in the User Service manifest to `3001`.

### Issue 3: Wrong DNS Hostname for Redis

- **File:** `user-service.yaml` (Deployment)
- **What is wrong:** The environment variable `REDIS_HOST` is set to `redis-master`.
- **Why it causes a problem:** The Redis Service defined in `redis.yaml` is simply named `redis`. Kubernetes internal DNS will not be able to resolve `redis-master`, causing the User Service to crash on startup because it cannot connect to the database.
- **How to fix it:** Change the `REDIS_HOST` value to `redis`.

### Issue 4: Hardcoded Secrets in ConfigMap

- **File:** `configmap.yaml`
- **What is wrong:** Sensitive data like `REDIS_PASSWORD` and `DATABASE_URL` are stored in plain text inside a ConfigMap.
- **Why it causes a problem:** This is a major security vulnerability. ConfigMaps are not encrypted by default, meaning anyone with read access to the namespace (or access to the git repository) can see the production database passwords.
- **How to fix it:** Remove sensitive keys from the ConfigMap and move them to a Kubernetes `Secret`. Reference them in the deployments using `valueFrom: secretKeyRef`.

### Issue 5: Unused Configuration Variables

- **File:** `configmap.yaml`, `api-gateway.yaml`, `user-service.yaml`
- **What is wrong:** The `app-config` ConfigMap is created, but neither the API Gateway nor the User Service mounts it. Instead, they use hardcoded `env` blocks.
- **Why it causes a problem:** Hardcoding values directly in the Deployment violates the "12-Factor App" methodology. It makes it impossible to reuse the same Deployment manifest across different environments (dev, prod) using Kustomize without duplicating code.
- **How to fix it:** Remove the hardcoded `env` items in the Deployments and use `envFrom: - configMapRef: name: app-config`.

### Issue 6: Overly Aggressive Liveness Probe

- **File:** `user-service.yaml` (Deployment)
- **What is wrong:** The `livenessProbe` has a `failureThreshold: 1`.
- **Why it causes a problem:** If the Node.js event loop blocks for a fraction of a second (e.g., during garbage collection) and misses exactly one ping, Kubernetes will mercilessly kill and restart the pod, causing unnecessary downtime.
- **How to fix it:** Increase the `failureThreshold` to at least `3` (which is the Kubernetes default) to allow for minor transient network blips.

### Issue 7: Container Port Documentation Mismatch

- **File:** `api-gateway.yaml` (Deployment)
- **What is wrong:** The `containerPort` is declared as `8080`, but the application uses `PORT=3000`.
- **Why it causes a problem:** While Kubernetes networking primarily relies on the Service's `targetPort` to route traffic, declaring the wrong `containerPort` is highly misleading for engineers and breaks tools like Istio or Network Policies that rely on accurate port declarations.
- **How to fix it:** Change `containerPort` to `3000`.

### Issue 8: Mutable Image Tags (Anti-Pattern)

- **File:** `api-gateway.yaml` and `user-service.yaml` (Deployments)
- **What is wrong:** Both services pull the `devops-challenge/xxx:latest` image.
- **Why it causes a problem:** Using `:latest` in production is a critical anti-pattern. If a node fails and a pod is rescheduled, Kubernetes might pull a newer version of the image without warning, leading to version drift (replicas running different code) and making reliable rollbacks impossible.
- **How to fix it:** Update the CD pipeline to inject an immutable tag, such as the Git commit SHA (e.g., `:a1b2c3d`) or a semantic version (e.g., `:v1.0.0`).

### Issue 9: Hardcoded Password in Container Command

- **File:** `redis.yaml` (Deployment)
- **What is wrong:** The Redis password `"supersecret"` is passed in plain text directly into the container's `command` array.
- **Why it causes a problem:** Like the ConfigMap issue, this exposes sensitive credentials to version control and anyone who can read the Deployment manifest.
- **How to fix it:** Pass the password securely by using an environment variable (`env`) that pulls from a Kubernetes `Secret`, and modify the command to reference that variable.

### Issue 10: Missing Persistent Storage (Data Loss Risk)

- **File:** `redis.yaml` (Deployment)
- **What is wrong:** The Redis deployment acts as a database but has no `volumeMounts` or `PersistentVolumeClaim` (PVC) configured.
- **Why it causes a problem:** Containers are ephemeral by nature. Without persistent storage, if the Redis pod crashes, restarts, or is evicted to another node, all user data stored in memory/disk will be permanently lost.
- **How to fix it:** Add a `PersistentVolumeClaim` to the namespace and mount it inside the Redis container (usually at `/data`) to ensure data outlives the pod's lifecycle.