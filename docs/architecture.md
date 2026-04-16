# Architecture Documentation

> **Note to Candidate:** Replace this template with your actual architecture decisions.

## System Architecture

Draw or describe the architecture of your deployment.

## Your Decisions

### Docker Strategy

- **Base image choice:** `node:20-alpine`. Se eligió Alpine por su tamaño reducido y menor superficie de ataque, cumpliendo con el requisito de mantener la imagen final por debajo de los 200MB.
- **Multi-stage build approach:** Se implementó un patrón de dos etapas (`builder` y `runner`). El `builder` instala todas las dependencias (incluyendo `devDependencies` necesarias para compilar/testear), mientras que el `runner` solo copia los artefactos compilados y dependencias de producción, reduciendo drásticamente el peso de la imagen (aprox 55MB).
- **Security considerations:** Se configuró el contenedor para ejecutarse con un usuario sin privilegios (`USER node`) en lugar de `root`. Además, se implementó un manejo correcto de `SIGTERM` mediante el uso del formato `exec` en el `CMD` del Dockerfile y listeners en el código de Node.js para un *graceful shutdown*.
- **Layer optimization:** Se copiaron los archivos `package*.json` antes que el código fuente (`src/`) para aprovechar la caché de capas de Docker. Si el código cambia pero las dependencias no, Docker reutilizará la capa de `npm ci`, acelerando el build.

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

- **How do you separate config from code?** Utilizando `ConfigMaps` para inyectar variables de entorno no sensibles (como puertos y URLs de los servicios) y `Secrets` para datos sensibles, montados como variables de entorno en el Deployment.
- **How do you handle sensitive vs non-sensitive config?** En este repositorio se utiliza Kustomize (`configMapGenerator` y `secretGenerator`). Los datos sensibles nunca se hardcodean en los manifiestos base.
- **How would you manage secrets in production?** En un entorno de producción real, NUNCA commitearía los Secretos en Git. Utilizaría una herramienta como **HashiCorp Vault** o **AWS Secrets Manager**, integrándola con el clúster a través de **External Secrets Operator (ESO)**. Alternativamente, bajo un enfoque estricto de GitOps, utilizaría **Sealed Secrets** o **SOPS** para cifrar los manifiestos de secretos antes de subirlos al repositorio.
- **How do you handle different environments (dev/staging/prod)?** Mediante el uso de Kustomize Overlays. Existe un directorio `base/` con la configuración en común, y directorios en `overlays/` (`dev` y `prod`) que aplican parches (patches) específicos, como incremento de réplicas o HPA en producción.

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
