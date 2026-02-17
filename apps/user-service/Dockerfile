# Multi-stage build for production-optimized Node.js application
# Stage 1: Builder - Install production dependencies
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install production dependencies only
# Using npm ci for deterministic, reproducible builds
# --omit=dev: Skip devDependencies
# --omit=optional: Skip optional dependencies (saves ~2-5MB)
RUN npm ci --omit=dev --omit=optional && \
    # Remove unnecessary files from node_modules to reduce size
    find node_modules -type f \( \
        -name "*.md" -o \
        -name "*.ts" -o \
        -name "*.map" -o \
        -name "LICENSE*" -o \
        -name "CHANGELOG*" \
        \) -delete && \
    # Remove test/example directories
    find node_modules -type d \( \
        -name "test" -o \
        -name "tests" -o \
        -name "example" -o \
        -name "examples" -o \
        -name ".github" \
        \) -exec rm -rf {} + 2>/dev/null || true

# Stage 2: Production - Create minimal runtime image
FROM node:20-alpine

WORKDIR /app

# Copy production dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy package files and application source with proper ownership
# Using --chown avoids creating duplicate layers (saves ~80MB)
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src

# Switch to non-root user for security
USER node

# Document the port the application listens on
EXPOSE 3001

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Use node directly (not npm) to ensure proper PID 1 signal handling
# This allows Kubernetes SIGTERM to be received correctly for graceful shutdown
CMD ["node", "src/index.js"]
