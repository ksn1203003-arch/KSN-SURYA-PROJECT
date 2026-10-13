# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_BACKEND_URL must be set at build time (baked into the JS bundle)
ARG VITE_BACKEND_URL=http://localhost:4000
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

RUN npm run build

# ── Stage 2: Serve via Nginx ──────────────────────────────────────────────────
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing: all unknown paths fall back to index.html (React Router handles them)
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
  location = /index.html {\n\
    add_header Cache-Control "no-cache";\n\
  }\n\
  location ~ ^/(sw|registerSW|workbox-[^/]+)\\.js$ {\n\
    add_header Cache-Control "no-cache";\n\
  }\n\
  location ~ \\.webmanifest$ {\n\
    add_header Cache-Control "no-cache";\n\
  }\n\
  location /assets/ {\n\
    expires 1y;\n\
    add_header Cache-Control "public, immutable";\n\
  }\n\
  location ~* \\.(png|jpg|jpeg|gif|svg|ico|webp|woff2)$ {\n\
    expires 7d;\n\
    add_header Cache-Control "public";\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
