
# Architecture Documentation

## System Architecture

The application is a microservices setup deployed on Kubernetes:

**API Gateway (Node.js)**:.Receives client requests and forwards them to the user-service
**User Service (Node.js)**: User data and business logic.
**Redis**: Stores user data.
**Kubernetes (kind cluster)**: Runs and manages the containers.
**GitHub Actions**: Builds and pushes Docker images.
**GitHub Container Registry (GHCR)**: Stores the images.

**Flow:**
Client → API Gateway → User Service → Redis
---

## Docker Strategy

###Base image choice(Alpine):

Used Node.js base images to keep compatibility and simplicity.

### Build approach:

Used multi-stage builds to separate dependency installation from runtime image.

### Security considerations:

* Containers run as non-root user
* ".dockerignore" used to avoid unnecessary files

### Optimization:

Dependencies are installed before copying source code to improve caching.

---

## Kubernetes Design

### Namespace:

Used default namespace to keep the setup simple.

### Resources:

Defined basic CPU and memory requests/limits to avoid overconsumption.

### Health checks:

**Liveness probe**: checks if container should be restarted
**Readiness probe**: checks if service is ready to receive traffic

### Scaling:

Application is stateless and could be scaled horizontally (HPA defined conceptually).

---

## CI/CD Pipeline

### Pipeline steps:

1. Checkout code
2. Login to GHCR (Creating Token in Github and test Secrets)
3. Build Docker images
4. Run tests (skipped if not present)
5. Push images (9 workflow runs)

### Deployment:

Deployment is done manually using "kubectl apply".

### Rollback:

Images are tagged with commit SHA, allowing rollback to previous versions.

### Secrets:

Used GitHub Actions secrets for authentication.

---

## Image Tagging Strategy

### Decision:

Used:

* latest for simplicity
* commit SHA for traceability

### Why:

Allows identifying exactly which version is running.

---

## Environment & Configuration

### Config management:

* Used environment variables
* ConfigMaps for non-sensitive values

### Secrets:

* Not fully implemented, but would use Kubernetes Secrets in production or GitHubSecrets

### Environments:

Basic separation using branches (dev vs main).

---

## Monitoring Strategy

### Metrics:

Basic application metrics via "/metrics" endpoint (Prometheus-ready).

### Logging:

Simple structured logging using JSON format.

### Alerts (conceptual):

* High error rate
* Service not responding
* High latency

---

## Trade-offs & Assumptions

### Trade-off:

**Manual deployment instead of full automation**
To keep the solution simple within time limits.

---

### Trade-off:

**Basic monitoring instead of full stack**
Focused on functionality over completeness, Service ready to receive metrics in ELK or another solution.

---

### Trade-off:

**Public images instead of private registry**
Avoided additional configuration complexity.

---

## Security Considerations

* No secrets hardcoded
* Minimal container configuration

---

## What I Would Improve With More Time

* Automate deployment (CD)
* Add Prometheus and Grafana
* Improve test coverage
* Add better secret management
* Implement GitOps (ArgoCD)
* Use Trivy or Snyk for Analysis
* Create a Draw documentation of this enviroment
---

## Time Spent

| Task            | Time  |
| --------------- | ----- |
| Docker          | ~2h   |
| Kubernetes      | ~3h   |
| CI/CD           | ~2h   |
| Monitoring      | ~1h   |
| Troubleshooting | ~2.5h |
| Documentation   | ~1.5h   |
| **Total**       | ~12h  |

----------------------------------------------------------------------------------
### Repository Setup

**Decision:**
Cloned the provided repository and worked on a dedicated solution branch.

**Why:**
Ensures alignment with the original structure and facilitates clean submission via pull request.

**Trade-off:**
Requires careful management of changes to avoid breaking existing code.
------------------------------------------------------------------------------

### Repository Initialization

**Decision:**
Cloned the provided repository and created a dedicated solution branch.

**Why:**
Maintains the original project structure and enables clean version control for the challenge.

**Trade-off:**
Requires careful tracking of changes to avoid conflicts with the base repository.

------------------------------------------------------------------------------
### API Gateway Docker Strategy

**Decision:**
Used a multi-stage Docker build with node:20-alpine and a non-root user.

**Why:**
Reduces image size and improves security by avoiding root execution.

**Trade-off:**
Alpine images may have compatibility limitations with native dependencies.
---------------------------------------------------------------------------------
### User Service Docker Strategy

**Decision:**
Applied the same multi-stage Docker build strategy as the API Gateway.

**Why:**
Maintains consistency across services and simplifies maintenance.

**Trade-off:**
Duplicated configuration instead of abstracting a shared base image.

------------------------------------------------------------------------------

### Local Development Validation

**Decision:**
Used docker-compose to validate service interaction before deploying to Kubernetes.

**Why:**
Ensures that all services communicate correctly and reduces debugging complexity in later stages.

**Trade-off:**
Docker Compose does not fully replicate Kubernetes behavior but provides a fast feedback loop.

-----------------------------------------------------------------------------------------
### Service Integration Validation

**Decision:**
Tested the full application stack locally using Docker Compose.

**Why:**
Ensures all services (API Gateway, User Service, Redis) communicate correctly before deploying to Kubernetes.

**Trade-off:**
Does not fully replicate Kubernetes networking, but significantly reduces debugging complexity.
-------------------------------------------------------------------------------------------
### Kubernetes Base Deployment

**Decision:**
Deployed the user-service using a Kubernetes Deployment and exposed it via a ClusterIP Service.

**Why:**
Separates application lifecycle management (Deployment) from networking (Service), following Kubernetes best practices.

**Trade-off:**
ClusterIP services are not externally accessible, requiring port-forwarding for local testing.
------------------------------------------------------------------------------------
### Redis Integration

**Decision:**
Deployed Redis as a separate Deployment with a ClusterIP Service for internal communication.

**Why:**
Allows user-service to connect via Kubernetes DNS (redis:6379), following microservices best practices.

**Trade-off:**
No persistence configured, which is acceptable for this challenge but not for production.
--------------------------------------------------------------------------------------
### Service Communication

**Decision:**
Used Kubernetes Services with internal DNS (redis, user-service) for service-to-service communication.

**Why:**
Enables decoupled microservices and avoids hardcoded IP addresses.

**Trade-off:**
Requires proper configuration of environment variables and service names.
--------------------------------------------------------------------------------------
### API Gateway Integration

**Decision:**
Configured API Gateway to communicate with user-service using Kubernetes service DNS (http://user-service:3001).

**Why:**
Ensures service discovery without hardcoding IP addresses.

**Trade-off:**
Requires consistent service naming across the cluster.
------------------------------------------------------------------------------------

