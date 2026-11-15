"""Sinh sơ đồ draw.io (.drawio) cho báo cáo/slide FitBro.

Chạy:  python docs/diagrams/build_drawio.py
Kết quả:
  docs/diagrams/drawio/NN_ten.drawio      — từng sơ đồ, mở bằng https://app.diagrams.net hoặc extension "Draw.io Integration" (VS Code)
  docs/diagrams/FitBro_so_do.drawio       — tất cả sơ đồ trong 1 file nhiều trang
Xuất ảnh: trong draw.io chọn File → Export as → PNG/SVG (nên chọn Zoom 200%, Border 10).
"""
from __future__ import annotations

import html
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "drawio"

# ---------------------------------------------------------------- styles (theme "professional")
BASE = "html=1;whiteSpace=wrap;fontColor=#0F172A;fontSize=14;"
STEP = BASE + "rounded=1;arcSize=12;fillColor=#EFF6FF;strokeColor=#2563EB;"
AGENT = BASE + "rounded=1;arcSize=12;fillColor=#DBEAFE;strokeColor=#1D4ED8;strokeWidth=2;"
DEC = BASE + "rhombus;fillColor=#FFFFFF;strokeColor=#2563EB;fontSize=13;"
TERM = BASE + "rounded=1;arcSize=40;fillColor=#1E3A8A;strokeColor=none;fontColor=#FFFFFF;fontStyle=1;"
OK = BASE + "rounded=1;arcSize=12;fillColor=#ECFDF5;strokeColor=#16A34A;"
ERR = BASE + "rounded=1;arcSize=12;fillColor=#FEF2F2;strokeColor=#DC2626;"
WARN = BASE + "rounded=1;arcSize=12;fillColor=#FFF7ED;strokeColor=#EA580C;"
DATA = BASE + "shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=12;fillColor=#F5F3FF;strokeColor=#7C3AED;"
DOC = BASE + "shape=document;boundedLbl=1;size=0.18;fillColor=#F5F3FF;strokeColor=#7C3AED;"
EXT = BASE + "rounded=1;arcSize=12;fillColor=#F1F5F9;strokeColor=#64748B;"
EXT_DASH = EXT + "dashed=1;"
NOTE = BASE + "shape=note;size=14;fillColor=#FFFBEB;strokeColor=#D97706;fontSize=12;align=left;spacingLeft=8;"
ACTOR = "shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;fontSize=14;fontColor=#0F172A;strokeColor=#1E3A8A;fillColor=#DBEAFE;"
USECASE = BASE + "ellipse;fillColor=#EFF6FF;strokeColor=#2563EB;fontSize=13;"
CONT = "swimlane;startSize=30;html=1;whiteSpace=wrap;rounded=1;arcSize=3;fillColor=#F8FAFC;strokeColor=#94A3B8;fontStyle=1;fontSize=15;fontColor=#0F172A;swimlaneFillColor=#F8FAFC;"
CONT_W = CONT.replace("fillColor=#F8FAFC", "fillColor=#FFFFFF").replace("swimlaneFillColor=#F8FAFC", "swimlaneFillColor=#FFFFFF")
TITLE = "text;html=1;fontSize=22;fontStyle=1;fontColor=#0F172A;align=left;verticalAlign=middle;"
SUB = "text;html=1;fontSize=13;fontColor=#475569;align=left;verticalAlign=top;whiteSpace=wrap;"
EDGE = ("edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#475569;strokeWidth=1.5;fontColor=#334155;fontSize=12;"
        "labelBackgroundColor=default;defaultLabelBackgroundColor=page;endArrow=block;endFill=1;endSize=7;")
DASHED = EDGE + "dashed=1;"
YES = "fontColor=#15803D;fontStyle=1;"
NO = "fontColor=#B91C1C;fontStyle=1;"


class Diagram:
    def __init__(self, name: str, title: str, subtitle: str = ""):
        self.name, self.title = name, title
        self.cells: list[str] = []
        self.n = 0
        self.text(title, 20, 10, 1100, 36, TITLE)
        if subtitle:
            self.text(subtitle, 20, 46, 1100, 40, SUB)

    def _id(self) -> str:
        self.n += 1
        return f"c{self.n}"

    def node(self, label: str, x: float, y: float, w: float = 160, h: float = 60, style: str = STEP, parent: str = "1",
             cid: str | None = None) -> str:
        cid = cid or self._id()
        if style == TERM:  # nền tối → chữ phụ màu sáng
            label = label.replace("#475569", "#CBD5E1")
        self.cells.append(f'<mxCell id="{cid}" value="{html.escape(label, quote=True)}" style="{style}" vertex="1" parent="{parent}">'
                          f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
        return cid

    def text(self, label: str, x, y, w, h, style=SUB, parent="1") -> str:
        return self.node(label, x, y, w, h, style, parent)

    def box(self, label: str, x, y, w, h, style=CONT, parent="1") -> str:
        return self.node(label, x, y, w, h, style + "container=1;collapsible=0;", parent)

    def edge(self, s: str, t: str, label: str = "", style: str = EDGE, parent: str = "1", extra: str = "") -> str:
        cid = self._id()
        self.cells.append(f'<mxCell id="{cid}" value="{html.escape(label, quote=True)}" style="{style}{extra}" edge="1" parent="{parent}" '
                          f'source="{s}" target="{t}"><mxGeometry relative="1" as="geometry"/></mxCell>')
        return cid

    def line(self, x1, y1, x2, y2, label: str = "", style: str = EDGE) -> str:
        """Mũi tên tự do (dùng cho sơ đồ tuần tự)."""
        cid = self._id()
        self.cells.append(f'<mxCell id="{cid}" value="{html.escape(label, quote=True)}" style="{style}" edge="1" parent="1">'
                          f'<mxGeometry relative="1" as="geometry"><mxPoint x="{x1}" y="{y1}" as="sourcePoint"/>'
                          f'<mxPoint x="{x2}" y="{y2}" as="targetPoint"/></mxGeometry></mxCell>')
        return cid

    def model(self) -> str:
        return ('<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" '
                'page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0" adaptiveColors="auto"><root>'
                '<mxCell id="0"/><mxCell id="1" parent="0"/>' + "".join(self.cells) + "</root></mxGraphModel>")

    def page(self, idx: int) -> str:
        return f'<diagram id="p{idx}" name="{html.escape(self.title, quote=True)}">{self.model()}</diagram>'


def br(*parts: str) -> str:
    """Nhãn nhiều dòng: dòng đầu đậm, các dòng sau nhỏ hơn."""
    head, *rest = parts
    s = f"<b>{head}</b>"
    for r in rest:
        s += f"<br><font style='font-size:12px' color='#475569'>{r}</font>"
    return s


DIAGRAMS: list[Diagram] = []


# ============================================================ 1. Kiến trúc tổng thể
def d_architecture() -> Diagram:
    d = Diagram("01_kien_truc", "1. Kiến trúc tổng thể FitBro AI",
                "Một server FastAPI phục vụ cả API và giao diện React. Tầng AI gọi model qua chuẩn OpenAI-compatible (2 nhà cung cấp). "
                "Camera AI chạy ngay trên trình duyệt. MCP server là thành phần tuỳ chọn.")
    user = d.node("Người dùng", 470, 100, 160, 50, TERM)
    fe = d.box("Frontend · React 19 + Vite + Tailwind (trình duyệt)", 40, 185, 1060, 120)
    d.node(br("10 trang giao diện", "Dashboard · Trợ lý AI · Workouts · Daily · Nutrition", "InBody · Hướng dẫn · Cài đặt · Nhật ký AI"),
           20, 40, 420, 66, STEP, fe)
    d.node(br("Camera AI", "MediaPipe Pose · chấm form tại máy"), 470, 40, 270, 66, STEP, fe)
    d.node(br("Giọng nói", "Web Speech API"), 770, 40, 270, 66, STEP, fe)
    be = d.box("Backend · FastAPI (Python 3.12)", 40, 350, 1060, 270)
    routers = d.node(br("REST API + SSE", "11 nhóm: auth, profile, daily, workouts,", "nutrition, body, dashboard, chat, data, extras, traces"),
                     20, 45, 330, 80, STEP, be)
    ai = d.node(br("Tầng AI đa tác tử", "Guardrails → Router → HeadBro / CoachBro / NutriBro", "→ Tổng kết · 31 công cụ"),
                380, 45, 330, 80, AGENT, be)
    mcps = d.node(br("MCP server (tuỳ chọn)", "22 công cụ chỉ đọc + ask_fitbro"), 740, 45, 300, 80, EXT_DASH, be)
    svc = d.node(br("Services", "công thức · thống kê · bài tập · món Việt", "lịch tập · insights"), 20, 165, 330, 80, STEP, be)
    kb = d.node(br("Kho kiến thức RAG", "68 đoạn có nguồn + vector"), 740, 165, 150, 80, DOC, be)
    tr = d.node(br("Tracing", "observability"), 910, 165, 130, 80, STEP, be)
    mcpc = d.node(br("MCP client bất kỳ", "app chat · IDE · script"), 1150, 395, 190, 80, EXT_DASH)
    db = d.node(br("Database", "SQLite (máy cá nhân)", "PostgreSQL (deploy)"), 85, 670, 240, 90, DATA)
    m1 = d.node(br("Inception Mercury-3", "nhà cung cấp chính · chat"), 380, 680, 230, 66, EXT)
    m2 = d.node(br("Google Gemini", "dự phòng · đọc ảnh · embedding"), 640, 680, 250, 66, EXT)
    d.edge(user, fe, "HTTPS")
    d.edge(fe, routers, "REST + SSE", parent="1", extra="exitX=0.2;exitY=1;")
    d.edge(routers, svc, parent=be)
    d.edge(routers, ai, parent=be)
    d.edge(ai, kb, "tra cứu", parent=be, extra="exitX=0.85;exitY=1;")
    d.edge(ai, tr, "", DASHED, parent=be, extra="exitX=0.95;exitY=1;")
    d.edge(mcps, ai, "", DASHED, parent=be)
    d.edge(mcpc, mcps, "MCP", DASHED)
    d.edge(svc, db)
    d.edge(ai, m1, "Chat Completions", extra="exitX=0.3;exitY=1;")
    d.edge(ai, m2, "dự phòng", extra="exitX=0.7;exitY=1;")
    d.text("Nét đứt = tuỳ chọn / không đồng bộ", 940, 700, 300, 24, SUB)
    return d


# ============================================================ 2. Luồng xử lý tin nhắn
def d_flow() -> Diagram:
    d = Diagram("02_luong_tin_nhan", "2. Luồng xử lý một tin nhắn",
                "Guard đầu vào → Router → 1-2 agent (vòng lặp ReAct với công cụ) → guard đầu ra → lưu, stream về giao diện. Mọi bước được ghi trace.")
    m = d.node("Tin nhắn<br><font style='font-size:12px'>(+ ảnh, + ngữ cảnh trang)</font>", 60, 100, 180, 56, TERM)
    g1 = d.node("Guard luật<br>(regex)", 70, 200, 160, 90, DEC)
    bl = d.node(br("Trả lời hướng dẫn an toàn", "115 · đường dây hỗ trợ", "KHÔNG gọi model"), 640, 205, 240, 80, ERR)
    g2 = d.node("LLM phân loại<br>câu lưng chừng", 360, 330, 170, 90, DEC)
    note = d.node(br("Gắn ghi chú cho agent", "thận trọng y tế · prompt injection", "ăn kiêng cực đoan"), 50, 460, 200, 70, WARN)
    r = d.node(br("Router", "từ khoá → LLM (JSON)"), 60, 580, 180, 60, STEP)
    loop = d.box("Vòng lặp ReAct · tối đa 6 lượt", 330, 555, 400, 150, CONT_W)
    llm = d.node(br("Gọi model", "kèm công cụ được phép"), 20, 45, 160, 60, AGENT, loop)
    tool = d.node(br("Công cụ", "đọc DB · RAG", "thẻ · đề xuất ghi"), 220, 40, 160, 70, STEP, loop)
    d.edge(llm, tool, "gọi", parent=loop)
    d.edge(tool, llm, "kết quả", parent=loop, extra="exitX=0.5;exitY=1;entryX=0.5;entryY=1;")
    og = d.node("Guard<br>đầu ra", 70, 760, 160, 90, DEC)
    fix = d.node(br("Nối “Lưu ý an toàn”", "lộ prompt → thay câu"), 360, 775, 220, 60, WARN)
    two = d.node("Cần agent<br>thứ 2?", 70, 910, 160, 90, DEC)
    a2 = d.node(br("Agent #2 → HeadBro tổng kết", "đọc câu trả lời của agent #1"), 360, 920, 260, 70, AGENT)
    out = d.node(br("Lưu DB · gợi ý câu hỏi tiếp · lưu trace", "stream sự kiện SSE về giao diện"), 30, 1060, 340, 64, OK)
    d.edge(m, g1)
    d.edge(g1, bl, "nguy hiểm rõ", style=EDGE + NO)
    d.edge(g1, g2, "lưng chừng", extra="exitX=0.75;exitY=0.75;entryX=0.5;entryY=0;")
    d.edge(g2, bl, "chắc chắn ≥ 0,8", style=EDGE + NO, extra="exitX=1;exitY=0.5;entryX=0.5;entryY=1;")
    d.edge(g2, note, "không nguy hiểm", extra="exitX=0.5;exitY=1;entryX=1;entryY=0.5;")
    d.edge(g1, note, "an toàn", style=EDGE + YES)
    d.edge(note, r)
    d.edge(r, llm, "agent #1")
    d.edge(llm, og, "trả lời", extra="exitX=0;exitY=0.9;entryX=0.5;entryY=0;")
    d.edge(og, fix, "vi phạm", style=EDGE + NO, extra="exitX=1;exitY=0.5;")
    d.edge(fix, two, "", extra="exitX=0.5;exitY=1;entryX=0.75;entryY=0.25;")
    d.edge(og, two, "ổn", style=EDGE + YES)
    d.edge(two, a2, "có", style=EDGE + YES)
    d.edge(two, out, "không")
    d.edge(a2, out, "", extra="exitX=0.5;exitY=1;entryX=1;entryY=0.5;")
    return d


# ============================================================ 3. Use case
def d_usecase() -> Diagram:
    d = Diagram("03_use_case", "3. Sơ đồ use case")
    step = 72
    sysb = d.box("Hệ thống FitBro AI", 260, 70, 760, 50 + 12 * step + 20)
    cases = ["Đăng ký / đăng nhập", "Khai báo hồ sơ, nhận mục tiêu calo/macro", "Check-in sáng → điểm sẵn sàng",
             "Tập theo chương trình, ghi set", "Camera AI chấm form, đếm rep", "Ghi bữa ăn: thư viện · ảnh · chat",
             "Đo cơ thể, đọc phiếu InBody bằng ảnh", "Đặt và theo dõi mục tiêu", "Chat với đội 3 agent AI",
             "Xem Dashboard, báo cáo, nhắc nhở", "Quản lý trí nhớ AI, xuất / xoá dữ liệu", "Xem Nhật ký AI (trace)"]
    C = [d.node(t, 30, 45 + i * step, 330, 56, USECASE, sysb) for i, t in enumerate(cases)]
    confirm = d.node("Xác nhận đề xuất ghi dữ liệu của AI", 410, 45 + 9 * step, 320, 56, USECASE, sysb)
    mcpuc = d.node("Đọc dữ liệu & hỏi agent qua MCP", 410, 45 + 6 * step, 320, 56, USECASE, sysb)
    mid = 70 + 45 + 5.5 * step
    u = d.node("Người dùng", 120, mid - 20, 40, 80, ACTOR)
    ai = d.node("Model AI<br>(Mercury / Gemini)", 1110, 70 + 45 + 8 * step - 15, 40, 80, ACTOR)
    mcp = d.node("MCP client", 1110, 70 + 45 + 6 * step - 15, 40, 80, ACTOR)
    admin = d.node("Quản trị viên", 1110, 70 + 45 + 11 * step - 15, 40, 80, ACTOR)
    plain = "html=1;endArrow=none;strokeColor=#475569;strokeWidth=1.2;"
    for c in C:
        d.edge(u, c, style=plain + "entryX=0;entryY=0.5;")
    d.edge(ai, C[8], style=plain)
    d.edge(mcp, mcpuc, style=plain)
    d.edge(admin, C[11], style=plain)
    d.edge(C[8], confirm, "«include»", style="html=1;dashed=1;endArrow=open;strokeColor=#475569;fontSize=12;")
    return d


# ============================================================ 4. Multi-agent & quyền công cụ
def d_agents() -> Diagram:
    d = Diagram("04_multi_agent", "4. Kiến trúc đa tác tử và phân quyền công cụ",
                "Ba agent có persona, chuyên môn và bộ công cụ riêng (tổng 31 công cụ). Công cụ ghi (in nghiêng) chỉ tạo đề xuất chờ người dùng xác nhận.")
    r = d.node(br("Router / Supervisor", "chọn 1-2 agent"), 470, 100, 220, 56, TERM)
    h = d.node(br("HeadBro · HLV trưởng", "tổng quan · mục tiêu · InBody · động lực", "20 công cụ"), 60, 200, 300, 76, AGENT)
    c = d.node(br("CoachBro · HLV sức mạnh", "bài tập · giáo án · lịch tuần · kỹ thuật", "22 công cụ"), 430, 200, 300, 76, AGENT)
    n = d.node(br("NutriBro · Dinh dưỡng", "bữa ăn · macro · món Việt · thực đơn", "14 công cụ"), 800, 200, 300, 76, AGENT)
    for a in (h, c, n):
        d.edge(r, a)
    ht = d.node("get_progress_report · get_insights<br>get_streak_and_badges<br><i>propose_goal · propose_body_metric</i>",
                60, 320, 300, 90, STEP)
    ct = d.node("search_exercises · get_exercise_detail<br>get_overload_suggestion · get_personal_records<br>list_workout_templates · suggest_template<br>"
                "<i>create_workout_plan · propose_weekly_schedule</i>", 430, 320, 300, 110, STEP)
    nt = d.node("search_food_library · get_nutrition_history<br>calculate_nutrition_targets<br><i>propose_meal_log · create_meal_plan</i>",
                800, 320, 300, 90, STEP)
    d.edge(h, ht)
    d.edge(c, ct)
    d.edge(n, nt)
    sh = d.node(br("Công cụ dùng chung (cả 3 agent)", "get_user_profile · get_today_summary · get_readiness · get_goals · get_body_metrics",
                   "navigate · remember · search_knowledge (RAG)"), 260, 480, 640, 76, OK)
    for a in (ht, ct, nt):
        d.edge(a, sh, "", DASHED)
    hitl = d.node(br("Người dùng bấm Xác nhận", "đề xuất propose_* chỉ được ghi vào DB sau bước này"), 330, 610, 500, 60, WARN)
    d.edge(sh, hitl, "thẻ xác nhận")
    d.text("Agent nào gọi công cụ không thuộc quyền của mình sẽ bị từ chối (run_tool kiểm tra danh sách agent của từng công cụ).",
           60, 700, 1040, 30)
    return d


# ============================================================ 5. Guardrails 4 lớp
def d_guard() -> Diagram:
    d = Diagram("05_guardrails", "5. Guardrails 4 lớp",
                "Lớp 1-2 lọc đầu vào, lớp 3 chặn ngay trong công cụ, lớp 4 soát câu trả lời trước khi lưu và hiển thị.")
    inn = d.node("Tin nhắn", 40, 130, 120, 50, TERM)
    w, y = 220, 100
    l1 = d.box("① Luật đầu vào (regex)", 200, y, w, 300)
    d.node(br("CHẶN", "cấp cứu · khủng hoảng tâm lý", "rối loạn ăn uống · chất cấm"), 15, 45, 190, 90, ERR, l1)
    d.node(br("GHI CHÚ", "thận trọng y tế · prompt injection", "ăn kiêng cực đoan"), 15, 160, 190, 90, WARN, l1)
    l2 = d.box("② LLM phân loại", 450, y, w, 300)
    d.node(br("Chỉ với câu lưng chừng", "label + confidence", "chặn khi ≥ 0,8"), 15, 45, 190, 90, STEP, l2)
    d.node(br("Ví dụ bắt được", "“sống chẳng còn ý nghĩa gì”"), 15, 160, 190, 80, NOTE, l2)
    l3 = d.box("③ Trong công cụ", 700, y, w, 300)
    d.node("propose_goal từ chối giảm cân > ~1,25%/tuần", 15, 40, 190, 54, STEP, l3)
    d.node("remember từ chối câu lệnh (memory poisoning)", 15, 104, 190, 54, STEP, l3)
    d.node("Ghi dữ liệu luôn chờ người dùng xác nhận", 15, 168, 190, 54, STEP, l3)
    d.node("MCP chỉ mở công cụ đọc", 15, 232, 190, 44, STEP, l3)
    l4 = d.box("④ Soát câu trả lời", 950, y, w, 300)
    d.node(br("Phát hiện", "calo < 1200/1500 · giảm cân quá nhanh", "nhịn ăn nhiều ngày · chẩn đoán", "liều thuốc · lộ prompt"),
           15, 45, 190, 110, STEP, l4)
    d.node(br("Xử lý", "nối “Lưu ý an toàn”", "lộ prompt → thay cả câu"), 15, 175, 190, 80, OK, l4)
    d.edge(inn, l1)
    d.edge(l1, l2)
    d.edge(l2, l3)
    d.edge(l3, l4)
    d.node(br("Prompt có “ranh giới dữ liệu”", "trí nhớ, kết quả công cụ, chữ trong ảnh chỉ là dữ liệu, không phải lệnh"),
           200, 440, 470, 60, NOTE)
    d.node(br("Nhà cung cấp tự từ chối nội dung (lỗi 400)", "→ chuyển nhà cung cấp khác / trả lời từ chối lịch sự"), 700, 440, 470, 60, NOTE)
    return d


# ============================================================ 6. RAG
def d_rag() -> Diagram:
    d = Diagram("06_rag", "6. Pipeline RAG: xây chỉ mục và truy vấn",
                "Vector của kho kiến thức được tính sẵn; lúc chạy chỉ embed câu hỏi, rồi gộp BM25 và vector bằng Reciprocal Rank Fusion (RRF).")
    b = d.box("Xây chỉ mục · scripts/build_knowledge_index.py (chạy khi sửa kho)", 40, 100, 1080, 150)
    k = d.node(br("data/knowledge/*.md", "68 đoạn · 6 chủ đề · có nguồn"), 20, 50, 230, 70, DOC, b)
    p = d.node(br("Tách đoạn", "tiêu đề · nguồn · từ khoá · hash"), 300, 50, 220, 70, STEP, b)
    e = d.node(br("Embedding Gemini", "gemini-embedding-001 · 768 chiều"), 570, 50, 230, 70, EXT, b)
    idx = d.node(br("knowledge_index.json", "vector + hash"), 850, 45, 200, 80, DATA, b)
    d.edge(k, p, parent=b)
    d.edge(p, e, parent=b)
    d.edge(e, idx, parent=b)
    q = d.box("Truy vấn · công cụ search_knowledge", 40, 290, 1080, 260)
    qq = d.node("Câu hỏi của agent", 20, 105, 170, 56, TERM, q)
    bm = d.node(br("BM25", "bỏ dấu tiếng Việt", "từ đơn + cụm 2 từ"), 240, 45, 200, 76, STEP, q)
    qe = d.node(br("Embed câu hỏi", "~0,3-0,5 s · có cache"), 240, 160, 200, 66, EXT, q)
    vv = d.node(br("Cosine", "với vector các đoạn"), 490, 160, 180, 66, STEP, q)
    f = d.node(br("Gộp RRF", "1 / (60 + hạng)"), 720, 100, 150, 66, STEP, q)
    top = d.node(br("Top 3 đoạn", "+ tên nguồn"), 910, 100, 150, 66, OK, q)
    d.edge(qq, bm, parent=q)
    d.edge(qq, qe, parent=q)
    d.edge(qe, vv, parent=q)
    d.edge(bm, f, parent=q)
    d.edge(vv, f, parent=q)
    d.edge(f, top, parent=q)
    d.edge(qe, bm, "lỗi mạng → chỉ BM25", DASHED, parent=q)
    d.edge(idx, vv, "vector đoạn", DASHED, extra="exitX=0.5;exitY=1;entryX=0.5;entryY=0;")
    ag = d.node(br("Agent trả lời", "trích [1], [2]"), 920, 590, 200, 60, AGENT)
    ui = d.node(br("Thẻ “Nguồn tham khảo”", "dưới câu trả lời"), 620, 590, 230, 60, OK)
    d.edge(top, ag, "", extra="exitX=0.5;exitY=1;")
    d.edge(ag, ui)
    d.node(br("Kết quả đo (40 câu)", "BM25: hit@1 92,5% · hit@3 100%", "Vector & Hybrid: hit@1 100% · MRR 1,0"), 60, 580, 320, 80, NOTE)
    return d


# ============================================================ 7. Chuỗi dự phòng LLM
def d_fallback() -> Diagram:
    d = Diagram("07_llm_fallback", "7. Chuỗi dự phòng mô hình AI",
                "Điểm nào (nhà cung cấp · key · model) lỗi 429/5xx/hết credit thì tạm nghỉ 60 giây (hết hạn mức ngày: 1 giờ) và thử điểm kế tiếp.")
    req = d.node("Yêu cầu gọi model", 40, 110, 180, 56, TERM)
    img = d.node("Có ảnh?", 50, 210, 160, 90, DEC)
    m1 = d.node(br("Mercury-3", "key chính"), 300, 220, 170, 66, AGENT)
    m2 = d.node(br("Mercury-3", "key dự phòng (nếu có)"), 540, 220, 190, 66, AGENT)
    g1 = d.node(br("Gemini 3.5 Flash", "key 1 → key 2"), 300, 380, 190, 66, EXT)
    g2 = d.node("Gemini 3 Flash Preview", 540, 380, 190, 66, EXT)
    g3 = d.node(br("Gemini Flash Latest", "→ Flash Lite"), 790, 380, 190, 66, EXT)
    ok = d.node(br("Thành công", "trả kết quả · ghi span: nhà cung cấp, model, token, số lần chuyển"), 790, 210, 300, 80, OK)
    err = d.node(br("Tất cả đều lỗi", "báo lỗi thân thiện / từ chối lịch sự"), 790, 530, 260, 66, ERR)
    d.edge(req, img)
    d.edge(img, m1, "không", style=EDGE + YES)
    d.edge(img, g1, "có ảnh", style=EDGE + NO, extra="exitX=0.5;exitY=1;entryX=0;entryY=0.5;")
    d.edge(m1, m2, "429 / 5xx", style=EDGE + NO)
    d.edge(m1, g1, "bị từ chối nội dung", style=EDGE + NO, extra="exitX=0.3;exitY=1;entryX=0.3;entryY=0;")
    d.edge(m2, g1, "lỗi", style=EDGE + NO, extra="exitX=0.5;exitY=1;entryX=0.8;entryY=0;")
    d.edge(g1, g2, "429", style=EDGE + NO)
    d.edge(g2, g3, "429", style=EDGE + NO)
    d.edge(g3, err, "lỗi", style=EDGE + NO)
    d.edge(m2, ok, "OK", style=EDGE + YES)
    d.edge(g3, ok, "OK", style=EDGE + YES)
    d.node(br("Tham số tuỳ chọn tự bỏ", "reasoning_effort, stream_options không được hỗ trợ → bỏ và gọi lại"), 40, 530, 360, 66, NOTE)
    return d


# ============================================================ 8. Sequence human-in-the-loop
def d_hitl() -> Diagram:
    d = Diagram("08_hitl_sequence", "8. Human-in-the-loop: ghi bữa ăn qua chat (sơ đồ tuần tự)",
                "Agent không tự ghi dữ liệu: propose_meal_log chỉ tạo PendingAction + thẻ xác nhận; bữa ăn chỉ được lưu khi người dùng bấm Xác nhận.")
    names = ["Người dùng", "Giao diện", "FastAPI", "Orchestrator", "NutriBro (LLM)", "Database"]
    xs = [70 + i * 175 for i in range(len(names))]
    top, bottom = 110, 900
    for i, (nm, x) in enumerate(zip(names, xs)):
        st = ("shape=umlLifeline;perimeter=lifelinePerimeter;container=0;collapsible=0;size=44;html=1;whiteSpace=wrap;fontSize=13;fontStyle=1;"
              + ("fillColor=#1E3A8A;fontColor=#FFFFFF;strokeColor=#1E3A8A;" if i == 0 else "fillColor=#EFF6FF;strokeColor=#2563EB;fontColor=#0F172A;"))
        d.node(nm, x - 70, top, 140, bottom - top, st)
    cx = xs
    msgs = [
        (0, 1, "“Trưa nay ăn 1 đĩa cơm tấm”", False),
        (1, 2, "POST /api/chat/send", False),
        (2, 3, "handle_message()", False),
        (3, 4, "prompt + công cụ của NutriBro", False),
        (4, 3, "gọi search_food_library", True),
        (3, 5, "tra thư viện món", False),
        (3, 1, "SSE: tool_call, card(foods)", True),
        (4, 3, "gọi propose_meal_log", True),
        (3, 5, "tạo PendingAction (pending)", False),
        (3, 1, "SSE: card(confirm), câu trả lời, trace, done", True),
        (0, 1, "bấm “Xác nhận” (có thể sửa số)", False),
        (1, 2, "POST /actions/{id}/confirm", False),
        (2, 5, "execute_action → tạo Meal", False),
        (2, 1, "OK → Dashboard, Nutrition cập nhật", True),
    ]
    y = top + 80
    for i, (a, b, label, ret) in enumerate(msgs):
        if i == 10:
            d.node("Đến đây CHƯA có gì được ghi vào nhật ký ăn uống", xs[0] - 40, y - 8, 470, 34, NOTE)
            y += 62
        st = EDGE.replace("edgeStyle=orthogonalEdgeStyle;rounded=1;", "") + "verticalAlign=bottom;labelBackgroundColor=none;" + ("dashed=1;endArrow=open;" if ret else "")
        d.line(cx[a], y, cx[b], y, f"{i + 1}. {label}", st)
        y += 50
    return d


# ============================================================ 9. Observability
def d_obs() -> Diagram:
    d = Diagram("09_observability", "9. Observability: trace của một lượt chat",
                "Mỗi lượt chat là 1 trace gồm nhiều span (ghi bằng contextvars). Trace được lưu DB, in log JSON và hiển thị ở trang Nhật ký AI.")
    run = d.box("Trong lúc xử lý một tin nhắn", 40, 100, 520, 430)
    spans = [("span guard · input", "mức, loại, phương pháp, ghi chú", WARN),
             ("span router", "agent được chọn, cách định tuyến", STEP),
             ("span agent", "ví dụ coachbro", AGENT),
             ("span llm", "nhà cung cấp, model, token, chữ đầu tiên, dự phòng", STEP),
             ("span tool", "tên, tham số, thời gian, lỗi", STEP),
             ("span rag", "phương pháp, các đoạn tìm được", STEP),
             ("span guard · output", "cờ an toàn của câu trả lời", WARN)]
    prev = None
    for i, (a, b, st) in enumerate(spans):
        indent = 40 if i in (3, 4, 5) else 0
        cid = d.node(br(a, b), 20 + indent, 42 + i * 54, 440 - indent, 46, st, run)
        if prev and i in (1, 2):
            d.edge(prev, cid, parent=run)
        prev = cid
    t = d.node(br("Trace", "tổng thời gian · TTFT · số LLM / công cụ", "token vào/ra · ok / lỗi / bị chặn"), 640, 250, 260, 90, AGENT)
    d.edge(run, t)
    log = d.node(br("1 dòng log JSON", "tìm trên log Vercel/Render"), 960, 120, 200, 70, EXT)
    sse = d.node(br("Sự kiện SSE “trace”", "biểu tượng ⚡ dưới câu trả lời"), 960, 255, 200, 76, STEP)
    db = d.node(br("bảng agent_traces", "giữ 30 ngày"), 970, 390, 180, 90, DATA)
    d.edge(t, log, extra="exitX=0.85;exitY=0;entryX=0;entryY=0.5;")
    d.edge(t, sse, extra="exitX=1;exitY=0.5;")
    d.edge(t, db, extra="exitX=0.5;exitY=1;entryX=0;entryY=0.5;")
    api = d.node(br("API", "/api/traces · /stats · /{id}"), 950, 545, 220, 60, STEP)
    page = d.node(br("Trang Nhật ký AI", "p50/p95 · lỗi · token · công cụ chậm", "biểu đồ dòng thời gian từng lượt"), 620, 535, 270, 80, OK)
    d.edge(db, api)
    d.edge(api, page)
    return d


# ============================================================ 10. Eval
def d_eval() -> Diagram:
    d = Diagram("10_eval", "10. Quy trình đánh giá (eval)",
                "Ba tầng: test offline mỗi lần sửa code · eval end-to-end với model thật + giám khảo khác nhà cung cấp · đo riêng chất lượng tìm kiếm RAG.")
    t1 = d.box("Tầng 1 · Offline — pytest (không tốn API)", 40, 100, 340, 260)
    d.node(br("42 test", "công thức · API · multi-agent với LLM giả lập"), 15, 45, 310, 60, STEP, t1)
    d.node(br("guard_cases.json", "29 câu đầu vào + 17 câu đầu ra · phải đúng 100%"), 15, 115, 310, 60, STEP, t1)
    d.node(br("BM25 hit@3 ≥ 85%", "trace · API Nhật ký AI · MCP"), 15, 185, 310, 60, STEP, t1)
    t2 = d.box("Tầng 2 · End-to-end với model thật — evals/run_eval.py", 410, 100, 470, 440)
    c = d.node(br("cases.json", "39 case · 8 nhóm"), 20, 45, 200, 60, DOC, t2)
    db = d.node(br("DB tạm", "+ tài khoản demo"), 250, 45, 190, 60, DATA, t2)
    pipe = d.node(br("Chạy nguyên pipeline", "guard → router → agent → công cụ → guard ra"), 20, 135, 420, 60, AGENT, t2)
    auto = d.node(br("Kiểm tra tự động", "agent · công cụ · thẻ · guard", "cụm từ · RAG đúng đoạn"), 20, 225, 200, 80, STEP, t2)
    jd = d.node(br("LLM-as-judge", "Gemini chấm Mercury", "điểm 1-5 + cờ không an toàn"), 240, 225, 200, 80, EXT, t2)
    ps = d.node("Đạt khi qua kiểm tra<br>+ điểm ≥ 4 + an toàn", 120, 330, 220, 90, DEC, t2)
    d.edge(c, db, parent=t2)
    d.edge(db, pipe, parent=t2)
    d.edge(pipe, auto, parent=t2)
    d.edge(pipe, jd, parent=t2)
    d.edge(auto, ps, parent=t2)
    d.edge(jd, ps, parent=t2)
    t3 = d.box("Tầng 3 · RAG retrieval", 910, 100, 240, 260)
    d.node(br("rag_cases.json", "40 câu diễn đạt lại"), 15, 45, 210, 60, DOC, t3)
    d.node(br("BM25 / vector / hybrid", "hit@1 · hit@3 · MRR"), 15, 140, 210, 66, STEP, t3)
    rep = d.node(br("evals/reports/latest.md + .json", "lần gần nhất: 39/39 case đạt · định tuyến 100%", "chọn công cụ 100% · điểm giám khảo 4,95/5"),
                 760, 600, 380, 80, OK)
    d.edge(t2, rep)
    d.edge(t3, rep)
    return d


# ============================================================ 11. MCP
def d_mcp() -> Diagram:
    d = Diagram("11_mcp", "11. Kiến trúc MCP server",
                "FitBro mở công cụ chỉ đọc theo chuẩn Model Context Protocol cho mọi MCP client, với model bất kỳ. FitBro vẫn chạy đầy đủ khi không dùng MCP.")
    cl = d.box("MCP client bất kỳ", 40, 110, 280, 300)
    d.node(br("Ứng dụng chat", "hỗ trợ MCP"), 20, 45, 240, 60, EXT, cl)
    d.node(br("Trình soạn code", "IDE có MCP"), 20, 125, 240, 60, EXT, cl)
    d.node(br("Script tự viết", "scripts/mcp_demo_client.py"), 20, 205, 240, 60, EXT, cl)
    s = d.node(br("mcp_server.py", "FITBRO_USER_EMAIL", "stdio hoặc Streamable HTTP (127.0.0.1 + MCP_TOKEN)"), 420, 220, 300, 86, AGENT)
    d.edge(cl, s, "MCP")
    ro = d.node(br("22 công cụ CHỈ ĐỌC", "lấy từ registry của agent", "hồ sơ · hôm nay · tập · dinh dưỡng · RAG..."), 820, 110, 300, 80, STEP)
    ask = d.node(br("ask_fitbro", "chạy nguyên pipeline đa tác tử"), 820, 240, 300, 66, STEP)
    orc = d.node(br("Guard → Router → Agent", "có trace"), 850, 380, 240, 60, AGENT)
    no = d.node(br("KHÔNG mở", "propose_* · create_* · remember", "(ghi dữ liệu phải qua thẻ Xác nhận)"), 40, 470, 280, 80, ERR)
    db = d.node("Database FitBro", 480, 470, 180, 80, DATA)
    d.edge(s, ro, "", extra="exitX=1;exitY=0.2;")
    d.edge(s, ask, "", extra="exitX=1;exitY=0.6;")
    d.edge(s, no, "", DASHED + "endArrow=cross;", extra="exitX=0.1;exitY=1;entryX=1;entryY=0.5;")
    d.edge(s, db, "đọc", extra="exitX=0.5;exitY=1;")
    d.edge(ask, orc)
    d.edge(orc, db, extra="exitX=0;exitY=0.5;")
    return d


# ============================================================ 12. ERD
def d_erd() -> Diagram:
    d = Diagram("12_erd", "12. Mô hình dữ liệu (15 bảng)",
                "Mọi dữ liệu gắn với user_id. pending_actions: human-in-the-loop · memories: trí nhớ dài hạn của AI · agent_traces: observability.")
    T = "swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;startSize=28;horizontalStack=0;resizeParent=1;resizeParentMax=0;collapsible=0;html=1;fontSize=14;rounded=1;arcSize=6;"
    ROW = "text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=8;html=1;fontSize=12;fontColor=#0F172A;"
    colors = {"core": "fillColor=#DBEAFE;strokeColor=#1D4ED8;", "train": "fillColor=#ECFDF5;strokeColor=#16A34A;",
              "food": "fillColor=#FFF7ED;strokeColor=#EA580C;", "ai": "fillColor=#F5F3FF;strokeColor=#7C3AED;"}
    ids: dict[str, str] = {}

    def table(name, x, y, rows, kind):
        tid = d.node(name, x, y, 200, 28 + 24 * len(rows), T + colors[kind])
        for i, r in enumerate(rows):
            d.node(r, 0, 28 + i * 24, 200, 24, ROW, tid)
        ids[name] = tid

    X = [40, 290, 540, 790, 1040]
    Y = [110, 330, 560]
    table("workout_plans", X[0], Y[0], ["PK id", "FK user_id", "name, focus, items (JSON)", "source: custom | ai"], "train")
    table("daily_logs", X[1], Y[0], ["PK id", "FK user_id", "date, sleep, fatigue...", "readiness, water_ml"], "train")
    table("profiles", X[2], Y[0], ["PK/FK user_id", "age, gender, height_cm", "weight_kg, goal, level", "target_calories..."], "core")
    table("body_metrics", X[3], Y[0], ["PK id", "FK user_id", "weight, body_fat, SMM", "segmental (JSON)"], "food")
    table("weekly_schedules", X[4], Y[0], ["PK/FK user_id", "days (JSON)"], "train")
    table("workout_sets", X[0], Y[1], ["PK id", "FK session_id", "exercise_id, weight_kg", "reps, rpe, form_score"], "train")
    table("workout_sessions", X[1], Y[1], ["PK id", "FK user_id", "plan_id, started_at", "total_volume, avg_form"], "train")
    table("users", X[2], Y[1], ["PK id", "email", "password_hash", "name"], "core")
    table("meals", X[3], Y[1], ["PK id", "FK user_id", "date, meal_type", "kcal, P/C/F, source"], "food")
    table("pending_actions", X[4], Y[1], ["PK id", "FK user_id", "type, payload (JSON)", "status: pending | confirmed"], "ai")
    table("messages", X[0], Y[2], ["PK id", "FK conversation_id", "role, agent, content", "meta (JSON: thẻ, trace_id)"], "ai")
    table("conversations", X[1], Y[2], ["PK id", "FK user_id", "title, updated_at"], "ai")
    table("agent_traces", X[2], Y[2], ["PK id", "FK user_id, conversation_id", "spans (JSON), total_ms", "tokens, status, output_flags"], "ai")
    table("goals", X[3], Y[2], ["PK id", "FK user_id", "metric, target, deadline", "status"], "food")
    table("memories", X[4], Y[2], ["PK id", "FK user_id", "content, category"], "ai")
    rel = "html=1;strokeColor=#64748B;strokeWidth=1.3;startArrow=ERmandOne;endArrow=ERmany;endFill=0;startFill=0;startSize=10;endSize=10;"
    for t in ("daily_logs", "body_metrics", "workout_sessions", "meals", "conversations", "agent_traces", "goals"):
        d.edge(ids["users"], ids[t], style=rel)
    d.edge(ids["users"], ids["profiles"], style=rel.replace("ERmany", "ERmandOne"))
    d.edge(ids["workout_sessions"], ids["workout_sets"], style=rel)
    d.edge(ids["conversations"], ids["messages"], style=rel)
    d.edge(ids["conversations"], ids["agent_traces"], style=rel.replace("ERmandOne", "ERzeroToOne"))
    d.node("Xanh dương: tài khoản · Xanh lá: tập luyện · Cam: dinh dưỡng & cơ thể · Tím: AI. Các bảng ở 2 cột ngoài cùng (workout_plans, weekly_schedules, "
           "pending_actions, memories) cũng có FK user_id → users; đường nối được lược bớt cho dễ đọc.", 40, 740, 1200, 40, SUB)
    return d


# ============================================================ 13. Deploy
def d_deploy() -> Diagram:
    d = Diagram("13_deploy", "13. Triển khai (dự kiến)",
                "GitHub → Vercel (giao diện tĩnh + FastAPI dạng Python function) + Supabase PostgreSQL. Có thể thay bằng Render hoặc Docker trên VPS.")
    dev = d.node(br("Thành viên nhóm", "máy cá nhân · SQLite · key Gemini riêng"), 40, 140, 240, 70, TERM)
    gh = d.node(br("GitHub", "ico-231/ai-fitness-pal-team"), 440, 140, 240, 70, EXT)
    ci = d.node(br("GitHub Actions", "pytest + build mỗi lần push"), 440, 280, 240, 66, STEP)
    vc = d.box("Vercel", 780, 100, 300, 240)
    st = d.node(br("Giao diện React", "phục vụ qua CDN"), 20, 45, 260, 60, STEP, vc)
    fn = d.node(br("/api/* → FastAPI", "Python function"), 20, 150, 260, 60, AGENT, vc)
    sb = d.node(br("Supabase", "PostgreSQL"), 1150, 100, 150, 90, DATA)
    llm = d.node(br("Mercury / Gemini", "API model AI"), 1150, 260, 170, 66, EXT)
    user = d.node("Người dùng (HTTPS)", 800, 420, 260, 50, TERM)
    env = d.node(br("Biến môi trường trên Vercel", "key AI · SECRET_KEY · DATABASE_URL", "không nằm trong code"), 400, 400, 300, 80, NOTE)
    d.edge(dev, gh, "push / PR")
    d.edge(gh, ci)
    d.edge(gh, vc, "tự deploy main")
    d.edge(fn, sb, "DATABASE_URL", extra="exitX=1;exitY=0.3;entryX=0;entryY=0.5;")
    d.edge(fn, llm, "", extra="exitX=1;exitY=0.7;")
    d.edge(user, vc, "", extra="exitX=0.5;exitY=0;")
    d.edge(env, fn, "", DASHED, extra="exitX=1;exitY=0.3;entryX=0;entryY=0.7;")
    return d


def main() -> None:
    OUT.mkdir(exist_ok=True)
    builders = [d_architecture, d_flow, d_usecase, d_agents, d_guard, d_rag, d_fallback, d_hitl, d_obs, d_eval, d_mcp, d_erd, d_deploy]
    pages = []
    for i, b in enumerate(builders, 1):
        dg = b()
        DIAGRAMS.append(dg)
        xml = f'<mxfile host="FitBro" type="device">{dg.page(i)}</mxfile>'
        (OUT / f"{dg.name}.drawio").write_text(xml, encoding="utf-8")
        pages.append(dg.page(i))
    (HERE / "FitBro_so_do.drawio").write_text('<mxfile host="FitBro" type="device">' + "".join(pages) + "</mxfile>", encoding="utf-8")
    print(f"Đã ghi {len(pages)} sơ đồ vào {OUT} và FitBro_so_do.drawio")


if __name__ == "__main__":
    main()
