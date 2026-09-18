# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=1536"

# Install build dependencies
RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production runtime
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install runtime dependencies including chromium for playwright
RUN apk add --no-cache \
    openssl \
    libc6-compat \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npm ci --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 3009
CMD ["node", "--max-old-space-size=450", "dist/main.js"]
