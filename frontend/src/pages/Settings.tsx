import { Link } from "react-router-dom";
import { fmt } from "../lib/format";
import { useEffect, useState } from "react";
import { Bell, Bot, Camera, Database, Download, KeyRound, LogOut, Palette, Trash2, User, Volume2 } from "lucide-react";
import { apiUrl, del, post, put, tokenStore } from "../lib/api";
import { applyTheme, useAuth } from "../lib/auth";
import { ACTIVITY, EQUIPMENT, GOALS, LEVELS } from "../lib/constants";
import { voice } from "../lib/media";
import { getUiZoom, setUiZoom, type UiZoom } from "../lib/zoom";
import type { Profile, Settings as S } from "../lib/types";
import { Button, Card, CardHeader, Field, Modal, PageHeader, Segmented, Toggle, toast, confirmDialog, DecimalInput } from "../components/ui";
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
  const [zoom, setZoom] = useState<UiZoom>(getUiZoom);
  const [usingPack, setUsingPack] = useState(!!voice.pack); // đang dùng giọng thu sẵn → khỏi cảnh báo giọng trình duyệt
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

  const n = (k: keyof typeof f) => <DecimalInput className="input" value={f[k] as number} onValue={(v) => setF({ ...f, [k]: v ?? 0 })} />;

  return (
    <div className="space-y-8">
      <PageHeader lead="Cài đặt," help="cai-dat" title="theo cách của bạn" subtitle="Hồ sơ, mục tiêu dinh dưỡng, giọng PT, camera, giao diện, nhắc nhở và dữ liệu." />
      <Card>
        <CardHeader title="Hồ sơ cá nhân" subtitle={<><span className="lg:hidden">HeadBro dùng thông tin này để cá nhân hoá lời khuyên</span><span className="max-lg:hidden">Các agent dùng thông tin này để cá nhân hoá lời khuyên</span></>} icon={<User size={16} />} />
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
            <div className="mt-3 border-t border-border pt-3">
              <Toggle checked={s.energy_mode === "tracked"} onChange={(v) => setSetting({ energy_mode: v ? "tracked" : "average" })}
                label="Mục tiêu calo thay đổi theo vận động mỗi ngày (cộng thêm khi bạn ghi buổi gym / Hoạt động khác)" />
              {s.energy_mode === "tracked" ? (
                <div className="mt-3 space-y-3 pl-1">
                  <div>
                    <p className="mb-1.5 text-sm">Ngoài giờ tập, bạn chủ yếu:</p>
                    <div className="flex flex-wrap gap-2">
                      {([["sitting", "Ngồi học / làm việc"], ["standing", "Đi lại, đứng nhiều"], ["manual", "Lao động chân tay"]] as const).map(([k, label]) => (
                        <button key={k} type="button" aria-pressed={(s.lifestyle ?? "sitting") === k} onClick={() => setSetting({ lifestyle: k })}
                          className={"rounded-full border px-3.5 py-1.5 text-sm transition " + ((s.lifestyle ?? "sitting") === k ? "border-transparent bg-ink text-on-ink" : "border-border bg-surface hover:border-primary/60")}>
                          {label}{p.energy_preview ? <span className="num ml-1 opacity-70">· {fmt(p.energy_preview[k])} kcal</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted">
                    Mục tiêu nền {p.energy_preview ? <b className="text-text">{fmt(p.energy_preview[s.lifestyle ?? "sitting"])} kcal</b> : "(tính từ hồ sơ)"} chưa gồm tập luyện
                    {p.calculated ? <> (thay cho {fmt(p.calculated.calories)} kcal ước lượng trung bình)</> : null}.
                    Mỗi ngày cộng thêm {Math.round((s.eat_back ?? 0.5) * 100)}% calo vận động đã ghi — chỉ ăn bù một phần vì calo vận động thường bị ước cao.
                  </p>
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer select-none">Nâng cao: tỉ lệ ăn bù</summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[0, 0.5, 0.75, 1].map((v) => (
                        <button key={v} type="button" aria-pressed={(s.eat_back ?? 0.5) === v} onClick={() => setSetting({ eat_back: v })}
                          className={"rounded-full border px-3 py-1 transition " + ((s.eat_back ?? 0.5) === v ? "border-transparent bg-ink text-on-ink" : "border-border bg-surface")}>
                          {Math.round(v * 100)}%
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              ) : (
                <div className="mt-3">
                  <Toggle checked={s.calorie_cycling ?? true} onChange={(v) => setSetting({ calorie_cycling: v })} label="Calo theo ngày tập / nghỉ (ngày tập +150 kcal, ngày nghỉ −150 kcal tinh bột, dựa theo lịch tập tuần)" />
                </div>
              )}
            </div>
          </div>
          <Button loading={busy} onClick={saveProfile}>Lưu hồ sơ</Button>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 xl:gap-8">
        <Card>
          <CardHeader title="Giọng nói PT & buổi tập" icon={<Volume2 size={16} />} />
          <div className="space-y-4 px-5 pb-5">
            <Toggle checked={s.voice_coach} onChange={(v) => { voice.enabled = v; setSetting({ voice_coach: v }); }} label="Bật giọng PT (đếm giờ, nhắc form, báo nghỉ)" />
            <VoicePackField onUsing={setUsingPack} />
            <Field label={`Tốc độ đọc: ${s.voice_rate}x`}>
              <input type="range" min={0.7} max={1.5} step={0.1} value={s.voice_rate} className="w-full accent-[var(--primary)]" onChange={(e) => { voice.rate = +e.target.value; setSetting({ voice_rate: +e.target.value }); }} />
            </Field>
            <Toggle checked={s.auto_camera ?? true} onChange={(v) => setSetting({ auto_camera: v })} label="Tự bật Camera AI với bài hỗ trợ (đếm rep, chấm form)" />
            <Field label="Thời gian chuẩn bị trước mỗi bài">
              <Segmented value={String(s.prep_seconds)} onChange={(v) => setSetting({ prep_seconds: +v })} options={["5", "10", "15", "20"].map((x) => ({ value: x, label: `${x}s` }))} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => voice.speak("Xin chào, tôi là huấn luyện viên FitBro. Chuẩn bị, ba, hai, một, bắt đầu!", { force: true })}>Nghe thử giọng</Button>
              <Button size="sm" variant="outline" icon={<Camera size={14} />} onClick={testCamera}>Kiểm tra camera</Button>
            </div>
            {!usingPack && !voice.hasVietnamese() && <p className="text-xs text-warn-strong">Trình duyệt chưa có giọng tiếng Việt — giọng đọc có thể không chuẩn. Chrome/Edge trên Windows/Android thường có sẵn.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Giao diện & nhắc nhở" icon={<Palette size={16} />} />
          <div className="space-y-4 px-5 pb-5">
            <Field label="Chủ đề">
              <Segmented value={s.theme} onChange={(v) => { applyTheme(v); setSetting({ theme: v }); }} options={[{ value: "system", label: "Theo máy" }, { value: "light", label: "Sáng" }, { value: "dark", label: "Tối" }]} />
            </Field>
            <Field label="Cỡ giao diện (máy này)">
              <Segmented value={zoom} onChange={(v) => { setZoom(v); setUiZoom(v); }}
                options={[{ value: "auto", label: "Tự động" }, { value: "0.8", label: "80%" }, { value: "0.9", label: "90%" }, { value: "1", label: "100%" }]} />
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
        <CardHeader title="Trạng thái AI" icon={<Bot size={16} />} right={<Link to="/ai-log" className="-my-2 inline-flex min-h-10 items-center rounded-full px-2 text-sm font-medium text-primary-strong hover:underline">Nhật ký AI →</Link>} />
        <p className="px-5 pb-5 text-sm text-muted">
          {config?.ai_enabled ? <>Đang dùng mô hình <b className="text-text">{config.model}</b>. <span className="max-lg:hidden">Bạn trò chuyện với HeadBro; phía sau, Router chuyển việc cho 2 agent chuyên môn (tập luyện, dinh dưỡng) cùng Safety Guard. Xem từng bước ở Nhật ký AI.</span><span className="lg:hidden">Bạn trò chuyện với HeadBro; xem từng bước xử lý ở Nhật ký AI.</span></> : "AI chưa được cấu hình trên server (thiếu LLM_API_KEY). Các tính năng không cần AI vẫn hoạt động bình thường."}
        </p>
      </Card>

      <PasswordCard hasPassword={!!user?.has_password} />

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

/** Đổi mật khẩu (tài khoản Google chưa có mật khẩu thì đặt mật khẩu mới để đăng nhập bằng email). */
function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const { refresh } = useAuth();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const mismatch = f.confirm.length > 0 && f.next !== f.confirm;
  const valid = f.next.length >= 6 && f.next === f.confirm && (!hasPassword || f.current.length > 0);
  const save = async () => {
    setBusy(true);
    try {
      await put("/api/me/password", { current_password: f.current, new_password: f.next });
      toast(hasPassword ? "Đã đổi mật khẩu" : "Đã đặt mật khẩu");
      setF({ current: "", next: "", confirm: "" });
      refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader title={hasPassword ? "Đổi mật khẩu" : "Đặt mật khẩu"} subtitle={hasPassword ? "Tối thiểu 6 ký tự, khác mật khẩu hiện tại" : "Tài khoản đăng nhập bằng Google: đặt mật khẩu để đăng nhập thêm bằng email"} icon={<KeyRound size={16} />} />
      <form className="grid gap-4 px-5 pb-5 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (valid) save(); }}>
        {hasPassword && (
          <Field label="Mật khẩu hiện tại">
            <input className="input" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
          </Field>
        )}
        <Field label="Mật khẩu mới" hint={f.next && f.next.length < 6 ? "Cần ít nhất 6 ký tự" : undefined}>
          <input className="input" type="password" autoComplete="new-password" minLength={6} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
        </Field>
        <Field label="Nhập lại mật khẩu mới" hint={mismatch ? "Hai mật khẩu chưa khớp" : undefined}>
          <input className="input" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={!valid} loading={busy}>{hasPassword ? "Đổi mật khẩu" : "Đặt mật khẩu"}</Button>
        </div>
      </form>
    </Card>
  );
}

/** Chọn giọng PT thu sẵn (frontend/public/voice/<giọng>/, liệt kê trong packs.json). Không có giọng nào → ẩn. */
function VoicePackField({ onUsing }: { onUsing: (on: boolean) => void }) {
  const [packs, setPacks] = useState<{ id: string; name: string; count: number }[]>([]);
  const [pack, setPack] = useState(voice.pack ?? "browser");
  useEffect(() => {
    fetch("/voice/packs.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        setPacks(Array.isArray(list) ? list : []);
        // giọng đã chọn bị xoá khỏi máy chủ → về giọng trình duyệt
        if (voice.pack && Array.isArray(list) && !list.some((p: { id: string }) => p.id === voice.pack)) {
          voice.setPack(null);
          setPack("browser");
          onUsing(false);
        }
      })
      .catch(() => setPacks([]));
  }, []);
  if (!packs.length) return null;
  return (
    <Field label="Giọng đọc">
      <Segmented
        value={pack}
        onChange={(v) => {
          setPack(v);
          voice.setPack(v === "browser" ? null : v);
          onUsing(v !== "browser");
          voice.speak("Xin chào, tôi là huấn luyện viên FitBro.", { force: true });
        }}
        options={[{ value: "browser", label: "Trình duyệt" }, ...packs.map((p) => ({ value: p.id, label: p.name }))]}
      />
    </Field>
  );
}
