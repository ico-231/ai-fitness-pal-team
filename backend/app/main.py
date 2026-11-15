"""Điểm khởi động FastAPI: gắn các router /api/* và phục vụ giao diện React đã build (1 server duy nhất)."""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .db import init_db
from .routers import auth, body, chat, daily, dashboard, data, extras, nutrition, observability, profile, workouts

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("fitbro")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if settings.environment == "production" and settings.secret_key.startswith("change-me"):
        log.warning("SECRET_KEY đang dùng giá trị mặc định — hãy đặt SECRET_KEY ngẫu nhiên khi deploy!")
    log.info("AI: %s", f"{settings.llm_model} @ {settings.llm_base_url}" if settings.ai_enabled else "CHƯA CẤU HÌNH (đặt LLM_API_KEY)")
    yield


app = FastAPI(title="FitBro AI API", version="3.0.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

for r in (auth, profile, daily, workouts, nutrition, body, dashboard, chat, data, extras, observability):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    from .services import knowledge

    kb = knowledge.kb()
    return {"status": "ok", "ai_enabled": settings.ai_enabled,
            "rag": {"chunks": len(kb.chunks), "vectors": len(kb.vectors), "embedding": bool(settings.embedding_endpoint[0])},
            "guardrails": {"llm_classifier": settings.guard_llm_classifier, "output": settings.guard_output}}


# --- Phục vụ frontend (React build) ---
DIST = Path(settings.frontend_dist)
if (DIST / "index.html").exists():
    if (DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str, request: Request):
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        f = DIST / full_path
        if full_path and f.is_file() and DIST in f.resolve().parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})
else:
    @app.get("/", include_in_schema=False)
    def root():
        return {"message": "FitBro API đang chạy. Frontend chưa build — chạy `npm run dev` trong thư mục frontend.", "docs": "/api/docs"}
