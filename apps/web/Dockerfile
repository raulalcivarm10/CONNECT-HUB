# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

# --- desarrollo: código montado por bind mount, hot-reload ---
FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- build de producción (NEXT_PUBLIC_* se inyecta en build) ---
FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_NAS_URL=https://api-ligaprocorp.ec:3443/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_NAS_URL=$NEXT_PUBLIC_NAS_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

# --- imagen final de producción (standalone) ---
FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
