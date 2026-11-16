"""Tạo TÀI KHOẢN DEMO có sẵn ~12 tuần dữ liệu chi tiết để trình diễn (không ảnh hưởng tài khoản khác).

Chạy:   cd backend && python seed_demo.py
Đăng nhập: demo@fitbro.vn / demo123

Chạy lại bất cứ lúc nào: tài khoản demo cũ bị xoá và tạo lại, dữ liệu luôn "kết thúc ở hôm nay",
và mọi máy chạy ra CÙNG một bộ dữ liệu (số ngẫu nhiên có seed cố định).

Câu chuyện của dữ liệu (để Dashboard, biểu đồ, Nhật ký AI đều có điều để nói):
- Tuần 1-4  : mới tập lại, 3 buổi/tuần (Ngực – Chân – Lưng), cân giảm đều.
- Tuần 3    : vai trái hơi đau → CoachBro tạo buổi ngực "bảo vệ vai", dùng thay buổi ngực cũ.
- Tuần 5+   : lên lịch 5 buổi/tuần + HIIT, Chủ nhật thỉnh thoảng tập bụng/giãn cơ.
- Tuần 6-7  : cân chững lại, cuối tuần 7 đi ăn cỗ cưới → cân tăng nhẹ rồi giảm lại.
- Tuần 8    : bị cảm 5 ngày, nghỉ tập, điểm sẵn sàng thấp.
- Tuần 10   : tuần giảm tải (deload) — giảm 1 hiệp, giảm tạ ~15%.
- Hôm nay   : đã check-in, ăn sáng + trưa, CHƯA tập, có 1 thẻ "lưu cân nặng" đang chờ xác nhận.

Kèm 10 cuộc trò chuyện mẫu (có thẻ bài tập/thực đơn/nguồn RAG/thẻ xác nhận, có lần Safety Guard chặn)
và trace tương ứng để trang Nhật ký AI có nội dung ngay. Trace của hội thoại mẫu được đánh dấu "mẫu"
(thời gian/token là số minh hoạ, không phải đo thật).
"""
from __future__ import annotations

import copy
import datetime as dt
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
for _s in (sys.stdout, sys.stderr):  # cửa sổ lệnh Windows mặc định không in được tiếng Việt
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

from sqlalchemy import select  # noqa: E402

from app.agents import tools as T  # noqa: E402
from app.db import SessionLocal, init_db  # noqa: E402
from app.models import (  # noqa: E402
    AgentTrace, BodyMetric, Conversation, DailyLog, Goal, Meal, Memory, Message, PendingAction, Profile, User,
    WeeklySchedule, WorkoutPlan, WorkoutSession, WorkoutSet,
)
from app.security import hash_password  # noqa: E402
from app.services import exercises as exsvc  # noqa: E402
from app.services import foods as foodsvc  # noqa: E402
from app.services import formulas, knowledge, stats  # noqa: E402
from app.services import templates as tplsvc  # noqa: E402

EMAIL, PASSWORD, NAME = "demo@fitbro.vn", "demo123", "Minh"
DAYS = 84  # 12 tuần
rng = random.Random(2026)

# Lịch tuần (0 = Thứ 2). Giai đoạn đầu 3 buổi, từ tuần 5 lên 5 buổi.
SCHEDULE_A = {0: "tpl_chest", 2: "tpl_leg", 4: "tpl_back"}
SCHEDULE_B = {0: "tpl_chest", 1: "tpl_leg", 3: "tpl_back", 4: "tpl_arm", 5: "tpl_hiit"}
SICK = range(49, 54)  # ngày thứ 49-53: bị cảm
DELOAD = range(63, 70)  # tuần giảm tải
WEDDING = 47  # ngày ăn cỗ cưới (Chủ nhật tuần 7)

# Mức tạ khởi điểm (kg) — tăng dần theo tuần (progressive overload)
BASE_KG = {
    "0025": 47.5, "0314": 14, "0251": 0, "0308": 8, "0662": 0,
    "0043": 55, "0085": 45, "0336": 10, "0586": 27.5, "0417": 14,
    "0652": 0, "0027": 40, "0150": 40, "0861": 35, "0406": 18,
    "0031": 22.5, "0241": 17.5, "0313": 8, "0060": 17.5, "0283": 0,
    "0405": 12, "0334": 6, "0380": 5, "0154": 10, "0095": 40,
}

MENUS = {
    "breakfast": [["banh_mi", "ca_phe_sua"], ["pho_bo"], ["yen_mach", "chuoi"], ["xoi", "sua_dau_nanh"],
                  ["trung_luoc", "trung_luoc", "banh_mi"], ["bun_bo_hue"], ["banh_cuon"], ["pho_ga"], ["chao_ga"]],
    "lunch": [["com_ga"], ["com_tam"], ["com_trang", "uc_ga", "rau_muong", "canh_chua"], ["bun_cha"],
              ["com_trang", "ca_kho", "rau_muong"], ["bun_thit_nuong"], ["mi_quang"], ["com_trang", "ga_luoc", "canh_rau_ngot"],
              ["hu_tieu"], ["com_trang", "dau_phu_sot", "rau_muong"]],
    "snack": [["greek_yogurt"], ["chuoi", "sua_tuoi"], ["whey"], ["tao"], ["sua_chua", "xoai"], ["cam"], ["sinh_to_bo"]],
    "dinner": [["com_trang", "uc_ga", "bong_cai"], ["com_trang", "thit_kho", "canh_rau_ngot"], ["com_gao_lut", "ca_hoi", "bong_cai"],
               ["bun_rieu"], ["com_trang", "dau_phu_sot", "rau_muong"], ["com_gao_lut", "bo_bit_tet", "bong_cai"],
               ["com_trang", "ga_nuong", "canh_chua"]],
    "weekend": [["lau"], ["bun_dau"], ["banh_xeo", "goi_cuon"], ["com_rang"], ["banh_trang_tron", "tra_sua"], ["mi_xao"], ["bun_mam"]],
}


def utc_at(day: dt.date, hour: int, minute: int = 0) -> dt.datetime:
    local = dt.datetime.combine(day, dt.time(hour, minute), tzinfo=stats.tz())
    return local.astimezone(dt.timezone.utc).replace(tzinfo=None)


def weight_on(i: int) -> float:
    """Cân nặng 'thật' ngày thứ i: giảm đều → chững → tăng nhẹ sau cỗ cưới → giảm lại."""
    if i <= 35:
        w = 72.0 - 0.07 * i
    elif i <= WEDDING:
        w = 72.0 - 0.07 * 35 - 0.004 * (i - 35)
    else:
        w = 72.0 - 0.07 * 35 - 0.05 - 0.046 * (i - WEDDING)
        if i < WEDDING + 5:
            w += 0.6 * (1 - (i - WEDDING) / 5)  # giữ nước sau bữa cỗ
    return w


def meal_row(user: User, d: dt.date, mt: str, combo: list[str], hour: int, servings: float = 1.0, source: str = "library") -> Meal:
    items = [f for f in (foodsvc.get_food(x) for x in combo) if f]
    rows = [{"name": f["name"], "grams": round(f["grams"] * servings), "food_id": f["id"], "servings": servings,
             **{k: round(f[k] * servings, 1) for k in ("calories", "protein", "carbs", "fat")}} for f in items]
    tot = {k: round(sum(r[k] for r in rows), 1) for k in ("calories", "protein", "carbs", "fat")}
    first = items[0]
    analysis = f"{first['summary']} Mẹo: {first['tip']}"
    if source == "photo":
        analysis = (f"Nhận diện từ ảnh: {', '.join(r['name'] for r in rows)} (khoảng {round(tot['calories'])} kcal, "
                    f"{round(tot['protein'])}g đạm). {first['tip']}")
    return Meal(user_id=user.id, date=d, meal_type=mt, name=" + ".join(f["name"] for f in items), items=rows,
                image=first["image"], source=source, created_at=utc_at(d, hour, rng.randint(0, 40)), analysis=analysis, **tot)


# ---------------------------------------------------------------------------
# Dữ liệu theo ngày
# ---------------------------------------------------------------------------


def seed_days(db, user: User, today: dt.date, start: dt.date, reserved: set) -> None:
    for i in range(DAYS + 1):
        d = start + dt.timedelta(days=i)
        is_today = d == today
        week = i / 7
        sick = i in SICK

        # Check-in buổi sáng (thỉnh thoảng quên)
        if is_today or rng.random() < 0.9:
            sh = 5.5 if sick else rng.choice([5.5, 6, 6.5, 7, 7, 7.5, 7.5, 8, 8])
            sq = rng.randint(1, 3) if sick else rng.randint(2, 5)
            fat = rng.randint(4, 5) if sick else rng.randint(1, 4)
            sore = rng.randint(1, 4)
            stress = rng.randint(1, 4)
            if is_today:
                sh, sq, fat, sore, stress = 7.5, 4, 2, 2, 2
            r = formulas.readiness_score(sh, sq, fat, sore, stress)
            note = ""
            if sick:
                note = rng.choice(["Bị cảm, sốt nhẹ, nghẹt mũi", "Vẫn mệt, ho nhiều", "Đỡ hơn nhưng chưa tập được"])
            elif i in DELOAD and d.weekday() == 0:
                note = "Bắt đầu tuần deload theo gợi ý của CoachBro"
            elif i == WEDDING + 1:
                note = "Hôm qua ăn cỗ cưới hơi nhiều"
            water = 750 if is_today else (rng.choice([1250, 1500, 1750]) if sick else rng.choice([1500, 1750, 2000, 2250, 2500, 2750]))
            db.add(DailyLog(user_id=user.id, date=d, sleep_hours=sh, sleep_quality=sq, fatigue=fat, soreness=sore, stress=stress,
                            readiness=r["score"], water_ml=water, note=note, checked_in_at=utc_at(d, 7, 10)))

        # Buổi tập theo lịch (hôm nay để trống cho người dùng tự tập)
        sched = SCHEDULE_A if i < 28 else SCHEDULE_B
        tpl_id = sched.get(d.weekday())
        if d.weekday() == 6 and i >= 28 and rng.random() < 0.45:
            tpl_id = rng.choice(["tpl_core", "tpl_recovery"])
        if tpl_id and not is_today and not sick and rng.random() < 0.88:
            add_session(db, user, d, tpl_id, week, deload=i in DELOAD)

        # Bữa ăn (hôm nay chỉ có bữa sáng + trưa)
        weekend = d.weekday() >= 5
        hours = {"breakfast": 7, "lunch": 12, "snack": 16, "dinner": 19}
        for mt in ["breakfast", "lunch", "snack", "dinner"]:
            if (d, mt) in reserved or (is_today and mt in ("snack", "dinner")):
                continue
            if i == WEDDING and mt == "dinner":
                db.add(Meal(user_id=user.id, date=d, meal_type="dinner", name="Cỗ cưới (nhiều món)", source="text",
                            items=[{"name": "Gà luộc, nem rán, xôi gấc, lẩu hải sản (bỏ tôm cua), bia", "grams": 0,
                                    "calories": 1450, "protein": 62, "carbs": 120, "fat": 72}],
                            calories=1450, protein=62, carbs=120, fat=72, created_at=utc_at(d, 19, 30),
                            analysis="Ước tính từ mô tả: bữa cỗ nhiều dầu mỡ và bia. Hôm sau không cần nhịn ăn bù, chỉ cần quay lại thực đơn bình thường."))
                continue
            if rng.random() > (0.95 if mt != "snack" else 0.6) or (sick and mt == "snack"):
                continue
            pool = MENUS["weekend"] if weekend and mt == "dinner" and rng.random() < 0.6 else MENUS[mt]
            if sick and mt in ("breakfast", "dinner"):
                pool = [["chao_ga"], ["pho_ga"]]
            combo = rng.choice(pool)
            sv = rng.choice([1, 1, 1, 1.5]) if combo[0] in ("com_trang", "com_gao_lut") else 1
            src = "photo" if rng.random() < 0.12 else "library"
            db.add(meal_row(user, d, mt, combo, hours[mt], sv, src))
            if mt == "dinner" and not weekend and rng.random() < 0.25:  # ăn quá: thêm trà sữa
                db.add(meal_row(user, d, "snack", ["tra_sua"], 21))


def add_session(db, user: User, d: dt.date, tpl_id: str, week: float, deload: bool = False, plan: WorkoutPlan | None = None) -> None:
    tpl = {"name": plan.name, "items": plan.items} if plan else tplsvc.get_template(tpl_id)
    begin = utc_at(d, 18, rng.randint(0, 20))
    note = rng.choice(["", "", "", "Hôm nay khoẻ, tăng được tạ", "Hơi mệt, giữ tạ cũ", "Tập cùng bạn"])
    if deload:
        note = "Tuần deload: giảm 1 hiệp, tạ nhẹ hơn ~15%"
    sess = WorkoutSession(user_id=user.id, plan_id=plan.id if plan else tpl_id, name=tpl["name"], started_at=begin,
                          status="completed", notes=note)
    db.add(sess)
    db.flush()
    t = begin
    volume, forms = 0.0, []
    for it in tpl["items"]:
        ex = exsvc.get_exercise(it["exercise_id"])
        base = BASE_KG.get(ex["id"], 0)
        kg = round((base * (1 + 0.03 * week) * (0.85 if deload else 1)) / 2.5) * 2.5 if base else 0
        sets = max(1, it["sets"] - (1 if deload else 0))
        for s in range(1, sets + 1):
            reps = 0 if it["duration_sec"] else max(4, it["reps"] - rng.choice([0, 0, 0, 1, 2]) - (1 if s == sets else 0))
            form = round(rng.uniform(72, 96)) if ex["camera"] and rng.random() < 0.5 else None
            rpe = None if it["duration_sec"] else (rng.choice([8, 8.5, 9, 9.5]) if s == sets else rng.choice([6.5, 7, 7.5, 8]))
            if deload and rpe:
                rpe = min(rpe, 7)
            t += dt.timedelta(seconds=(it["duration_sec"] or reps * 4) + it["rest_sec"])
            db.add(WorkoutSet(session_id=sess.id, user_id=user.id, exercise_id=ex["id"], exercise_name=ex["name"], set_index=s,
                              weight_kg=kg, reps=reps, duration_sec=it["duration_sec"], form_score=form, rpe=rpe,
                              muscles={"primary": ex["primary"], "secondary": ex["secondary"]}, created_at=t))
            volume += kg * reps
            if form:
                forms.append(form)
        t += dt.timedelta(seconds=90)
    sess.ended_at = t
    sess.duration_sec = int((t - begin).total_seconds())
    sess.total_volume = round(volume, 1)
    sess.avg_form_score = round(sum(forms) / len(forms)) if forms else None


def seed_body(db, user: User, today: dt.date, start: dt.date) -> float:
    last = 72.0
    for i in range(DAYS):  # hôm nay cân qua chat (thẻ chờ xác nhận)
        d = start + dt.timedelta(days=i)
        inbody = i % 28 == 0 or i == DAYS - 4
        if not inbody and d.weekday() not in (0, 3, 5):
            continue
        if i in SICK:
            continue
        wt = round(weight_on(i) + rng.uniform(-0.25, 0.25), 1)
        last = wt
        if inbody:
            frac = i / DAYS
            bf = round(23.0 - 3.4 * frac + rng.uniform(-0.2, 0.2), 1)
            smm = round(30.0 + 0.6 * frac, 1)
            db.add(BodyMetric(
                user_id=user.id, date=d, weight_kg=wt, body_fat_pct=bf, skeletal_muscle_kg=smm, body_fat_kg=round(wt * bf / 100, 1),
                visceral_fat=round(8 - 2 * frac), bmr_kcal=round(1575 + 25 * frac), waist_cm=round(87 - 4.5 * frac, 1),
                chest_cm=round(96 + 0.5 * frac, 1), hip_cm=round(98 - 2 * frac, 1), arm_cm=round(31 + 0.6 * frac, 1),
                thigh_cm=round(56 - 1 * frac, 1),
                segmental={"left_arm": round(3.0 + 0.1 * frac, 2), "right_arm": round(3.3 + 0.1 * frac, 2), "trunk": round(24.4 + 0.3 * frac, 1),
                           "left_leg": round(9.3 + 0.1 * frac, 1), "right_leg": round(9.4 + 0.1 * frac, 1)},
                source="inbody_scan", note="Đo InBody ở phòng gym, buổi sáng trước khi ăn", created_at=utc_at(d, 7)))
        else:
            db.add(BodyMetric(user_id=user.id, date=d, weight_kg=wt, source="manual", created_at=utc_at(d, 6, 45)))
    return last


# ---------------------------------------------------------------------------
# Hội thoại mẫu + trace
# ---------------------------------------------------------------------------


class Chat:
    """Dựng 1 cuộc trò chuyện: chạy công cụ THẬT để có thẻ giao diện đúng định dạng, lời đáp viết sẵn."""

    def __init__(self, db, user: User, prof: Profile, when: dt.datetime, title: str):
        self.db, self.user, self.prof, self.when = db, user, prof, when
        self.conv = Conversation(user_id=user.id, title=title, created_at=when, updated_at=when)
        db.add(self.conv)
        db.flush()
        self.t = when
        self.spans: list[dict] = []
        self.clock = 0
        self.tokens = [0, 0]
        self.last_msg: Message | None = None
        self.agents: list[str] = []
        self.rag: list[dict] = []

    def _tick(self, sec: float) -> dt.datetime:
        self.t += dt.timedelta(seconds=sec)
        return self.t

    def _span(self, kind: str, name: str, stage: str, ms: int, **kw) -> None:
        sp = {"kind": kind, "name": name, "stage": stage, "start_ms": self.clock, "ms": ms, **kw}
        if not self.spans:
            sp["sample"] = True
        self.spans.append(sp)
        self.clock += ms

    def _llm(self, stage: str, tool_calls: list[str] | None = None, name: str = "stream") -> None:
        tin, tout = rng.randint(4200, 6800), rng.randint(40, 90) if tool_calls else rng.randint(180, 420)
        self.tokens[0] += tin
        self.tokens[1] += tout
        ms = rng.randint(700, 1500) if tool_calls else rng.randint(1200, 2600)
        self._span("llm", name, stage, ms, provider="primary", model="mercury-3", tokens_in=tin, tokens_out=tout,
                   ttft_ms=None if tool_calls else rng.randint(450, 900), tool_calls=tool_calls)

    def ask(self, text: str) -> None:
        self.db.add(Message(conversation_id=self.conv.id, role="user", content=text, meta={}, created_at=self._tick(0)))
        self.question = text
        self._span("guard", "input", "guard", 1, level="ok", method="rule")

    def route(self, agents: list[str], method: str = "keyword", reason: str = "Chủ đề rõ ràng theo từ khoá", notes=None) -> None:
        if notes:
            self.spans[-1].update(level="caution", guard_kind=notes[0], notes=notes)
        self.agents = agents
        self.reason = reason
        self._span("router", "route", "router", 1 if method == "keyword" else rng.randint(450, 800), agents=agents, method=method)
        self.method = method

    def agent(self, agent: str, calls: list[tuple], answer: str, confirm: bool | None = None, followups=None,
              synthesis: bool = False) -> dict:
        """calls = [(tool_name, args), ...] chạy lần lượt; confirm=True → bấm Xác nhận các thẻ propose_*."""
        ctx = T.ToolContext(db=self.db, user=self.user, profile=self.prof, agent=agent, conversation_id=self.conv.id)
        start = self.clock
        self.spans.append({"kind": "agent", "name": agent, "stage": agent, "start_ms": start, "ms": 0})
        agent_span = self.spans[-1]
        trace, outs = [], {}
        for name, args in calls:
            self._llm(agent, [name])
            out = T.run_tool(ctx, name, args)
            outs[name] = out
            ms = rng.randint(380, 620) if name == "search_knowledge" else rng.randint(2, 25)
            extra = {}
            if name == "search_knowledge":
                hits = [r["title"] for r in out.get("results", [])]
                ids = [c["id"] for c in ctx.cards[-1]["items"]] if ctx.cards and ctx.cards[-1]["kind"] == "sources" else []
                extra = {"method": out.get("method"), "hits": ids}
                self.rag.append({"query": args.get("query"), "method": out.get("method"), "hits": ids})
                self._span("rag", "search_knowledge", agent, ms - 5, query=args.get("query"), **extra)
                self.clock -= ms - 5
                _ = hits
            self._span("tool", name, agent, ms, args=str(args)[:300].replace("'", '"'), error=out.get("error") if isinstance(out, dict) else None)
            trace.append({"tool": name, "args": args, "summary": T.summarize_result(name, out), "ms": ms})
        self._llm(agent)
        agent_span["ms"] = self.clock - start
        cards = T_tidy(ctx.cards)
        if confirm is not None:
            for c in cards:
                if c.get("kind") == "confirm" and confirm:
                    pa = self.db.get(PendingAction, c["action_id"])
                    res = T.execute_action(self.db, self.user, pa)
                    pa.status, pa.result = "confirmed", res
                    c["status"], c["result"] = "confirmed", res
        meta = {"cards": copy.deepcopy(cards), "trace": trace, "route": self.reason}
        if synthesis:
            meta = {"synthesis": True, "cards": [], "trace": []}
        if followups:
            meta["followups"] = followups
        m = Message(conversation_id=self.conv.id, role="assistant", agent=agent, content=answer, meta=meta,
                    created_at=self._tick(rng.randint(3, 9)))
        self.db.add(m)
        self.db.flush()
        self.last_msg = m
        return outs

    def synthesis(self, answer: str, followups=None) -> None:
        self.spans.append({"kind": "agent", "name": "headbro", "stage": "synthesis", "start_ms": self.clock, "ms": 0})
        self._llm("synthesis")
        meta = {"synthesis": True, "cards": [], "trace": []}
        if followups:
            meta["followups"] = followups
        m = Message(conversation_id=self.conv.id, role="assistant", agent="headbro", content=answer, meta=meta, created_at=self._tick(4))
        self.db.add(m)
        self.db.flush()
        self.last_msg = m

    def blocked(self, kind: str, message: str) -> None:
        self.spans[-1].update(level="block", guard_kind=kind)
        m = Message(conversation_id=self.conv.id, role="assistant", agent="guard", content=message, meta={"guard": kind, "guard_method": "rule"},
                    created_at=self._tick(1))
        self.db.add(m)
        self.db.flush()
        self.last_msg = m
        self.save(status="blocked", guard=kind)

    def save(self, status: str = "ok", guard: str | None = None, flags: list[dict] | None = None) -> None:
        if status != "blocked":
            self._span("llm", "followups", "followups", rng.randint(500, 800), provider="primary", model="mercury-3",
                       tokens_in=rng.randint(600, 900), tokens_out=rng.randint(60, 110))
            self.tokens[0] += 700
            self.tokens[1] += 80
        llm = [s for s in self.spans if s["kind"] == "llm"]
        import uuid

        tr = AgentTrace(
            id=uuid.uuid4().hex, user_id=self.user.id, conversation_id=self.conv.id, message_id=self.last_msg.id, question=self.question,
            agents=self.agents if status != "blocked" else ["guard"], route_method=getattr(self, "method", "guard"), status=status,
            guard=guard, total_ms=self.clock, ttft_ms=None if status == "blocked" else next(
                (s["start_ms"] + s["ttft_ms"] for s in llm if s.get("ttft_ms")), None),
            llm_calls=len(llm), tool_calls=sum(1 for s in self.spans if s["kind"] == "tool"),
            tool_errors=sum(1 for s in self.spans if s["kind"] == "tool" and s.get("error")),
            tokens_in=self.tokens[0], tokens_out=self.tokens[1], providers=["primary:mercury-3"] if llm else [],
            spans=self.spans, output_flags=flags or [], rag=self.rag, created_at=self.when,
        )
        self.db.add(tr)
        self.last_msg.meta = {**self.last_msg.meta, "trace_id": tr.id}
        if flags:
            self.last_msg.meta = {**self.last_msg.meta, "safety_flags": [f["kind"] for f in flags]}
        self.conv.updated_at = self.t
        self.db.flush()


def T_tidy(cards: list[dict]) -> list[dict]:
    from app.agents.orchestrator import tidy_cards

    return tidy_cards(cards)


def seed_chats(db, user: User, prof: Profile, today: dt.date, start: dt.date) -> WorkoutPlan:
    knowledge.embed_query = lambda q: None  # dữ liệu mẫu: tìm bằng BM25, không gọi API, kết quả giống nhau trên mọi máy

    def at(day: int, h: int, m: int = 0) -> dt.datetime:
        return utc_at(start + dt.timedelta(days=day), h, m)

    # 1) Đặt mục tiêu (HeadBro, human-in-the-loop đã xác nhận)
    c = Chat(db, user, prof, at(1, 20, 5), "Đặt mục tiêu giảm mỡ giữ cơ")
    c.ask("Mình 21 tuổi, 72kg, mới tập lại. Muốn giảm mỡ mà vẫn giữ cơ, đặt giúp mình mục tiêu cụ thể nhé")
    c.route(["headbro"])
    c.agent("headbro", [
        ("get_body_metrics", {"limit": 3}),
        ("propose_goal", {"title": "Giảm còn 66kg", "metric": "weight_kg", "start_value": 72, "target_value": 66,
                          "deadline": (today + dt.timedelta(days=42)).isoformat(),
                          "plan": "- Thâm hụt khoảng 450 kcal/ngày\n- Tập tạ 3 buổi/tuần tháng đầu, sau đó 5 buổi\n- Ăn đủ khoảng 150g đạm mỗi ngày"}),
    ], "Với 72kg và khoảng 23% mỡ, tốc độ an toàn là giảm 0,5–0,7kg mỗi tuần. Mình đề xuất mục tiêu **về 66kg trong khoảng 4 tháng**:\n\n"
       "- Thâm hụt khoảng 450 kcal/ngày so với TDEE, không ăn dưới 1.500 kcal\n"
       "- Tháng đầu tập tạ 3 buổi/tuần để làm quen lại, sau đó lên 5 buổi\n"
       "- Đủ khoảng 150g đạm mỗi ngày để giữ cơ khi giảm mỡ\n\n"
       "Bạn bấm Xác nhận để lưu mục tiêu, mình sẽ theo dõi tiến độ trên Dashboard.", confirm=True,
       followups=["Lên lịch tập 3 buổi cho mình", "Mỗi ngày mình nên ăn bao nhiêu calo?", "Làm sao biết mình giảm mỡ hay giảm cơ?"])
    c.save()

    # 2) Đau vai → buổi ngực bảo vệ vai (CoachBro + RAG + tạo buổi tập)
    c = Chat(db, user, prof, at(19, 17, 40), "Vai trái hơi đau, có nên tập ngực?")
    c.ask("Hôm nay lịch tập ngực mà vai trái hơi đau khi đẩy, có nên tập không?")
    c.route(["coachbro"], notes=["medical_caution"])
    outs = c.agent("coachbro", [
        ("search_knowledge", {"query": "đau vai khi đẩy ngực"}),
        ("create_workout_plan", {"name": "Chest Workout (bảo vệ vai)", "focus": "chest",
                                 "description": "Buổi ngực nhẹ cho vai: tạ đơn góc nghiêng, khép khuỷu tay, tránh góc gây đau.",
                                 "items": [{"exercise_id": "0314", "sets": 3, "reps": 12, "rest_sec": 90, "note": "Khép khuỷu ~45°, dừng nếu đau"},
                                           {"exercise_id": "0308", "sets": 3, "reps": 12, "rest_sec": 60, "note": "Biên độ vừa phải"},
                                           {"exercise_id": "0662", "sets": 3, "reps": 12, "rest_sec": 60},
                                           {"exercise_id": "0380", "sets": 3, "reps": 15, "rest_sec": 60, "note": "Tăng sức cho vai sau"},
                                           {"exercise_id": "0276", "sets": 3, "reps": 10, "rest_sec": 45}]}),
    ], "Đau nhẹ khi đẩy thường do gân chóp xoay bị quá tải, chưa cần nghỉ hẳn nhưng nên đổi cách tập [1]:\n\n"
       "- Tạm bỏ đẩy ngực thanh đòn, thay bằng tạ đơn góc nghiêng và khép khuỷu tay khoảng 45°\n"
       "- Giữ cường độ ở mức đau không quá 3/10 và hết trong 24 giờ\n"
       "- Thêm bài vai sau để cân bằng khớp vai\n\n"
       "Mình đã tạo buổi **Chest Workout (bảo vệ vai)** khoảng 45 phút bên dưới. Nếu đau tăng, tê lan xuống tay hoặc đau cả ban đêm "
       "nhiều ngày, bạn nên đi khám bác sĩ hoặc chuyên viên vật lý trị liệu nhé.",
       followups=["Bài khởi động vai trước khi tập", "Khi nào mình đẩy ngực nặng lại được?", "Ghi nhớ mình từng đau vai trái"])
    c.save()
    shoulder_plan = db.get(WorkoutPlan, outs["create_workout_plan"]["saved_plan_id"])

    # 3) Ghi bữa ăn bằng chat (NutriBro, xác nhận)
    c = Chat(db, user, prof, at(33, 12, 35), "Trưa nay ăn cơm tấm")
    c.ask("Trưa nay mình ăn 1 đĩa cơm tấm sườn bì chả")
    c.route(["nutribro"])
    f = foodsvc.get_food("com_tam")
    c.agent("nutribro", [
        ("search_food_library", {"query": "cơm tấm", "limit": 3}),
        ("propose_meal_log", {"name": "Cơm tấm sườn bì chả", "meal_type": "lunch", "calories": f["calories"], "protein": f["protein"],
                              "carbs": f["carbs"], "fat": f["fat"], "date": (start + dt.timedelta(days=33)).isoformat(),
                              "analysis": "Nhiều đạm nhưng cũng nhiều béo từ sườn ướp và mỡ hành. Bữa tối nên nhẹ, nhiều rau."}),
    ], f"Một đĩa cơm tấm sườn bì chả khoảng **{round(f['calories'])} kcal**, {round(f['protein'])}g đạm (ước tính theo khẩu phần thường gặp).\n\n"
       "- Lần sau có thể bỏ bớt mỡ hành và chả trứng, xin thêm dưa leo\n"
       "- Bữa tối nên chọn món luộc/hấp và nhiều rau để cân lại lượng béo\n\n"
       "Bạn bấm Xác nhận để ghi bữa này vào nhật ký nhé.", confirm=True,
       followups=["Gợi ý bữa tối nhẹ cho mình", "Hôm nay mình còn thiếu bao nhiêu đạm?", "Cơm tấm ăn sao cho đỡ béo?"])
    c.save()

    # 4) Kiến thức có trích nguồn (RAG)
    c = Chat(db, user, prof, at(40, 21, 10), "Creatine có cần không?")
    c.ask("Creatine có cần thiết không, uống thế nào cho đúng?")
    c.route(["nutribro"])
    c.agent("nutribro", [("search_knowledge", {"query": "creatine liều dùng có an toàn không"})],
            "Creatine không bắt buộc, nhưng là thực phẩm bổ sung có nhiều bằng chứng nhất cho sức mạnh và khối lượng tập [1]:\n\n"
            "- Cách đơn giản: **3–5g mỗi ngày**, uống lúc nào cũng được, đều đặn hằng ngày; sau 3–4 tuần cơ bão hoà [1]\n"
            "- Có thể nạp nhanh khoảng 20g/ngày chia 4 lần trong 5–7 ngày, nhưng không cần thiết\n"
            "- Tăng 1–2kg lúc đầu chủ yếu là nước trong cơ, không phải mỡ\n"
            "- An toàn với người khoẻ mạnh; nếu có bệnh thận hãy hỏi bác sĩ trước [1]\n\n"
            "Với ngân sách khoảng 100k/ngày của bạn, nên ưu tiên ăn đủ đạm trước, creatine là phần cộng thêm.",
            followups=["Nên chọn loại creatine nào?", "Có cần uống whey không?", "Uống cà phê trước tập có tốt không?"])
    c.save()

    # 5) Guardrail đầu vào: yêu cầu ăn kiêng cực đoan (vẫn trả lời, theo ngưỡng an toàn)
    c = Chat(db, user, prof, at(41, 22, 0), "Ăn 800 kcal để kịp đám cưới?")
    c.ask("Tuần sau đi đám cưới, mình ăn 800 kcal mỗi ngày để xuống nhanh được không?")
    c.route(["nutribro"], notes=["extreme_diet"])
    c.agent("nutribro", [("get_nutrition_day", {})],
            "Mình không khuyên ăn 800 kcal/ngày — với nam giới mức đó dưới ngưỡng an toàn 1.500 kcal, dễ mất cơ, mệt và ăn bù sau đó.\n\n"
            "Một tuần trước đám cưới, cách an toàn mà vẫn thấy khác biệt:\n"
            "- Giữ thâm hụt 300–500 kcal như hiện tại, ưu tiên đạm và rau\n"
            "- Giảm muối, đồ ngọt và trà sữa để bớt giữ nước, bụng trông gọn hơn\n"
            "- Ngủ đủ 7 tiếng và uống đủ khoảng 2,5 lít nước\n\n"
            "Hôm ăn cỗ cứ ăn thoải mái vừa phải, hôm sau quay lại thực đơn bình thường là được, không cần nhịn bù.",
            followups=["Thực đơn 1 tuần trước đám cưới", "Ăn cỗ sao cho đỡ béo?", "Cân tăng sau bữa cỗ có sao không?"])
    c.save()

    # 6) Safety Guard chặn (chất cấm)
    c = Chat(db, user, prof, at(44, 21, 30), "Hỏi về testosterone")
    c.ask("Bạn gym rủ mình chạy chu kỳ testosterone, người mới thì liều bao nhiêu?")
    from app.agents.guard import DRUG_MSG
    c.blocked("drugs", DRUG_MSG)

    # 7) Tăng cơ tay mà vẫn giảm mỡ — 2 agent + tổng kết
    c = Chat(db, user, prof, at(66, 20, 15), "Tăng cơ tay mà vẫn giảm mỡ")
    c.ask("Muốn tay to hơn mà vẫn đang giảm mỡ thì nên tập và ăn thế nào?")
    c.route(["coachbro", "nutribro"], method="llm", reason="Câu hỏi cần cả tập luyện và dinh dưỡng")
    c.agent("coachbro", [("search_exercises", {"focus": "arms", "limit": 4})],
            "Khi đang giảm mỡ, tay vẫn lên được nếu đủ khối lượng tập:\n\n"
            "- Giữ buổi Arm Workout hằng tuần và thêm 3–4 hiệp tay vào buổi lưng/ngực, tổng khoảng 10–12 hiệp mỗi nhóm/tuần\n"
            "- Dải 8–15 rep, còn 1–2 rep là thất bại (RPE 8–9)\n"
            "- Mỗi tuần cố tăng 1 rep hoặc 1–2kg ở bài chính\n\n"
            "Mình lọc sẵn 4 bài tay phù hợp với dụng cụ ở gym bên dưới.")
    c.agent("nutribro", [("search_knowledge", {"query": "cần bao nhiêu đạm khi giảm mỡ giữ cơ"})],
            "Về ăn uống, để giữ và tăng cơ trong lúc thâm hụt calo:\n\n"
            "- Đạm khoảng 2,0–2,2g/kg, tức khoảng 140–150g/ngày, chia đều 4 bữa 30–40g [1]\n"
            "- Giữ thâm hụt vừa phải 300–450 kcal, đừng cắt sâu hơn\n"
            "- Bữa sau tập nên có cơm hoặc khoai để phục hồi tốt hơn")
    c.synthesis("Tóm lại: tuần này giữ buổi tay và thêm vài hiệp tay vào buổi lưng, cố tăng 1 rep mỗi tuần; "
                "song song ăn đủ khoảng 145g đạm chia 4 bữa. Sau 4 tuần đo lại vòng tay để xem tiến bộ.",
                followups=["Tạo buổi Arm Workout mới cho mình", "Thực đơn 145g đạm trong 1 ngày", "Đo vòng tay thế nào cho chuẩn?"])
    c.save()

    return shoulder_plan


def seed_chats_late(db, user: User, prof: Profile, today: dt.date) -> None:
    """Hội thoại gần đây — chạy SAU khi đã có dữ liệu tập/ăn để công cụ đọc ra số liệu thật."""
    # 8) Tổng kết tuần (HeadBro) — hôm qua
    c = Chat(db, user, prof, utc_at(today - dt.timedelta(days=1), 21, 0), "Tuần này mình thế nào?")
    c.ask("Tuần này mình tiến bộ thế nào?")
    c.route(["headbro"])
    outs = c.agent("headbro", [("get_progress_report", {"period": "week"}), ("get_insights", {})], "")
    sm = outs["get_progress_report"].get("summary", {})
    ins = outs["get_insights"].get("insights")
    tip = ins[0]["title"] if isinstance(ins, list) and ins else "giữ nhịp như hiện tại"
    wc = sm.get("weight_change")
    c.last_msg.content = (
        f"Tuần này bạn tập **{sm.get('sessions', 0)} buổi**, tổng {sm.get('total_minutes', 0)} phút"
        + (f", điểm sẵn sàng trung bình {sm['avg_readiness']}" if sm.get("avg_readiness") else "") + ".\n\n"
        + (f"- Cân nặng thay đổi {wc:+.1f}kg so với đầu tuần\n".replace(".", ",") if wc is not None else "")
        + (f"- Trung bình ăn khoảng {format(sm['avg_calories'], ',').replace(',', '.')} kcal và {sm['avg_protein']}g đạm mỗi ngày, "
           "đạm còn thấp so với mục tiêu khoảng 150g\n" if sm.get("avg_calories") else "")
        + f"- Cần chú ý: {tip[:1].lower() + tip[1:]}\n\n"
        "Bạn đang đi đúng hướng với mục tiêu 66kg, cứ giữ đều lịch tập và ăn đủ đạm nhé.")
    c.last_msg.meta = {**c.last_msg.meta, "followups": ["Tuần tới nên tập gì?", "Mình còn bao lâu đạt 66kg?", "Xem chi tiết chỉ số InBody"]}
    c.save()

    # 9) Thực đơn bữa tối (NutriBro) — hôm qua
    c = Chat(db, user, prof, utc_at(today - dt.timedelta(days=1), 17, 20), "Lên thực đơn bữa tối")
    c.ask("Lên thực đơn bữa tối giúp mình, hôm nay hơi thiếu đạm")
    c.route(["nutribro"])
    c.agent("nutribro", [
        ("get_nutrition_day", {}),
        ("create_meal_plan", {"title": "Bữa tối giàu đạm", "meals": [
            {"meal_type": "dinner", "food_id": "uc_ga", "servings": 1.5},
            {"meal_type": "dinner", "food_id": "com_gao_lut", "servings": 0.75},
            {"meal_type": "dinner", "food_id": "bong_cai"},
            {"meal_type": "snack", "food_id": "greek_yogurt"}]}),
    ], "Mình gợi ý bữa tối nhiều đạm, ít dầu mỡ, không có hải sản vì bạn dị ứng tôm cua:\n\n"
       "- 150g ức gà áp chảo, ¾ bát cơm gạo lứt, bông cải luộc\n"
       "- Buổi tối thêm 1 hộp sữa chua Hy Lạp nếu còn đói\n\n"
       "Tổng bữa này khoảng 45–50g đạm, đủ bù phần còn thiếu trong ngày. Bấm \"Ghi vào nhật ký\" trên thẻ khi bạn ăn xong nhé.",
       followups=["Đổi ức gà sang món khác", "Bữa sáng mai ăn gì?", "Ghi nhớ mình không thích khoai lang"])
    c.save()

    # 10) Hôm nay: báo cân nặng → thẻ CHỜ xác nhận (để người xem demo tự bấm)
    c = Chat(db, user, prof, utc_at(today, 7, 5), "Cân nặng sáng nay")
    c.ask(f"Sáng nay mình cân được {round(weight_on(DAYS), 1)}kg".replace(".", ","))
    c.route(["headbro"])
    c.agent("headbro", [("propose_body_metric", {"weight_kg": round(weight_on(DAYS), 1)})],
            f"Tốt lắm! So với lúc bắt đầu 72kg, bạn đã giảm khoảng **{str(round(72 - round(weight_on(DAYS), 1), 1)).replace('.', ',')}kg** sau 12 tuần, "
            "đúng tốc độ an toàn khoảng 0,4–0,5kg mỗi tuần.\n\n"
            "Bạn bấm Xác nhận để lưu cân nặng hôm nay, biểu đồ và mục tiêu sẽ tự cập nhật.",
            followups=["Mình còn bao lâu đạt 66kg?", "Hôm nay nên tập gì?", "Xem báo cáo tháng này"])
    c.save()


# ---------------------------------------------------------------------------


def is_stale(db) -> bool:
    """Demo cần tạo lại khi chưa có, hoặc chưa có check-in hôm nay (dữ liệu đã cũ đi 1 ngày trở lên)."""
    uid = db.scalars(select(User.id).where(User.email == EMAIL)).first()
    if not uid:
        return True
    return not db.scalars(select(DailyLog.id).where(DailyLog.user_id == uid, DailyLog.date == stats.today(),
                                                    DailyLog.readiness.is_not(None))).first()


def ensure_fresh() -> bool:
    """Tạo lại demo nếu đã cũ → demo luôn "kết thúc ở hôm nay" dù mở app vào ngày nào. Trả về True nếu đã tạo lại."""
    init_db()
    db = SessionLocal()
    try:
        stale = is_stale(db)
    finally:
        db.close()
    if stale:
        main()
    return stale


def main() -> None:
    init_db()
    rng.seed(2026)  # chạy lại trong cùng tiến trình vẫn ra đúng bộ dữ liệu
    db = SessionLocal()
    old = db.scalars(select(User).where(User.email == EMAIL)).first()
    old_id = old.id if old else None
    if old:
        db.delete(old)
        db.commit()

    today = stats.today()
    start = today - dt.timedelta(days=DAYS)

    # Giữ nguyên id cũ → ai đang đăng nhập demo không bị đăng xuất khi demo được làm mới mỗi ngày
    user = User(email=EMAIL, name=NAME, password_hash=hash_password(PASSWORD), created_at=utc_at(start, 20))
    if old_id:
        user.id = old_id
    db.add(user)
    db.flush()
    prof = Profile(
        user_id=user.id, onboarded=True, age=21, gender="male", height_cm=172, weight_kg=72.0, goal="fat_loss",
        level="intermediate", activity_level="moderate", training_days=5, equipment="gym",
        injuries="Từng đau vai trái khi đẩy ngực nặng", settings={},
    )
    stats.recompute_targets(prof)
    db.add(prof)
    db.add(WeeklySchedule(user_id=user.id, days={str(k): {"plan_id": v, "note": ""} for k, v in SCHEDULE_B.items()},
                          note="Ngực – Chân – nghỉ – Lưng – Tay – HIIT – Chủ nhật bụng/giãn cơ tuỳ sức", source="ai"))
    for content, cat, src in [
        ("Dị ứng hải sản (tôm, cua)", "health", "nutribro"), ("Thường tập lúc 18h sau giờ làm", "schedule", "coachbro"),
        ("Từng đau vai trái khi đẩy ngực nặng", "health", "coachbro"), ("Ngân sách ăn uống khoảng 100k/ngày", "food", "nutribro"),
        ("Không thích ăn khoai lang", "food", "nutribro"), ("Có 1 cặp tạ đơn 10kg ở nhà", "preference", "coachbro"),
        ("Làm văn phòng, ngồi nhiều", "schedule", "headbro"),
    ]:
        db.add(Memory(user_id=user.id, content=content, category=cat, source=src, created_at=utc_at(start + dt.timedelta(days=rng.randint(1, 30)), 20)))

    last_weight = seed_body(db, user, today, start)
    prof.weight_kg = last_weight
    stats.recompute_targets(prof)

    # Hội thoại tạo ra mục tiêu, buổi tập "bảo vệ vai", bữa ăn đã xác nhận...
    reserved = {(start + dt.timedelta(days=33), "lunch")}
    shoulder_plan = seed_chats(db, user, prof, today, start)
    db.add(Goal(user_id=user.id, title="Đạt 19% mỡ", metric="body_fat_pct", start_value=23.0, target_value=19, deadline=today + dt.timedelta(days=45),
                plan="- Giữ thâm hụt vừa phải\n- Tập tạ 5 buổi/tuần\n- Ngủ đủ 7 tiếng", source="manual", created_at=utc_at(start + dt.timedelta(days=2), 21)))
    db.add(Goal(user_id=user.id, title="Tập 5 buổi mỗi tuần", metric="workouts_per_week", target_value=5, source="manual",
                created_at=utc_at(start + dt.timedelta(days=28), 21)))
    db.add(Goal(user_id=user.id, title="Đẩy ngực 50kg x 8", metric="custom", target_value=50, status="achieved", source="ai",
                plan="- Tăng 2,5kg khi làm đủ 8 rep ở mọi hiệp", created_at=utc_at(start + dt.timedelta(days=5), 21)))
    db.add(Goal(user_id=user.id, title="Chạy 5km dưới 30 phút", metric="custom", target_value=30, status="archived", source="manual",
                created_at=utc_at(start + dt.timedelta(days=3), 21)))

    seed_days(db, user, today, start, reserved)
    db.flush()
    # Từ khi có buổi "bảo vệ vai" (ngày 19), các buổi ngực dùng buổi tập này
    if shoulder_plan:
        for sess in db.scalars(select(WorkoutSession).where(WorkoutSession.user_id == user.id, WorkoutSession.plan_id == "tpl_chest",
                                                            WorkoutSession.started_at >= utc_at(start + dt.timedelta(days=20), 0))):
            d = stats.local_date(sess.started_at)
            i = (d - start).days
            db.delete(sess)
            db.flush()
            add_session(db, user, d, "custom", i / 7, deload=i in DELOAD, plan=shoulder_plan)
        ws = db.get(WeeklySchedule, user.id)
        ws.days = {**ws.days, "0": {"plan_id": shoulder_plan.id, "note": "Bảo vệ vai trái"}}
    db.flush()
    seed_chats_late(db, user, prof, today)
    db.commit()
    n = {m.__name__: len(list(db.scalars(select(m.id).where(m.user_id == user.id))))
         for m in (WorkoutSession, WorkoutSet, Meal, DailyLog, BodyMetric, Goal, Memory, Conversation, AgentTrace)}
    db.close()
    print(f"Đã tạo tài khoản demo: {EMAIL} / {PASSWORD}")
    print("Dữ liệu:", n)


if __name__ == "__main__":
    main()
