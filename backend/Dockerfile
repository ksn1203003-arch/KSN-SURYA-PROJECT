# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

# LibreOffice (PPTX→PDF) + Chromium (Puppeteer PDFs) + fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-core \
      libreoffice-impress \
      libreoffice-writer \
      chromium \
      fonts-liberation \
      fonts-noto \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Point Puppeteer at the system Chromium — avoids downloading a second browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 4000

CMD ["node", "--env-file=.env", "dist/index.js"]
