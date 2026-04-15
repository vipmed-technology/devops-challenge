# Troubleshooting Report

> **Note to Candidate:** Document all the issues you found in the `k8s/broken/` manifests.

## Issues Found

### Issue 1

- **File:**
- **What is wrong:**
- **Why it causes a problem:**
- **How to fix it:**



## Issue 2

- **File:**
- **What is wrong:**
- **Why it causes a problem:**
- **How to fix it:**

### Issue 3

- **File:**
- **What is wrong:**
- **Why it causes a problem:**
- **How to fix it:**

<!-- Add more issues as you find them -->
----------------------------------------------------------------------------------
### Issue: Environment variables not applied

**What is wrong:**
The REDIS_HOST environment variable was missing inside the container.

**Why it causes a problem:**
The application defaults to localhost, which is incorrect in Kubernetes since Redis runs in a separate pod.

**How to fix it:**
Correct the YAML indentation and ensure environment variables are defined under the container spec, then redeploy.
----------------------------------------------------------
### Issue: Service startup dependency timing

**What is wrong:**
The user-service attempted to connect to Redis before it was fully ready.

**Why it causes a problem:**
Kubernetes does not guarantee startup order, leading to connection failures during initialization.

**How to fix it:**
Restart the pod or implement retry logic and readiness checks to ensure dependencies are available.
-----------------------------------------------------------
### Issue: Port-forward connection lost after pod restart

**What is wrong:**
The port-forward stopped working after the pod was restarted.

**Why it causes a problem:**
Port-forward sessions are tied to specific pod instances and do not automatically reconnect.

**How to fix it:**
Restart the port-forward command after the pod is recreated.
-----------------------------------------------------------

### Issue: Redis connection failure

**What is wrong:**
The application initially failed to connect to Redis.

**Why it causes a problem:**
The service was trying to connect to localhost instead of the Redis service inside Kubernetes.

**How to fix it:**
Configured REDIS_HOST to use the Kubernetes service name "redis".
-------------------------------------------------------------------
### Issue: Invalid probe and resource configuration

**What is wrong:**
Liveness, readiness probes and resource limits were defined outside the container spec.

**Why it causes a problem:**
Kubernetes does not recognize these fields unless they are defined inside the container definition.

**How to fix it:**
Move the configuration under spec.template.spec.containers.

------------------------------------------------------------------------------------------------
### YAML Validation

**Approach:**
Used yamllint to validate Kubernetes manifests before applying them.

**Why:**
Helps detect structural and indentation issues early, reducing deployment errors.

**Trade-off:**
Does not validate Kubernetes-specific schema, only YAML syntax.

-------------------------------------------------------------------------------------------
### Issue: CreateContainerConfigError due to missing ConfigMap

**What is wrong:**
The application failed to start because the referenced ConfigMap was not available.

**Why it causes a problem:**
Kubernetes cannot inject environment variables from a non-existent ConfigMap.

**How to fix it:**
Ensure the ConfigMap is defined and included in kustomization.yaml before applying the deployment.
----------------------------------------------------------------------------------------
### Issue: Pod failed after ConfigMap creation

**What is wrong:**
The pod failed because the ConfigMap did not exist at startup time.

**Why it causes a problem:**
Kubernetes does not automatically update existing pods when a new ConfigMap is created.

**How to fix it:**
Restart the deployment to recreate pods with the updated configuration.
---------------------------------------------------------------------------------------------


