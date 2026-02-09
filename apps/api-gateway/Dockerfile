FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine
RUN apk add --no-cache tini
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src ./src
USER node
EXPOSE 3000
ENTRYPOINT ["tini", "--"]
CMD ["node", "src/index.js"]
