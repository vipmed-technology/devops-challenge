# ==========================================
# Stage 1: Build
# ==========================================
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install ALL dependencies (including development dependencies for testing)
RUN npm ci

# Copy the source code
COPY src/ ./src/

# ==========================================
# Stage 2: Production (Final Image)
# ==========================================
FROM node:20-alpine AS runner

# Environment variables
ENV NODE_ENV=production

WORKDIR /app

# Copy manifests and production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the compiled/ready source code from the builder
COPY --from=builder /app/src ./src

# Security: Change permissions and use the 'node' user (it comes by default in the image)
RUN chown -R node:node /app
USER node

# Expose the API Gateway port
EXPOSE 3000

# Use array syntax ("exec form") to have Node receive the SIGTERM signal
CMD ["node", "src/index.js"]