# Stage 1: Install dependencies
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: Minimal production image
FROM alpine:3.20

RUN apk add --no-cache dumb-init libstdc++

# Copy only the node binary (skip npm, yarn, corepack)
COPY --from=build /usr/local/bin/node /usr/local/bin/node

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001

STOPSIGNAL SIGTERM

CMD ["dumb-init", "node", "src/index.js"]
