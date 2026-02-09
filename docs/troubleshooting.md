# Troubleshooting Report

> **Note to Candidate:** Document all the issues you found in the `k8s/broken/` manifests.

## Issues Found

### Issue 1

- **File:** `k8s/broken/api-gateway.yaml`
- **What is wrong:** Deployment selector uses `app: api-gateway` but pod template label is `app: gateway`.
- **Why it causes a problem:** The Deployment selector does not match the pod labels, so it will not manage any pods and the Service will not route traffic.
- **How to fix it:** Set the pod template label to `app: api-gateway` to match the selector.

### Issue 2

- **File:** `k8s/broken/api-gateway.yaml`
- **What is wrong:** `containerPort` is `8080` but the app listens on `3000`.
- **Why it causes a problem:** Port metadata is wrong and breaks probe/port expectations.
- **How to fix it:** Change `containerPort` to `3000`.

### Issue 3

- **File:** `k8s/broken/user-service.yaml`
- **What is wrong:** Service `targetPort` is `8080` but the container listens on `3001`.
- **Why it causes a problem:** The Service sends traffic to a non-listening port, so requests fail.
- **How to fix it:** Set `targetPort: 3001`.

<!-- Add more issues as you find them -->
