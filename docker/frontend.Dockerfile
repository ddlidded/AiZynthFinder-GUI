# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app/frontend

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        unzip \
    && rm -rf /var/lib/apt/lists/*

COPY scripts/download-chemdoodle.sh /app/scripts/download-chemdoodle.sh
COPY frontend/package*.json ./
RUN npm ci --ignore-scripts

COPY frontend/ ./
RUN chmod +x /app/scripts/download-chemdoodle.sh \
    && bash /app/scripts/download-chemdoodle.sh /app/frontend/public/chemdoodle
RUN npm run build


FROM nginx:1.29-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
