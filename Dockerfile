# ==== Stage 1: build giao diện React ====
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ==== Stage 2: server Python (FastAPI) phục vụ cả API lẫn giao diện ====
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    ENVIRONMENT=production FRONTEND_DIST=/app/frontend/dist
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist /app/frontend/dist
# SQLite mặc định lưu ở /app/data (gắn volume để không mất dữ liệu)
RUN mkdir -p /app/data && useradd -m fitbro && chown -R fitbro /app
USER fitbro
ENV DATABASE_URL=sqlite:////app/data/fitbro.db
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
