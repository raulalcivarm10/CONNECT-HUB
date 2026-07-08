# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

# --- desarrollo: código montado por bind mount, hot-reload ---
FROM deps AS dev
COPY . .
EXPOSE 4000
CMD ["npm", "run", "start:dev"]

# --- build de producción ---
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# --- imagen final de producción ---
FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 4000
CMD ["node", "dist/main.js"]
