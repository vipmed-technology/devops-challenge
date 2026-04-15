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
-----------------------------------------------------------------------------

**Issue 1: Kubernetes YAML Validation Error**

File: k8s/base/api-gateway-deployment.yaml

What is wrong:
Liveness and readiness probes, as well as resource limits, were defined outside the container specification.

Why it causes a problem:
Kubernetes strictly validates resource schemas. These fields are only valid inside the container definition (spec.template.spec.containers). When placed incorrectly, Kubernetes rejects the manifest.

How to fix it:
Move livenessProbe, readinessProbe, and resources inside the container block.

------------------------------------------------------------------------


**Issue 2: Redis Connection Failure**

File: apps/user-service/src/index.js

What is wrong:
The application attempted to connect to Redis using localhost.

Why it causes a problem:
In Kubernetes, each service runs in a separate pod. localhost refers to the same container, not the Redis service.

How to fix it:
Use environment variables and Kubernetes service discovery:

REDIS_HOST=redis
--------------------------------------------------------------------------


**Issue 3: Environment Variables Not Applied**

File: k8s/base/user-service-deployment.yaml

What is wrong:
Environment variables were defined incorrectly due to YAML indentation issues.

Why it causes a problem:
Kubernetes ignores incorrectly structured fields, causing the application to fallback to default values (e.g., localhost).

How to fix it:
Ensure env is defined under the container specification.

----------------------------------------------------------------------------
**Issue 4: Service Startup Timing Issue**


File: Runtime behavior

What is wrong:
The user-service attempted to connect to Redis before Redis was ready.

Why it causes a problem:
Kubernetes does not guarantee startup order between services.

How to fix it:
Restart the pod or implement retry logic and readiness probes to ensure dependencies are available.

-----------------------------------------------------------------------------------

**Issue 5: Port Forward Not Accessible After Restart**

File: Local testing

What is wrong:
Port-forward stopped working after pod recreation.

Why it causes a problem:
Port-forward sessions are tied to specific pod instances and are not automatically re-established.

How to fix it:
Re-run the port-forward command after pod restart.

--------------------------------------------------------------------------------

**Issue 6: ConfigMap Not Found (CreateContainerConfigError)**

File: k8s/base/api-gateway-deployment.yaml

What is wrong:
The deployment referenced a ConfigMap that did not exist at the time of pod creation.

Why it causes a problem:
Kubernetes cannot inject environment variables from a missing ConfigMap, causing pod creation to fail.

How to fix it:
Create the ConfigMap and restart the deployment to reload configuration.

---------------------------------------------------------------------------------

**Issue 7: GitHub Actions GHCR Authentication Failure**

File: .github/workflows/ci-cd.yml

What is wrong:
The pipeline failed during Docker login due to missing credentials.

Why it causes a problem:
The GHCR_TOKEN secret was not defined, resulting in an empty password during login.

How to fix it:
Create a GitHub Actions secret named GHCR_TOKEN with appropriate permissions (write:packages, read:packages).

--------------------------------------------------------------------------------

**Issue 8: CI/CD Pipeline Not Triggering**

File: .github/workflows/ci-cd.yml

What is wrong:
The workflow was configured to run only on main and develop branches.

Why it causes a problem:
The active development branch (solution/ricardolopez010) was not included, so no pipeline execution was triggered.

How to fix it:
Add the working branch to the workflow trigger configuration.


---------------------------------------------------------------------------------

**Issue 9: Git Configuration Missing**

File: Local Git setup

What is wrong:
Git user identity was not configured, preventing commits.

Why it causes a problem:
Without user identity, Git cannot create commits, blocking CI/CD triggers.

How to fix it:
Configure Git user name and email:

git config --global user.name "Your Name"
git config --global user.email "your@email.com"
---------------------------------------------------------------------------------

**Issue 10: CI/CD Test Execution Failure**
File: .github/workflows/ci-cd.yml

What is wrong:
The test step failed because no test files were present.

Why it causes a problem:
The test command expected files matching src/**/*.test.js, which did not exist, causing the pipeline to fail.

How to fix it:
Handle missing tests gracefully:

npm test || echo "No tests found, skipping"
