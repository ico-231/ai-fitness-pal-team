import { Link } from "react-router-dom";
import { fmt } from "../lib/format";
import { useState } from "react";
import { Bell, Bot, Camera, Database, Download, LogOut, Palette, Trash2, User, Volume2 } from "lucide-react";
import { apiUrl, del, post, put, tokenStore } from "../lib/api";
import { applyTheme, useAuth } from "../lib/auth";
import { ACTIVITY, EQUIPMENT, GOALS, LEVELS } from "../lib/constants";
import { voice } from "../lib/media";
import type { Profile, Settings as S } from "../lib/types";
import { Button, Card, CardHeader, Field, Modal, PageHeader, Segmented, Toggle, toast, confirmDialog } from "../components/ui";
import { MemoryCard } from "../components/MemoryCard";

export default function Settings() {
  const { user, refresh, signOut, config } = useAuth();
  const p = user!.profile!;
  const [f, setF] = useState({
    name: user!.name, age: p.age ?? 20, gender: p.gender ?? "male", height_cm: p.height_cm ?? 170, weight_kg: p.weight_kg ?? 65,
    goal: p.goal, level: p.level, activity_level: p.activity_level, training_days: p.training_days, equipment: p.equipment, injuries: p.injuries,
    targets_manual: p.targets_manual, target_calories: p.targets.calories, target_protein: p.targets.protein, target_carbs: p.targets.carbs,
    target_fat: p.targets.fat, target_water_ml: p.targets.water_ml,
  });
  const [busy, setBusy] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const s = p.settings;

  const saveProfile = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...f };
      if (!f.targets_manual) ["target_calories", "target_protein", "target_carbs", "target_fat", "target_water_ml"].forEach((k) => delete body[k]);
      await put<Profile>("/api/profile", body);
      await refresh();
      toast("Đã lưu hồ sơ — mục tiêu dinh dưỡng đã cập nhật");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const setSetting = async (patch: Partial<S>) => {
    try {
      await put("/api/profile/settings", patch);
      await refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const exportData = async () => {
    const r = await fetch(apiUrl("/api/data/export"), { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fitbro-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const testCamera = async () => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: true });
      st.getTracks().forEach((t) => t.stop());
      toast("Camera hoạt động bình thường");
    } catch {
      toast("Chưa có quyền camera — bật trong cài đặt trình duyệt (biểu tượng ổ khoá trên thanh địa chỉ)", "error");
    }
  };

  const n = (k: keyof typeof f) => <input className="input" type="number" value={f[k] as number} onChange={(e) => setF({ ...f, [k]: +e.target.value })} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Cài đặt" subtitle="Cá nhân hoá FitBro theo bạn" />
      <Card>
        <CardHeader title="Hồ sơ cá nhân" subtitle="Các agent dùng thông tin này để cá nhân hoá lời khuyên" icon={<User size={16} />} />
        <div className="space-y-4 px-5 pb-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Tên"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Tuổi">{n("age")}</Field>
            <Field label="Giới tính"><select className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value as typeof f.gender })}><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option></select></Field>
            <Field label="Số buổi tập/tuần">{n("training_days")}</Field>
            <Field label="Chiều cao (cm)">{n("height_cm")}</Field>
            <Field label="Cân nặng (kg)">{n("weight_kg")}</Field>
            <Field label="Mục tiêu"><select className="input" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value as typeof f.goal })}>{Object.entries(GOALS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Trình độ"><select className="input" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value as typeof f.level })}>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Mức vận động"><select className="input" value={f.activity_level} onChange={(e) => setF({ ...f, activity_level: e.target.value as typeof f.activity_level })}>{Object.entries(ACTIVITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Dụng cụ"><select className="input" value={f.equipment} onChange={(e) => setF({ ...f, equipment: e.target.value as typeof f.equipment })}>{Object.entries(EQUIPMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
          <Field label="Chấn thương / lưu ý sức khỏe"><textarea className="input" rows={2} value={f.injuries} onChange={(e) => setF({ ...f, injuries: e.target.value })} /></Field>
          <div className="rounded-xl bg-surface-2 p-4">
            <Toggle checked={f.targets_manual} onChange={(v) => setF({ ...f, targets_manual: v })} label="Tự đặt mục tiêu dinh dưỡng (tắt = tính tự động theo công thức Mifflin-St Jeor)" />
            {p.calculated && <p className="mt-2 text-xs text-muted">Tự động: TDEE {fmt(p.calculated.tdee, 1)} kcal → {fmt(p.calculated.calories, 1)} kcal · {fmt(p.calculated.protein, 1)}g đạm · {fmt(p.calculated.carbs, 1)}g carb · {fmt(p.calculated.fat, 1)}g béo · {fmt(p.calculated.water_ml, 1)}ml nước</p>}
            {f.targets_manual && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Field label="Calo">{n("target_calories")}</Field><Field label="Đạm (g)">{n("target_protein")}</Field><Field label="Carb (g)">{n("target_carbs")}</Field>
                <Field label="Béo (g)">{n("target_fat")}</Field><Field label="Nước (ml)">{n("target_water_ml")}</Field>
              </div>
            )}
          </div>
          <Button loading={busy} onClick={saveProfile}>Lưu hồ sơ</Button>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader title="Giọng nói PT & buổi tập" icon={<Volume2 size={16} />} />
          <div className="space-y-4 px-5 pb-5">
            <Toggle checked={s.voice_coach} onChange={(v) => { voice.enabled = v; setSetting({ voice_coach: v }); }} label="Bật giọng PT (đếm giờ, nhắc form, báo nghỉ)" />
            <Field label={`Tốc độ đọc: ${s.voice_rate}x`}>
              <input type="range" min={0.7} max={1.5} step={0.1} value={s.voice_rate} className="w-full accent-[var(--primary)]" onChange={(e) => { voice.rate = +e.target.value; setSetting({ voice_rate: +e.target.value }); }} />
            </Field>
            <Toggle checked={s.auto_camera ?? true} onChange={(v) => setSetting({ auto_camera: v })} label="Tự bật Camera AI với bài hỗ trợ (đếm rep, chấm form)" />
            <Field label="Thời gian chuẩn bị trước mỗi bài">
              <Segmented value={String(s.prep_seconds)} onChange={(v) => setSetting({ prep_seconds: +v })} options={["5", "10", "15", "20"].map((x) => ({ value: x, label: `${x}s` }))} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => voice.speak("Xin chào, mình là huấn luyện viên FitBro. Chuẩn bị, ba, hai, một, bắt đầu!", { force: true })}>Nghe thử giọng</Button>
              <Button size="sm" variant="outline" icon={<Camera size={14} />} onClick={testCamera}>Kiểm tra camera</Button>
            </div>
            {!voice.hasVietnamese() && <p className="text-xs text-warn-strong">Trình duyệt chưa có giọng tiếng Việt — giọng đọc có thể không chuẩn. Chrome/Edge trên Windows/Android thường có sẵn.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Giao diện & nhắc nhở" icon={<Palette size={16} />} />
          <div className="space-y-4 px-5 pb-5">
            <Field label="Chủ đề">
              <Segmented value={s.theme} onChange={(v) => { applyTheme(v); setSetting({ theme: v }); }} options={[{ value: "system", label: "Theo máy" }, { value: "light", label: "Sáng" }, { value: "dark", label: "Tối" }]} />
            </Field>
            <Toggle
              checked={s.reminders.enabled}
              onChange={async (v) => {
                if (v && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
                setSetting({ reminders: { ...s.reminders, enabled: v } });
              }}
              label={<span className="flex items-center gap-1.5"><Bell size={14} /> Bật nhắc nhở (khi đang mở FitBro)</span>}
            />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Check-in"><input className="input" type="time" value={s.reminders.checkin} onChange={(e) => setSetting({ reminders: { ...s.reminders, checkin: e.target.value } })} /></Field>
              <Field label="Giờ tập"><input className="input" type="time" value={s.reminders.workout} onChange={(e) => setSetting({ reminders: { ...s.reminders, workout: e.target.value } })} /></Field>
              <Field label="Uống nước">
                <select className="input" value={s.reminders.water_every_min} onChange={(e) => setSetting({ reminders: { ...s.reminders, water_every_min: +e.target.value } })}>
                  <option value={0}>Tắt</option><option value={60}>Mỗi 1h</option><option value={90}>Mỗi 1.5h</option><option value={120}>Mỗi 2h</option>
                </select>
              </Field>
            </div>
          </div>
        </Card>
      </div>

      <MemoryCard />

      <Card>
        <CardHeader title="Trạng thái AI" icon={<Bot size={16} />} right={<Link to="/ai-log" className="text-sm font-medium text-primary hover:underline">Nhật ký AI →</Link>} />
        <p className="px-5 pb-5 text-sm text-muted">
          {config?.ai_enabled ? <>Đang dùng mô hình <b className="text-text">{config.model}</b>. Bạn trò chuyện với HeadBro; phía sau, Router chuyển việc cho 2 agent chuyên môn (tập luyện, dinh dưỡng) cùng Safety Guard. Xem từng bước ở Nhật ký AI.</> : "AI chưa được cấu hình trên server (thiếu LLM_API_KEY). Các tính năng không cần AI vẫn hoạt động bình thường."}
        </p>
      </Card>

      <Card>
        <CardHeader title="Dữ liệu & tài khoản" icon={<Database size={16} />} />
        <div className="flex flex-wrap gap-2 px-5 pb-5">
          <Button variant="outline" icon={<Download size={16} />} onClick={exportData}>Xuất toàn bộ dữ liệu (JSON)</Button>
          <Button variant="outline" icon={<LogOut size={16} />} onClick={signOut}>Đăng xuất</Button>
          <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => setWipe(true)}>Xoá sạch dữ liệu</Button>
          <Button variant="ghost" className="text-danger" onClick={async () => { if (await confirmDialog({ title: "Xoá vĩnh viễn tài khoản?", text: "Toàn bộ dữ liệu tập luyện, bữa ăn, số đo và hội thoại sẽ bị xoá. Không thể hoàn tác.", confirmLabel: "Xoá tài khoản", danger: true })) { await del("/api/me"); signOut(); } }}>Xoá tài khoản</Button>
        </div>
      </Card>

      <Modal open={wipe} onClose={() => setWipe(false)} title="Xoá sạch dữ liệu" footer={
        <Button variant="danger" disabled={confirmText.trim().toUpperCase() !== "XOA"} onClick={async () => {
          try { await post("/api/data/wipe", { confirm: confirmText }); toast("Đã xoá sạch dữ liệu"); setWipe(false); setConfirmText(""); await refresh(); }
          catch (e) { toast((e as Error).message, "error"); }
        }}>Xoá vĩnh viễn</Button>
      }>
        <p className="text-sm text-muted">Xoá toàn bộ check-in, buổi tập, bữa ăn, chỉ số cơ thể, mục tiêu và lịch sử chat. Tài khoản và hồ sơ được giữ lại. Không thể hoàn tác — hãy xuất dữ liệu trước nếu cần.</p>
        <Field label='Gõ "XOA" để xác nhận' className="mt-3"><input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
