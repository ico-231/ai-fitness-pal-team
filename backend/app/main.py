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
from .routers import activities, auth, body, chat, daily, dashboard, data, extras, nutrition, observability, profile, workouts

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


_demo_checked: str | None = None


def refresh_demo_if_stale() -> None:
    """Làm mới tài khoản demo tối đa 1 lần mỗi ngày mỗi tiến trình (chỉ khi DEMO_AUTO_REFRESH=true)."""
    global _demo_checked
    import os

    if os.environ.get("DEMO_AUTO_REFRESH", "").lower() != "true":
        return
    from .services import stats

    today = stats.today().isoformat()
    if _demo_checked == today:
        return
    _demo_checked = today
    try:
        import sys
        from pathlib import Path

        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        import seed_demo

        if seed_demo.ensure_fresh():
            log.info("Đã làm mới dữ liệu tài khoản demo cho ngày %s", today)
    except Exception:  # hai tiến trình cùng làm mới một lúc → một bên lỗi, bên kia vẫn xong
        log.exception("Không làm mới được tài khoản demo")


app = FastAPI(title="FitBro AI API", version="3.0.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.middleware("http")
async def _demo_daily_refresh(request, call_next):
    # Vercel giữ tiến trình sống qua nửa đêm → kiểm tra lại ở request đầu tiên của ngày mới
    if _demo_checked is not None and request.url.path.startswith("/api/"):
        from starlette.concurrency import run_in_threadpool

        from .services import stats

        if _demo_checked != stats.today().isoformat():
            await run_in_threadpool(refresh_demo_if_stale)
    return await call_next(request)


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    """Lỗi bất ngờ: ghi log đầy đủ, trả JSON có câu tiếng Việt (giao diện hiện đúng câu này thay vì
    'Có lỗi xảy ra' chung chung), không lộ chi tiết kỹ thuật."""
    log.exception("Lỗi không mong đợi ở %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Hệ thống gặp lỗi khi xử lý yêu cầu này. Bạn thử lại sau ít giây nhé."})


for r in (auth, profile, daily, workouts, activities, nutrition, body, dashboard, chat, data, extras, observability):
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
