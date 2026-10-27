# syntax=docker/dockerfile:1

# ---- deps: full install (dev deps needed for tsc) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# ---- build ----
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npm run build && npm prune --omit=dev

# ---- runtime: used by both the API Deployment and the migrate Job ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./
USER node
EXPOSE 3000
# API by default. The migrate Job overrides this with: npx prisma migrate deploy
CMD ["node", "dist/server.js"]
