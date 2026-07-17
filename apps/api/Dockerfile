# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
# fontconfig + fuentes: sharp compone texto SVG en los certificados (sin esto no renderiza glifos).
# ttf-liberation = Liberation Sans, métricamente compatible con Arial (el panel muestra Arial) → WYSIWYG.
RUN apk add --no-cache fontconfig ttf-dejavu ttf-liberation
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
# fuentes para el render de certificados (sharp/SVG text); ttf-liberation = métricas Arial
RUN apk add --no-cache fontconfig ttf-dejavu ttf-liberation
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 4000
CMD ["node", "dist/main.js"]
