FROM mcr.microsoft.com/playwright:v1.59.1-noble
WORKDIR /opt/audit
ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core fonts-liberation && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "worker.mjs"]
