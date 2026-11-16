"""Cấu hình toàn hệ thống, đọc từ biến môi trường (hoặc file .env).

Mọi thứ có thể thay đổi khi deploy (API key, database, model AI...) đều nằm ở đây,
code không bao giờ hard-code bí mật.
"""
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # .../backend
DATA_DIR = BASE_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BASE_DIR / ".env", BASE_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- App ---
    app_name: str = "FitBro AI"
    environment: str = "development"  # development | production
    secret_key: str = "change-me-in-production-please-use-a-long-random-string"
    access_token_days: int = 30  # đăng nhập 1 lần, tự đăng nhập lại trong 30 ngày
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    frontend_dist: str = str(BASE_DIR.parent / "frontend" / "dist")
    timezone: str = "Asia/Ho_Chi_Minh"  # dùng để xác định "hôm nay" của người dùng

    # --- Database ---
    # SQLite mặc định (chạy ngay không cần cài gì). Khi deploy dùng Postgres:
    # DATABASE_URL=postgresql+psycopg://user:pass@host:5432/dbname
    # Production dùng Supabase qua SUPABASE_DB_URL (Transaction pooler, cổng 6543); biến này được ưu tiên
    # hơn DATABASE_URL, nên một tích hợp database khác tự thêm DATABASE_URL cũng không ghi đè được.
    database_url: str = Field(
        default=f"sqlite:///{BASE_DIR / 'fitbro.db'}",
        validation_alias=AliasChoices("SUPABASE_DB_URL", "DATABASE_URL", "database_url"),
    )

    # --- Google Sign-In (tùy chọn) ---
    google_client_id: str = ""

    # --- AI model (chuẩn OpenAI-compatible) ---
    # Hoạt động với OpenAI, Gemini (endpoint OpenAI-compatible), OpenRouter, Groq,
    # DeepSeek, Ollama, LM Studio, vLLM, proxy nội bộ... chỉ cần đổi 3 biến dưới.
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_backup_api_keys: str = ""  # key dự phòng (phẩy ngăn cách), dùng khi key chính hết hạn mức 429
    llm_model: str = "gpt-4o-mini"
    llm_fast_model: str = ""  # model rẻ/nhanh cho bước định tuyến; trống = dùng llm_model
    llm_vision_model: str = ""  # model đọc ảnh; trống = dùng llm_model
    llm_temperature: float = 0.4
    llm_timeout: float = 90.0
    llm_supports_tools: bool = True  # tắt nếu API không hỗ trợ function calling
    llm_json_mode: bool = True  # tắt nếu API không hỗ trợ response_format=json_object
    llm_fallback_models: str = ""  # model dự phòng (phẩy ngăn cách) khi model chính hết hạn mức 429
    # --- Nhà cung cấp thứ 2 (dự phòng + đọc ảnh), vd Gemini khi model chính là Mercury ---
    secondary_llm_base_url: str = ""
    secondary_llm_api_keys: str = ""  # phẩy ngăn cách
    secondary_llm_models: str = ""  # phẩy ngăn cách, model đầu tiên là chính
    secondary_llm_reasoning_effort: str = ""
    llm_vision_use_secondary: bool = False  # true nếu model chính không đọc được ảnh
    llm_reasoning_effort: str = ""  # "low" | "medium" | "high" — giảm mức "suy nghĩ" của model để trả lời nhanh hơn (trống = mặc định)
    llm_followups: bool = True  # gợi ý 3 câu hỏi tiếp theo sau mỗi câu trả lời
    chat_daily_limit: int = 150  # số tin nhắn AI tối đa / người / ngày (chống tốn chi phí)
    ai_tools_daily_limit: int = 40  # phân tích ảnh bữa ăn + đọc phiếu InBody + gợi ý bài / người / ngày

    # --- Guardrails ---
    guard_llm_classifier: bool = True  # câu "lưng chừng" mà regex không chắc → hỏi thêm model nhanh để phân loại rủi ro
    guard_output: bool = True  # kiểm tra câu trả lời của agent (calo quá thấp, giảm cân quá nhanh, chẩn đoán, liều thuốc)

    # --- RAG (kho kiến thức) ---
    # Embedding dùng chuẩn OpenAI /embeddings. Trống → lấy theo nhà cung cấp thứ 2 (Gemini).
    # Không có embedding → vẫn chạy bằng BM25 (tìm theo từ khoá).
    embedding_base_url: str = ""
    embedding_api_key: str = ""
    embedding_model: str = "gemini-embedding-001"
    embedding_dimensions: int = 768
    rag_enabled: bool = True

    # --- Observability ---
    admin_emails: str = ""  # email (phẩy ngăn cách) được xem nhật ký AI của TOÀN hệ thống
    trace_retention_days: int = 30

    @property
    def ai_enabled(self) -> bool:
        return bool(self.llm_api_key and self.llm_model)

    @property
    def router_model(self) -> str:
        return self.llm_fast_model or self.llm_model

    @property
    def vision_model(self) -> str:
        return self.llm_vision_model or self.llm_model

    @property
    def embedding_endpoint(self) -> tuple[str, str]:
        """(base_url, api_key) cho embedding; rỗng nếu chưa cấu hình."""
        base = self.embedding_base_url or self.secondary_llm_base_url
        key = self.embedding_api_key or next((k.strip() for k in self.secondary_llm_api_keys.split(",") if k.strip()), "")
        return (base, key) if base and key else ("", "")

    @property
    def admin_list(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
