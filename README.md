# FitBro AI — Trợ lý thể hình đa tác tử

Hệ thống AI multi-agent hỗ trợ tập luyện, dinh dưỡng và theo dõi cơ thể:
**HeadBro** (tổng quan & mục tiêu) · **CoachBro** (tập luyện) · **NutriBro** (dinh dưỡng) · **Router** · **Safety Guard** · **RAG có trích nguồn** · **Nhật ký AI** · **MCP server** · **Camera AI** chỉnh form.

> Tài liệu giải thích chi tiết toàn bộ hệ thống: **[HUONG_DAN_HE_THONG.md](HUONG_DAN_HE_THONG.md)**
>
> Báo cáo đồ án: **[docs/BAO_CAO.md](docs/BAO_CAO.md)** (bản Word: docs/BAO_CAO.docx) · 13 sơ đồ draw.io: **docs/diagrams/** (ảnh PNG trong docs/diagrams/png, sửa bằng app.diagrams.net hoặc chạy docs/diagrams/build_drawio.py)

## Chạy nhanh trên máy (Windows / macOS / Linux)

Yêu cầu: Python 3.12+, Node.js 20+.

```bash
# 1) Cấu hình
cp .env.example .env          # rồi mở .env điền LLM_BASE_URL / LLM_API_KEY / LLM_MODEL

# 2) Backend
cd backend
python -m venv .venv
.venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000

# 3) Frontend (cửa sổ terminal khác)
cd frontend
npm install
npm run dev                   # mở http://localhost:5173
```

Chế độ "giống production" (1 server duy nhất): `cd frontend && npm run build`, sau đó chạy backend và mở http://localhost:8000.

## Chạy bằng Docker

```bash
cp .env.example .env    # điền key AI
docker compose up -d --build
# mở http://localhost:8000
```

## Deploy

- **Render.com (miễn phí):** đẩy thư mục `fitbro/` lên GitHub → Render → New → Blueprint → chọn repo (dùng `render.yaml`) → điền `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.
- **VPS bất kỳ:** cài Docker → `docker compose up -d --build` → trỏ domain + HTTPS (Caddy/Nginx).

Chi tiết từng bước xem mục 11 của [HUONG_DAN_HE_THONG.md](HUONG_DAN_HE_THONG.md).

## Tài khoản demo (có sẵn ~12 tuần dữ liệu)

```bash
cd backend && python seed_demo.py   # đăng nhập: demo@fitbro.vn / demo123
```

Mọi máy chạy ra cùng một bộ dữ liệu, luôn kết thúc ở ngày hôm nay:
- 45 buổi tập (670 hiệp, có RPE, điểm form camera, ghi chú), tạ tăng dần; giai đoạn 3 buổi/tuần → 5 buổi/tuần, 1 tuần ốm nghỉ tập, 1 tuần deload.
- Gần 300 bữa ăn món Việt (có bữa nhận diện từ ảnh, bữa cỗ cưới, trà sữa buổi tối), check-in và nước uống gần như mỗi ngày.
- 38 lần đo cơ thể: cân 3 lần/tuần + 4 phiếu InBody (mỡ, cơ, vòng đo, từng vùng). Cân giảm 72 → khoảng 68kg, có giai đoạn chững.
- 5 mục tiêu (đang làm, đã đạt, đã lưu trữ), 7 trí nhớ AI, lịch tuần, 1 buổi tập AI tạo riêng.
- 10 cuộc trò chuyện mẫu (đặt mục tiêu, đau vai, ghi bữa ăn, RAG có nguồn, ăn kiêng cực đoan, Safety Guard chặn, 2 agent + tổng kết, thực đơn, thẻ cân nặng **đang chờ xác nhận**) kèm trace trên trang Nhật ký AI (gắn nhãn "Mẫu", số đo thời gian/token là minh hoạ).

## Kiểm thử & đánh giá (eval)

```bash
cd backend && pytest -q              # 42 test offline: công thức, API, multi-agent (LLM giả lập), guardrails, RAG, trace, MCP
cd backend && python evals/run_eval.py   # 39 case với LLM THẬT + LLM-as-judge + đo RAG → evals/reports/latest.md
cd frontend && npm run build         # type-check + build
```

## Guardrails · RAG · Observability · MCP

- **Guardrails 4 lớp:** luật đầu vào → LLM phân loại câu lưng chừng → chặn ở công cụ → soát câu trả lời đầu ra.
- **RAG:** kho 68 đoạn kiến thức có nguồn (`backend/data/knowledge/`), tìm lai BM25 + vector Gemini. Sửa kho xong chạy `python backend/scripts/build_knowledge_index.py`.
- **Observability:** trang **Nhật ký AI** (`/ai-log`) — từng bước guard/router/LLM/công cụ, độ trễ, token, lỗi.
- **MCP server:** `FITBRO_USER_EMAIL=demo@fitbro.vn python backend/mcp_server.py` → dùng FitBro từ Claude Desktop/Cursor (cấu hình ở mục 16.5 tài liệu).
