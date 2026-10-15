FROM node:24-bookworm-slim

# Debian mirror for apt. From Russia, a long download from deb.debian.org (Fastly) can slow to tens of KB/s, and then
# Chromium alone takes most of an hour; n8n-deploy builds with http://mirror.yandex.ru.
ARG DEBIAN_MIRROR=http://deb.debian.org

# Chromium from Debian rather than the one puppeteer downloads: it brings its own libraries and gets security updates
RUN sed -i "s#http://deb.debian.org#${DEBIAN_MIRROR}#g" /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    CHROMIUM_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    LOG_DIR=

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "src/server.ts"]
