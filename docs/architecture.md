# Architecture Documentation

> **Note to Candidate:** Replace this template with your actual architecture decisions.

## System Architecture

Draw or describe the architecture of your deployment.

## Your Decisions

### Docker Strategy

- Base image choice:
- Multi-stage build approach:
- Security considerations:
- Layer optimization:

### Kubernetes Design

- Namespace strategy:
- Resource allocation rationale:
- Health check configuration:
- Scaling strategy:

### CI/CD Pipeline

- Pipeline stages:
- Deployment strategy:
- Rollback approach:
- Secret management:

### Environment & Secrets Management

- How do you separate config from code?
- How do you handle sensitive vs non-sensitive config?
- How would you manage secrets in production? (e.g., Vault, Sealed Secrets, external-secrets, SOPS)
- How do you handle different environments (dev/staging/prod)?

### Monitoring Strategy

- Metrics collected:
- Logging format:
- Alerting rules (proposed):

## Trade-offs & Assumptions

1. **Trade-off 1:**
   - Decision:
   - Rationale:
   - Alternative considered:

## Security Considerations

Document security measures you implemented.

## What I Would Improve With More Time

1.
2.
3.

## Time Spent

| Task | Time |
|------|------|
| Part 1: Docker | |
| Part 2: Kubernetes | |
| Part 3: CI/CD | |
| Part 4: Monitoring | |
| Part 5: Troubleshooting | |
| Documentation | |
| **Total** | |


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

