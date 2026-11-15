"""Thư viện bài tập, chương trình tập, buổi tập trực tiếp (ghi từng set), PR, gợi ý theo nhóm cơ."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..agents import analyzers
from ..db import get_db
from ..models import User, WorkoutPlan, WorkoutSession, WorkoutSet, _now
from ..security import get_current_user
from ..services import exercises as exsvc
from ..services import formulas, stats
from ..services import templates as tplsvc

router = APIRouter(prefix="/api", tags=["workouts"])


# ---------------------------------------------------------------- exercises
@router.get("/exercises/meta")
def exercises_meta():
    return {
        "muscles": exsvc.MUSCLES,
        "focus": {k: v["label"] for k, v in exsvc.FOCUS.items()},
        "body_parts": exsvc.BODY_PARTS,
        "equipment": {k: v for k, v in exsvc.EQUIPMENT.items() if any(e["equipment"] == k for e in exsvc.all_exercises())},
        "total": len(exsvc.all_exercises()),
    }


@router.get("/exercises")
def list_exercises(
    q: str = "", focus: str | None = None, muscle: str | None = None, body_part: str | None = None,
    equipment: str | None = None, kind: str | None = None, camera: bool = False, mine: bool = False,
    limit: int = 30, offset: int = 0, user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    prof_eq = stats.get_profile(db, user).equipment if mine else None
    items, total = exsvc.search_exercises(q=q, focus=focus or None, muscle=muscle or None, body_part=body_part or None,
                                          equipment=equipment or None, kind=kind or None, camera_only=camera,
                                          profile_equipment=prof_eq, limit=max(1, min(limit, 60)), offset=max(0, offset))
    return {"total": total, "items": [exsvc.public(e, full=False) for e in items]}


@router.get("/exercises/{ex_id}")
def exercise_detail(ex_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    e = exsvc.get_exercise(ex_id)
    if not e:
        raise HTTPException(404, "Không tìm thấy bài tập")
    last = stats.last_performance(db, user.id, ex_id)
    pr = next((p for p in stats.personal_records(db, user.id) if p["exercise_id"] == ex_id), None)
    return {**exsvc.public(e), "last": last, "pr": pr,
            "overload": formulas.overload_suggestion(last, 10, e["compound"])}


# ---------------------------------------------------------------- plans
class PlanItem(BaseModel):
    exercise_id: str
    sets: int = Field(3, ge=1, le=10)
    reps: int = Field(10, ge=0, le=100)
    rest_sec: int = Field(90, ge=0, le=600)
    duration_sec: int = Field(0, ge=0, le=3600)
    note: str = ""


class PlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    focus: str = "full"
    description: str = ""
    items: list[PlanItem]


def plan_out(p: WorkoutPlan) -> dict:
    return {"id": p.id, "name": p.name, "focus": p.focus, "description": p.description, "est_minutes": p.est_minutes,
            "items": tplsvc.hydrate_items(p.items), "source": p.source, "created_at": p.created_at.isoformat(), "optional": False}


@router.get("/workouts/templates")
def templates():
    return tplsvc.list_templates()


@router.get("/workouts/plans")
def my_plans(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(WorkoutPlan).where(WorkoutPlan.user_id == user.id).order_by(WorkoutPlan.created_at.desc()))
    return [plan_out(p) for p in rows]


@router.get("/workouts/plans/{plan_id}")
def get_plan(plan_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = tplsvc.get_template(plan_id)
    if t:
        return t
    p = db.get(WorkoutPlan, plan_id)
    if not p or p.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy chương trình")
    return plan_out(p)


@router.post("/workouts/plans")
def create_plan(body: PlanIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = [i.model_dump() for i in body.items if exsvc.get_exercise(i.exercise_id)]
    if not items:
        raise HTTPException(400, "Chương trình cần ít nhất 1 bài tập hợp lệ")
    p = WorkoutPlan(user_id=user.id, name=body.name, focus=body.focus, description=body.description, items=items,
                    est_minutes=tplsvc.estimate_minutes(items), source="custom")
    db.add(p)
    db.commit()
    return plan_out(p)


@router.delete("/workouts/plans/{plan_id}")
def delete_plan(plan_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.get(WorkoutPlan, plan_id)
    if not p or p.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy")
    db.delete(p)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- sessions
class SessionIn(BaseModel):
    plan_id: str | None = None
    name: str = Field("Buổi tập tự do", max_length=120)


class SetIn(BaseModel):
    exercise_id: str
    set_index: int = Field(1, ge=1, le=50)
    weight_kg: float = Field(0, ge=0, le=1000)
    reps: int = Field(0, ge=0, le=500)
    duration_sec: int = Field(0, ge=0, le=7200)
    form_score: float | None = Field(None, ge=0, le=100)
    rpe: float | None = Field(None, ge=1, le=10)


class FinishIn(BaseModel):
    notes: str = ""


def set_out(s: WorkoutSet) -> dict:
    return {"id": s.id, "exercise_id": s.exercise_id, "exercise_name": s.exercise_name, "set_index": s.set_index,
            "weight_kg": s.weight_kg, "reps": s.reps, "duration_sec": s.duration_sec, "form_score": s.form_score,
            "rpe": s.rpe, "created_at": s.created_at.isoformat()}


def session_out(s: WorkoutSession) -> dict:
    return {"id": s.id, "plan_id": s.plan_id, "name": s.name, "status": s.status, "started_at": s.started_at.isoformat() + "Z",
            "ended_at": s.ended_at.isoformat() + "Z" if s.ended_at else None, "duration_sec": s.duration_sec,
            "total_volume": round(s.total_volume), "avg_form_score": s.avg_form_score, "notes": s.notes,
            "date": stats.local_date(s.started_at).isoformat(), "sets": [set_out(x) for x in s.sets]}


def _own_session(db: Session, user: User, sid: str) -> WorkoutSession:
    s = db.get(WorkoutSession, sid)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy buổi tập")
    return s


@router.get("/workouts/active")
def active_session(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.scalars(select(WorkoutSession).where(WorkoutSession.user_id == user.id, WorkoutSession.status == "active")
                   .order_by(WorkoutSession.started_at.desc())).first()
    return session_out(s) if s else None


@router.post("/workouts/sessions")
def start_session(body: SessionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # chỉ giữ 1 buổi đang tập — buổi cũ chưa xong mà không có set nào thì xoá
    for old in db.scalars(select(WorkoutSession).where(WorkoutSession.user_id == user.id, WorkoutSession.status == "active")):
        if not old.sets:
            db.delete(old)
        else:
            _finalize(old)
    s = WorkoutSession(user_id=user.id, plan_id=body.plan_id, name=body.name, status="active")
    db.add(s)
    db.commit()
    return session_out(s)


@router.post("/workouts/sessions/{sid}/sets")
def log_set(sid: str, body: SetIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _own_session(db, user, sid)
    e = exsvc.get_exercise(body.exercise_id)
    if not e:
        raise HTTPException(400, "Bài tập không hợp lệ")
    st = WorkoutSet(session_id=s.id, user_id=user.id, exercise_id=e["id"], exercise_name=e["name"], set_index=body.set_index,
                    weight_kg=body.weight_kg, reps=body.reps, duration_sec=body.duration_sec, form_score=body.form_score,
                    rpe=body.rpe, muscles={"primary": e["primary"], "secondary": e["secondary"]})
    db.add(st)
    db.commit()
    # Báo PR ngay khi vượt kỷ lục cũ (kỷ lục tính từ các buổi đã hoàn thành)
    e1 = formulas.one_rep_max(body.weight_kg, body.reps)
    best_prev = next((x["e1rm"] for x in stats.personal_records(db, user.id) if x["exercise_id"] == e["id"]), None)
    return {**set_out(st), "e1rm": e1, "is_pr": bool(e1 and best_prev is not None and e1 > best_prev), "previous_best": best_prev}


@router.delete("/workouts/sessions/{sid}/sets/{set_id}")
def delete_set(sid: str, set_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _own_session(db, user, sid)
    st = db.get(WorkoutSet, set_id)
    if st and st.session_id == sid:
        db.delete(st)
        db.commit()
    return {"ok": True}


def _finalize(s: WorkoutSession) -> None:
    s.status = "completed"
    s.ended_at = _now()
    s.duration_sec = max(0, int((s.ended_at - s.started_at).total_seconds()))
    s.total_volume = round(sum(x.weight_kg * x.reps for x in s.sets), 1)
    forms = [x.form_score for x in s.sets if x.form_score is not None]
    s.avg_form_score = round(sum(forms) / len(forms)) if forms else None


@router.post("/workouts/sessions/{sid}/finish")
def finish_session(sid: str, body: FinishIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _own_session(db, user, sid)
    if not s.sets:
        db.delete(s)
        db.commit()
        return {"discarded": True, "message": "Buổi tập chưa có set nào nên không được lưu."}
    s.notes = body.notes
    _finalize(s)
    db.commit()
    d = stats.local_date(s.started_at)
    prs = [p for p in stats.pr_events(db, user.id, d, d) if any(x.exercise_id == p["exercise_id"] for x in s.sets)]
    muscles: dict[str, float] = {}
    for x in s.sets:
        for m in (x.muscles or {}).get("primary", []):
            muscles[m] = muscles.get(m, 0) + 1
        for m in (x.muscles or {}).get("secondary", []):
            muscles[m] = muscles.get(m, 0) + 0.5
    return {**session_out(s), "prs": prs, "muscles": {k: {"label": exsvc.MUSCLES.get(k, k), "sets": v} for k, v in muscles.items()}}


@router.delete("/workouts/sessions/{sid}")
def delete_session(sid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _own_session(db, user, sid)
    db.delete(s)
    db.commit()
    return {"ok": True}


@router.get("/workouts/sessions")
def history(days: int = 30, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    end = stats.today()
    start = end - stats.dt.timedelta(days=max(1, min(days, 400)) - 1)
    return [session_out(s) for s in reversed(stats.completed_sessions(db, user.id, start, end))]


@router.get("/workouts/sessions/{sid}")
def get_session(sid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return session_out(_own_session(db, user, sid))


@router.get("/workouts/prs")
def prs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return stats.personal_records(db, user.id)


class SuggestIn(BaseModel):
    muscle: str


@router.post("/workouts/suggest")
async def suggest(body: SuggestIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.muscle not in exsvc.MUSCLES:
        raise HTTPException(400, "Nhóm cơ không hợp lệ")
    return await analyzers.suggest_for_muscle(db, user, body.muscle)
