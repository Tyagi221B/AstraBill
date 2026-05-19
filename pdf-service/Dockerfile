# astrabill-pdf-service
#
#   docker build -t astrabill-pdf-service pdf-service/
#
# Self-contained — build context is pdf-service/ itself. Base image ships
# Chromium + a matching Puppeteer; keep the puppeteer version in
# package.json aligned with this tag.
FROM ghcr.io/puppeteer/puppeteer:24.10.0

USER root
WORKDIR /app

# Deps first, for layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Source + build.
COPY . .
RUN npm run build

ENV PORT=4000
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]
