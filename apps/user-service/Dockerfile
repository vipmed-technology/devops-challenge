# Multi-stage build for optimized production image
# Stage 1: Install dependencies
FROM node:20-alpine AS dependencies

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install production dependencies only
# Using --omit=dev to exclude devDependencies
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Stage 2: Production image
FROM node:20-alpine

# Add metadata labels
LABEL maintainer="devops-team"
LABEL service="user-service"
LABEL version="1.0.0"

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application source
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs src ./src

# Switch to non-root user
USER nodejs

# Expose application port
EXPOSE 3001

# Health check to ensure container is healthy
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health/live', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "src/index.js"]
