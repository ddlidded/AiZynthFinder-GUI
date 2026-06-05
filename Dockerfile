# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AIZYNTH_DATA_DIR=/data/aizynth \
    AIZYNTH_CONFIG=/data/aizynth/config.yml \
    FRONTEND_DIST=/app/frontend/dist \
    MAX_SEARCH_TIME_SECONDS=900 \
    MAX_SEARCH_ITERATIONS=5000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgomp1 \
        libglib2.0-0 \
        libgl1 \
        libsm6 \
        libxext6 \
        libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY backend/ /app/backend/
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY docker/entrypoint.sh /usr/local/bin/aizynthfinder-gui-entrypoint
RUN chmod +x /usr/local/bin/aizynthfinder-gui-entrypoint

VOLUME ["/data/aizynth"]
EXPOSE 8000

ENTRYPOINT ["aizynthfinder-gui-entrypoint"]
CMD ["python", "-m", "uvicorn", "app.main:app", "--app-dir", "/app/backend", "--host", "0.0.0.0", "--port", "8000"]
