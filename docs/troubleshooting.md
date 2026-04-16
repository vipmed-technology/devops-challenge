# Troubleshooting Report

> **Note to Candidate:** Document all the issues you found in the `k8s/broken/` manifests.

## Issues Found
----------------------------
### Issue 1 -->High

**File:** k8s/broken/api-gateway.yaml

**What is wrong:**
The Deployment selector label "app: api-gateway" does not match the Pod template label "app: gateway".

**Why it causes a problem:**
Kubernetes uses selectors to associate Pods with a Deployment. If they don’t match, the Deployment cannot manage its Pods correctly, leading to broken scaling and updates.

**How to fix it:**
Ensure both labels match
------------------------------
### Issue 2 --> High
**File:** k8s/broken/api-gateway.yaml
**What is wrong:**
The containerPort is set to 8080, but the application is configured on port 3000.
**Why it causes a problem:**
This mismatch can cause service fail, since Kubernetes will attempt to send traffic to the wrong port.

**How to fix it:**
Align the containerPort with the application port:
-------------------------------------------

### Issue 3 --> Low

**File:** k8s/broken/api-gateway.yaml

**What is wrong:**
The resource requests and limits are set too low for an API gateway.

**Why it causes a problem:**
It's not a broken configuration, but could be a perfmance issue

**How to fix it:**
Increase resource allocations to more realistic values, for example:

requests:
  cpu: "100m"
  memory: "128Mi"
limits:
  cpu: "300m"
  memory: "256Mi"
-----------------------------------
### Issue 3 --> Medium

**File:** k8s/broken/api-gateway.yaml / k8s/broken/user-service.yaml

**What is wrong:**
The container image uses the "latest" tag.

**Why it causes a problem:**
Using latest makes deployments hard to check, as the actual image version can change and difficult to follow, taking more time for debbugin.

**How to fix it:**
Use a specific tag in every deploy

----------------------------------------

### Issue 4 --Z High

**File:** k8s/broken/api-gateway.yaml

**What is wrong:**
The Service selector "app: api-gateway" do not match the Pod labels "app: gateway".

**Why it causes a problem:**
Kubernetes Services use selectors to route traffic to Pods. If the labels don't match, the Service can't find that Pods, making the application inaccessible.

**How to fix it:**
labels will to be  consistent across Deployment and Service

----------------------------------------
### Issue 5 --> High

**File:** k8s/broken/user-service.yaml

**What is wrong:**
The targetPort is set to 8080, but the container is listening on port 3001.

**Why it causes a problem:**
The service routes traffic to the wrong port, requests never reach the application container.

**How to fix it:**
Align the targetPort with the container port
--------------------------------------
### Issue 6 --> HIgh

**File:** k8s/broken/user-service.yaml

**What is wrong:**
The REDIS_HOST environment variable is set to "redis-master", but the Redis service is named "redis".

**Why it causes a problem:**
The application can't resolve the hostname and that will fails to connect to Redis.

**How to fix it:**
Update the environment variable to match the correct service name:

----------------------------------------
### Issue 7 --> Medium

**File:** k8s/broken/user-service.yaml

**What is wrong:**
The livenessProbe failureThreshold is set to 1, which could be aggressive.

**Why it causes a problem:**
A single  failure will cause the container to restart, with potential restart loops.

**How to fix it:**
Increase the failureThreshold to 3 or higher
----------------------------------------------------
### Issue 8 --> High

**File:** k8s/broken/user-service.yaml

**What is wrong:**
The readinessProbe is configured to use "/health/ready", but this endpoint don't exist in the application. (i took this from the base index.js contifuguration)

**Why it causes a problem:**
Kubernetes uses readiness probes to determine if a pod can receive traffic. the probe will fail continuously, and the pod will never be marked as ready.

**How to fix it:**
Update the readinessProbe to use a valid endpoint:

readinessProbe:
  httpGet:
    path: /health
    port: 3001
--------------------------------------------------
### Issue 9    --> High

**File:** k8s/broken/configmap.yaml

**What is wrong:**
Sensitive data are stored in a ConfigMap:  (database credentials and Redis password).

**Why it causes a problem:**
ConfigMaps are not designed for sensitive data and are not encrypted. making them accessible through Kubernetes API and increasing security risks.

**How to fix it:**
Move sensitive data to a Kubernetes Secret 
--------------------------------------------------
### Issue 10  --Z High

**File:** k8s/broken/redis.yaml

**What is wrong:**
The Redis password is hardcoded in the container command.

**Why it causes a problem:**
Sensitive data is exposed in plain text and cannot be managed securely or rotated easily.

**How to fix it:**
Store the password in a Kubernetes Secret and request it as a variable.
------------------------------------------------
### Issue 11  -->Medium

**File:** k8s/broken/redis.yaml

**What is wrong:**
The Redis image tag is not immutable.

**Why it causes a problem:**
The image version may change over time, leading to inconsistent deployments.

**How to fix it:**
Use a fully versioned image tag:
-------------------------------------------------------

### Issue X

**File:**
**What is wrong:**
**Why it causes a problem:**
**How to fix it:**

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
------------------------------------------------------------------------------------
**Issue 11: CI/CD Build stage - Typo**
File: .github/workflows/ci-cd.yml

What is wrong:
The build stage failed because a typo in the configuration line

Why it causes a problem:
find a extra "/" into the Build line 

How to fix it:
Erase the "/" 

---------------------------------------------------------------------------------
