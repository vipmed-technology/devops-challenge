
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package*.json ./
RUN addgroup -S app && adduser -S app -G app \
    && chown -R app:app /app
USER app
EXPOSE 3001
CMD ["node", "src/index.js"]
