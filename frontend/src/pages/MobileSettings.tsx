import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight, Download, LogOut, Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import clsx from "clsx";
import { del, post } from "../lib/api";
import { applyTheme, useAuth } from "../lib/auth";
import { ACTIVITY, EQUIPMENT, GOALS, LEVELS } from "../lib/constants";
import { fmt, timeAgo } from "../lib/format";
import { useAction, useApi } from "../lib/hooks";
import { voice } from "../lib/media";
import { getUiZoom, setUiZoom, type UiZoom } from "../lib/zoom";
import { DecimalInput, confirmDialog } from "../components/ui";
import { HeadBroSvg } from "../components/MobileShell";
import { Seg } from "../components/mobile/Shared";
import { Sheet } from "../components/mobile/Sheet";
import { useSettingsActions, useVoicePacks } from "../lib/useSettingsActions";
import { vars } from "../components/mobile/V1";

/* =====================================================================================
   Cài đặt — V1 "Kính lỏng" (điện thoại). Đủ mục của bản máy tính: hồ sơ, mục tiêu dinh dưỡng, giọng PT & buổi tập,
   giao diện & nhắc nhở, trí nhớ, trạng thái AI, mật khẩu, dữ liệu & tài khoản.
   ===================================================================================== */

const SEX: Record<string, string> = { male: "Nam", female: "Nữ", other: "Khác" };
const CAT: Record<string, string> = { preference: "Sở thích", health: "Sức khỏe", schedule: "Lịch sinh hoạt", food: "Ăn uống", goal: "Mục tiêu", other: "Khác" };

interface Mem { id: string; content: string; category: string; source: string; created_at: string }

function Sw({ label, sub, checked, onChange }: { label: ReactNode; sub?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="li">
      <span className="li-main"><b>{label}</b>{sub && <small>{sub}</small>}</span>
      <span className="switch"><input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span /></span>
    </label>
  );
}

function Sel({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: Record<string, string> }) {
  return (
    <div className="field"><label htmlFor={id}>{label}</label>
      <div className="select">
        <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>{Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <ChevronDown className="ic" />
      </div>
    </div>
  );
}

function NumStep({ value, onChange, min, max, dec = 0, stepBy, label, unit }: { value: number; onChange: (n: number) => void; min: number; max: number; dec?: number; stepBy: number; label: string; unit?: string }) {
  const clamp = (n: number) => Math.max(min, Math.min(max, +n.toFixed(dec)));
  return (
    <div className="stepper">
      <button type="button" aria-label={`Giảm ${fmt(stepBy, dec)}`} disabled={value <= min} onClick={() => onChange(clamp(value - stepBy))}><Minus className="ic" /></button>
      <label className="sv-box"><DecimalInput className="sv n" aria-label={label} value={value} onValue={(n) => { if (n != null) onChange(clamp(n)); }} />{unit && <span>{unit}</span>}</label>
      <button type="button" aria-label={`Tăng ${fmt(stepBy, dec)}`} disabled={value >= max} onClick={() => onChange(clamp(value + stepBy))}><Plus className="ic" /></button>
    </div>
  );
}

export default function MobileSettings() {
  const { user, signOut, config } = useAuth();
  const { busy, saveProfile, setSetting, exportData, testCamera, deleteAccount, wipeData } = useSettingsActions();
  const p = user!.profile!;
  const s = p.settings;
  const [f, setF] = useState({
    name: user!.name, age: p.age ?? 20, gender: p.gender ?? "male", height_cm: p.height_cm ?? 170, weight_kg: p.weight_kg ?? 65,
    goal: p.goal, level: p.level, activity_level: p.activity_level, training_days: p.training_days, equipment: p.equipment, injuries: p.injuries,
    targets_manual: p.targets_manual, target_calories: p.targets.calories, target_protein: p.targets.protein, target_carbs: p.targets.carbs,
    target_fat: p.targets.fat, target_water_ml: p.targets.water_ml,
  });
  const set = (k: keyof typeof f, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const [profOpen, setProfOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [memOpen, setMemOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [zoom, setZoom] = useState<UiZoom>(getUiZoom);
  const [usingPack, setUsingPack] = useState(!!voice.pack);
  const mems = useApi<Mem[]>(["memories"], "/api/memories");

  const save = (over?: Partial<typeof f>, okMsg?: string) => saveProfile({ ...f, ...over }, okMsg);
  const wipe = async () => { if (await wipeData(confirmText)) { setWipeOpen(false); setConfirmText(""); } };

  const lifestyle = s.lifestyle ?? "sitting";
  const eatBack = s.eat_back ?? 0.5;
  const rate = s.voice_rate;
  const themeIdx = ["system", "light", "dark"].indexOf(s.theme);
  const zoomIdx = ["auto", "0.8", "0.9", "1"].indexOf(zoom);

  const rows: [string, string, string | number][] = [
    ["Tên", "name", f.name], ["Tuổi", "age", f.age], ["Giới tính", "gender", SEX[f.gender]], ["Chiều cao", "h", `${fmt(f.height_cm, 1)} cm`], ["Cân nặng", "w", `${fmt(f.weight_kg, 1)} kg`],
    ["Mục tiêu", "goal", GOALS[f.goal]], ["Trình độ", "level", LEVELS[f.level].replace(/ \(.*/, "")], ["Số buổi mỗi tuần", "d", f.training_days],
    ["Mức vận động", "act", ACTIVITY[f.activity_level].replace(/ \(.*/, "")], ["Dụng cụ", "eq", EQUIPMENT[f.equipment]], ["Chấn thương / lưu ý", "inj", f.injuries?.trim() || "Không có"],
  ];

  return (
    <div className="v1">
      <h2 className="sec" style={{ paddingTop: 4 }}>Hồ sơ cá nhân</h2>
      <p className="st-sub">HeadBro dùng thông tin này để cá nhân hoá lời khuyên.</p>
      <div className="g list st-l" style={{ marginTop: -2 }}>
        {rows.map(([k, , v]) => (
          <button key={k} type="button" className="li" onClick={() => setProfOpen(true)}>
            <span className="li-main"><b>{k}</b></span>
            <span className="li-end"><span className="v">{v}</span><ChevronRight className="ic" /></span>
          </button>
        ))}
      </div>

      <h2 className="sec">Mục tiêu dinh dưỡng</h2>
      <div className="g list st-l">
        <Sw label="Tự đặt mục tiêu dinh dưỡng" sub="Tắt: tính tự động từ hồ sơ của bạn" checked={f.targets_manual}
          onChange={(v) => { set("targets_manual", v); if (!v) save({ targets_manual: false }, "Đã quay lại tính tự động."); }} />
        {f.targets_manual && (
          <>
            <div className="st-man">
              {([["target_calories", "Năng lượng", "kcal"], ["target_protein", "Đạm", "g"], ["target_carbs", "Tinh bột", "g"], ["target_fat", "Chất béo", "g"], ["target_water_ml", "Nước", "ml"]] as const).map(([k, label, unit]) => (
                <div className="field" key={k}><label>{label}</label>
                  <div className="input-unit"><DecimalInput className="input n" aria-label={`${label} (${unit})`} value={f[k]} onValue={(n) => set(k, n ?? 0)} /><span>{unit}</span></div></div>
              ))}
            </div>
            <div style={{ padding: "0 16px 14px" }}><button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => save()}>Lưu mục tiêu</button></div>
          </>
        )}
        {p.calculated && (
          <div className="st-auto"><b>Tự động</b>{fmt(p.calculated.calories, 1)} kcal · {fmt(p.calculated.protein, 1)} g đạm · {fmt(p.calculated.carbs, 1)} g tinh bột · {fmt(p.calculated.fat, 1)} g chất béo · {fmt(p.calculated.water_ml / 1000, 1)} L nước</div>
        )}
        <Sw label="Mục tiêu calo thay đổi theo vận động mỗi ngày" sub="Cộng thêm khi bạn ghi buổi gym hoặc hoạt động khác" checked={s.energy_mode === "tracked"} onChange={(v) => setSetting({ energy_mode: v ? "tracked" : "average" })} />
        {s.energy_mode === "tracked" ? (
          <div className="st-pad">
            <div>
              <p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Ngoài giờ tập, bạn chủ yếu</p>
              <div className="chips" role="group" aria-label="Lối sống ngoài giờ tập">
                {([["sitting", "Ngồi học / làm việc"], ["standing", "Đi lại, đứng nhiều"], ["manual", "Lao động chân tay"]] as const).map(([k, label]) => (
                  <button key={k} type="button" className={clsx("chip", lifestyle === k && "on")} aria-pressed={lifestyle === k} onClick={() => setSetting({ lifestyle: k })}>
                    {label}{p.energy_preview ? <span className="n" style={{ opacity: 0.7 }}> · {fmt(p.energy_preview[k])} kcal</span> : null}
                  </button>
                ))}
              </div>
            </div>
            <p className="t-small">
              Mục tiêu nền {p.energy_preview ? <b>{fmt(p.energy_preview[lifestyle])} kcal</b> : "(tính từ hồ sơ)"} chưa gồm tập luyện. Mỗi ngày cộng thêm {Math.round(eatBack * 100)}% calo vận động đã ghi — chỉ ăn bù một phần vì calo vận động thường bị ước cao.
            </p>
            <div>
              <p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Tỉ lệ ăn bù</p>
              <div className="chips" role="group" aria-label="Tỉ lệ ăn bù">
                {[0, 0.5, 0.75, 1].map((v) => <button key={v} type="button" className={clsx("chip", eatBack === v && "on")} aria-pressed={eatBack === v} onClick={() => setSetting({ eat_back: v })}>{Math.round(v * 100)}%</button>)}
              </div>
            </div>
          </div>
        ) : (
          <Sw label="Calo theo ngày tập / nghỉ" sub="Ngày tập +150 kcal, ngày nghỉ −150 kcal tinh bột, theo lịch tập tuần" checked={s.calorie_cycling ?? true} onChange={(v) => setSetting({ calorie_cycling: v })} />
        )}
      </div>

      <h2 className="sec">Giọng nói PT &amp; buổi tập</h2>
      <div className="g list st-l">
        <Sw label="Bật giọng PT" sub="Đếm giờ, nhắc form, báo nghỉ" checked={s.voice_coach} onChange={(v) => { voice.enabled = v; setSetting({ voice_coach: v }); }} />
      </div>
      <div className="g st-pad" style={{ marginTop: 10 }}>
        <VoicePack onUsing={setUsingPack} />
        <div className="st-rg">
          <div className="t"><span>Tốc độ đọc</span><span className="n">{rate}x</span></div>
          <input type="range" className="range" min={0.7} max={1.5} step={0.1} value={rate} aria-label="Tốc độ đọc" style={vars({ "--p": `${((rate - 0.7) / 0.8) * 100}%` })}
            onChange={(e) => { voice.rate = +e.target.value; setSetting({ voice_rate: +e.target.value }); }} />
          <div className="range-scale"><span>0,7x</span><span>1,5x</span></div>
        </div>
        <div>
          <p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Thời gian chuẩn bị trước mỗi bài</p>
          <Seg label="Thời gian chuẩn bị" options={["5s", "10s", "15s", "20s"]} value={[5, 10, 15, 20].indexOf(s.prep_seconds)} onChange={(i) => setSetting({ prep_seconds: [5, 10, 15, 20][i] })} />
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-glass" onClick={() => voice.speak("Xin chào, tôi là huấn luyện viên FitBro. Chuẩn bị, ba, hai, một, bắt đầu!", { force: true })}>Nghe thử giọng</button>
          <button type="button" className="btn btn-glass" onClick={testCamera}>Kiểm tra camera</button>
        </div>
        {!usingPack && !voice.hasVietnamese() && <p className="t-small" style={{ color: "var(--orange-t)" }}>Trình duyệt chưa có giọng tiếng Việt — giọng đọc có thể không chuẩn. Chrome/Edge trên Windows/Android thường có sẵn.</p>}
      </div>
      <div className="g list st-l" style={{ marginTop: 10 }}>
        <Sw label="Tự bật Camera AI với bài hỗ trợ" sub="Đếm rep, chấm form" checked={s.auto_camera ?? true} onChange={(v) => setSetting({ auto_camera: v })} />
      </div>

      <h2 className="sec">Giao diện &amp; nhắc nhở</h2>
      <div className="g st-pad">
        <div>
          <p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Chủ đề</p>
          <Seg label="Chủ đề giao diện" options={["Theo máy", "Sáng", "Tối"]} value={themeIdx} onChange={(i) => { const v = (["system", "light", "dark"] as const)[i]; applyTheme(v); setSetting({ theme: v }); }} />
        </div>
        <div>
          <p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Cỡ giao diện (máy này)</p>
          <Seg label="Cỡ giao diện" options={["Tự động", "80%", "90%", "100%"]} value={zoomIdx} onChange={(i) => { const v = (["auto", "0.8", "0.9", "1"] as const)[i]; setZoom(v); setUiZoom(v); }} />
        </div>
      </div>
      <div className="g list st-l" style={{ marginTop: 10 }}>
        <Sw label="Bật nhắc nhở" sub="Khi đang mở FitBro" checked={s.reminders.enabled}
          onChange={async (v) => {
            if (v && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
            setSetting({ reminders: { ...s.reminders, enabled: v } });
          }} />
        <div className="li"><span className="li-main"><b>Check-in</b></span><label className="sr" htmlFor="t-ci">Giờ check-in</label>
          <input id="t-ci" className="input st-tm n" type="time" disabled={!s.reminders.enabled} value={s.reminders.checkin} onChange={(e) => setSetting({ reminders: { ...s.reminders, checkin: e.target.value } })} /></div>
        <div className="li"><span className="li-main"><b>Giờ tập</b></span><label className="sr" htmlFor="t-tr">Giờ tập</label>
          <input id="t-tr" className="input st-tm n" type="time" disabled={!s.reminders.enabled} value={s.reminders.workout} onChange={(e) => setSetting({ reminders: { ...s.reminders, workout: e.target.value } })} /></div>
        <div className="li"><span className="li-main"><b>Uống nước</b></span><label className="sr" htmlFor="t-wa">Nhắc uống nước</label>
          <select id="t-wa" className="input st-tm" disabled={!s.reminders.enabled} value={s.reminders.water_every_min} onChange={(e) => setSetting({ reminders: { ...s.reminders, water_every_min: +e.target.value } })}>
            <option value={0}>Tắt</option><option value={60}>Mỗi 1h</option><option value={90}>Mỗi 1,5h</option><option value={120}>Mỗi 2h</option>
          </select></div>
      </div>

      <h2 className="sec" id="memory">Trí nhớ của HeadBro</h2>
      <div className="g list st-l">
        <button type="button" className="li" onClick={() => setMemOpen(true)}>
          <span className="li-ic"><Sparkles className="ic" /></span>
          <span className="li-main"><b>{mems.data ? (mems.data.length ? `${mems.data.length} điều đã ghi nhớ` : "Chưa có gì được ghi nhớ") : "Trí nhớ của HeadBro"}</b><small>Xem, thêm và xoá những gì HeadBro nhớ về bạn</small></span>
          <span className="li-end"><ChevronRight className="ic" /></span>
        </button>
      </div>

      <h2 className="sec">Trạng thái AI</h2>
      <div className="g st-pad">
        <p style={{ fontSize: 14, lineHeight: 1.55 }}>
          {config?.ai_enabled ? <>Đang dùng mô hình <b>{config.model}</b>. Bạn chỉ trò chuyện với HeadBro; phía sau, HeadBro chia việc cho các chuyên mục (tập luyện, dinh dưỡng) và lớp an toàn kiểm tra lại.</>
            : !config ? "Đang kiểm tra trạng thái AI…" : "AI chưa được cấu hình trên server (thiếu LLM_API_KEY). Các tính năng không cần AI vẫn hoạt động bình thường."}
        </p>
        <Link className="link" to="/ai-log">Nhật ký AI<ChevronRight className="ic ic-sm" /></Link>
      </div>

      <PasswordForm hasPassword={!!user?.has_password} />

      <h2 className="sec">Dữ liệu &amp; tài khoản</h2>
      <div className="g list st-l">
        <button type="button" className="li" onClick={exportData}><span className="li-ic"><Download className="ic" /></span><span className="li-main"><b>Xuất toàn bộ dữ liệu (JSON)</b></span></button>
        <button type="button" className="li" onClick={signOut}><span className="li-ic"><LogOut className="ic" /></span><span className="li-main"><b>Đăng xuất</b></span></button>
        <button type="button" className="li st-red" onClick={() => setWipeOpen(true)}><span className="li-ic"><Trash2 className="ic" /></span><span className="li-main"><b>Xoá sạch dữ liệu</b></span></button>
        <button type="button" className="li st-red" onClick={deleteAccount}><span className="li-ic"><AlertTriangle className="ic" /></span><span className="li-main"><b>Xoá tài khoản</b></span></button>
      </div>

      {/* Hồ sơ */}
      <Sheet open={profOpen} onClose={() => setProfOpen(false)} full title="Hồ sơ cá nhân" sub="HeadBro dùng thông tin này để cá nhân hoá lời khuyên."
        actions={<button type="button" className="btn btn-primary btn-block" disabled={busy || !f.name.trim()} onClick={async () => { if (await save()) setProfOpen(false); }}>{busy ? <><span className="spinner" aria-hidden="true" />Đang lưu...</> : "Lưu hồ sơ"}</button>}>
        <div className="sheet-body stack-in">
          <div className="field"><label htmlFor="pf-name">Tên hiển thị</label><input id="pf-name" className="input" autoComplete="given-name" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="pf-g">
            <div className="field"><label htmlFor="pf-age">Tuổi</label><DecimalInput id="pf-age" className="input n" value={f.age} onValue={(n) => set("age", n == null ? 0 : Math.round(n))} /></div>
            <div className="field"><span className="lbl">Giới tính</span>
              <Seg sm label="Giới tính" options={["Nam", "Nữ", "Khác"]} value={["male", "female", "other"].indexOf(f.gender)} onChange={(i) => set("gender", ["male", "female", "other"][i])} /></div>
            <div className="field"><label htmlFor="pf-h">Chiều cao</label><div className="input-unit"><DecimalInput id="pf-h" className="input n" value={f.height_cm} onValue={(n) => set("height_cm", n ?? 0)} /><span>cm</span></div></div>
            <div className="field"><label htmlFor="pf-w">Cân nặng</label><div className="input-unit"><DecimalInput id="pf-w" className="input n" value={f.weight_kg} onValue={(n) => set("weight_kg", n ?? 0)} /><span>kg</span></div></div>
          </div>
          <Sel id="pf-goal" label="Mục tiêu" value={f.goal} onChange={(v) => set("goal", v)} options={GOALS} />
          <Sel id="pf-lv" label="Trình độ" value={f.level} onChange={(v) => set("level", v)} options={LEVELS} />
          <div className="field"><span className="lbl">Số buổi tập mỗi tuần</span><NumStep value={f.training_days} onChange={(n) => set("training_days", n)} min={0} max={7} stepBy={1} label="Số buổi tập mỗi tuần" /></div>
          <Sel id="pf-act" label="Mức vận động" value={f.activity_level} onChange={(v) => set("activity_level", v)} options={ACTIVITY} />
          <Sel id="pf-eq" label="Dụng cụ" value={f.equipment} onChange={(v) => set("equipment", v)} options={EQUIPMENT} />
          <div className="field"><label htmlFor="pf-inj">Chấn thương / lưu ý sức khỏe <span>không bắt buộc</span></label>
            <textarea id="pf-inj" className="input" rows={3} value={f.injuries} onChange={(e) => set("injuries", e.target.value)} /><p className="hint">HeadBro sẽ tránh bài gây ảnh hưởng.</p></div>
        </div>
      </Sheet>

      {/* Xoá sạch dữ liệu */}
      <Sheet open={wipeOpen} onClose={() => { setWipeOpen(false); setConfirmText(""); }} title="Xoá sạch dữ liệu"
        actions={<><button type="button" className="btn btn-glass btn-block" onClick={exportData}>Xuất dữ liệu trước</button>
          <button type="button" className="btn btn-danger btn-block" disabled={confirmText.trim().toUpperCase() !== "XOA"} onClick={wipe}>Xoá vĩnh viễn</button></>}>
        <div className="sheet-body">
          <p className="wp-t">Xoá toàn bộ check-in, buổi tập, bữa ăn, chỉ số cơ thể, mục tiêu và lịch sử chat. Tài khoản và hồ sơ được giữ lại. Không thể hoàn tác. Hãy xuất dữ liệu trước nếu cần.</p>
          <div className="field"><label htmlFor="wp-in">Gõ XOA để xác nhận</label><input id="wp-in" className="input" autoComplete="off" autoCapitalize="characters" placeholder="Gõ XOA ở đây" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></div>
        </div>
      </Sheet>

      <MemorySheet open={memOpen} onClose={() => setMemOpen(false)} />
    </div>
  );
}

/** Chọn giọng PT thu sẵn (frontend/public/voice/<giọng>/, liệt kê trong packs.json). Không có giọng nào → ẩn. */
function VoicePack({ onUsing }: { onUsing: (on: boolean) => void }) {
  const [pack, setPack] = useState(voice.pack ?? "browser");
  const packs = useVoicePacks(() => { setPack("browser"); onUsing(false); });
  const opts = useMemo(() => [{ id: "browser", name: "Trình duyệt" }, ...packs], [packs]);
  if (!packs.length) return null;
  return (
    <div>
      <p className="t-label" style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Giọng đọc</p>
      <Seg label="Chọn giọng đọc" options={opts.map((o) => o.name)} value={opts.findIndex((o) => o.id === pack)}
        onChange={(i) => { const id = opts[i].id; setPack(id); voice.setPack(id === "browser" ? null : id); onUsing(id !== "browser"); voice.speak("Xin chào, tôi là huấn luyện viên FitBro.", { force: true }); }} />
    </div>
  );
}

/** Đổi mật khẩu (tài khoản Google chưa có mật khẩu thì đặt mật khẩu mới để đăng nhập bằng email). */
function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const { changePassword } = useSettingsActions();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const mismatch = f.confirm.length > 0 && f.next !== f.confirm;
  const short = f.next.length > 0 && f.next.length < 6;
  const valid = f.next.length >= 6 && f.next === f.confirm && (!hasPassword || f.current.length > 0);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!valid) return;
    setBusy(true);
    if (await changePassword(f.current, f.next, hasPassword)) {
      setF({ current: "", next: "", confirm: "" });
      setTried(false);
    }
    setBusy(false);
  };
  const msg = short ? "Tối thiểu 6 ký tự." : mismatch ? "Hai mật khẩu mới chưa giống nhau." : tried && hasPassword && !f.current ? "Nhập mật khẩu hiện tại." : "";
  return (
    <>
      <h2 className="sec">{hasPassword ? "Đổi mật khẩu" : "Đặt mật khẩu"}</h2>
      <form className="g st-pad st-pw" onSubmit={submit} noValidate>
        {!hasPassword && <p className="t-small">Tài khoản đăng nhập bằng Google: đặt mật khẩu để đăng nhập thêm bằng email.</p>}
        {hasPassword && <div className="field"><label htmlFor="pw0">Mật khẩu hiện tại</label><input id="pw0" className="input" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></div>}
        <div className="field"><label htmlFor="pw1">Mật khẩu mới</label><input id="pw1" className="input" type="password" autoComplete="new-password" aria-invalid={short || undefined} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></div>
        <div className="field"><label htmlFor="pw2">Nhập lại mật khẩu mới</label><input id="pw2" className="input" type="password" autoComplete="new-password" aria-invalid={mismatch || undefined} value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></div>
        {msg && <p className="hint err" role="alert">{msg}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? <><span className="spinner" aria-hidden="true" />Đang lưu...</> : hasPassword ? "Đổi mật khẩu" : "Đặt mật khẩu"}</button>
      </form>
    </>
  );
}

/** Trí nhớ của HeadBro: xem, lọc theo nhóm, thêm, xoá (hộp thoại V1). */
function MemorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useApi<Mem[]>(["memories"], "/api/memories");
  const [text, setText] = useState("");
  const [cat, setCat] = useState("");
  const add = useAction(() => post("/api/memories", { content: text, category: "other" }), { success: "Đã thêm", onSuccess: () => { setText(""); setCat(""); } });
  const remove = useAction((id: string) => del(`/api/memories/${id}`), { success: "Đã xoá ký ức" });
  const cats = useMemo(() => [...new Set((data ?? []).map((m) => m.category))], [data]);
  const shown = (data ?? []).filter((m) => !cat || m.category === cat);
  const ask = async (m: Mem) => {
    if (await confirmDialog({ title: "Xoá ghi nhớ này?", text: m.content, confirmLabel: "Xoá", danger: true })) remove.mutate(m.id);
  };
  return (
    <Sheet open={open} onClose={onClose} full title="Trí nhớ của HeadBro">
      <div className="sheet-body">
        <p className="mm-intro"><span className="aimark sm" aria-hidden="true"><HeadBroSvg className="ic-ai" /></span><span>Những điều HeadBro đã ghi nhớ về bạn để không phải hỏi lại.</span></p>
        {!data ? <span className="sk sk-block" style={{ height: 160 }} /> : data.length === 0 ? (
          <section className="g empty mm-empty" aria-label="Chưa có ghi nhớ">
            <span className="empty-ic"><Sparkles className="ic" /></span><b>Chưa có gì.</b>
            <p>Khi bạn kể với HeadBro kiểu “mình hay tập lúc 6h sáng”, HeadBro sẽ tự nhớ.</p>
          </section>
        ) : (
          <>
            <div className="chips scroll mm-filter" role="group" aria-label="Lọc theo nhóm">
              <button type="button" className={clsx("chip", !cat && "on")} aria-pressed={!cat} onClick={() => setCat("")}>Tất cả</button>
              {cats.map((c) => <button key={c} type="button" className={clsx("chip", cat === c && "on")} aria-pressed={cat === c} onClick={() => setCat(c)}>{CAT[c] || c}</button>)}
            </div>
            <h3 className="sec" style={{ padding: "8px 6px 0" }}>Đã ghi nhớ<span>{data.length} điều</span></h3>
            <div className="g list" style={{ marginTop: -4 }}>
              {shown.map((m) => (
                <div className="li mm-row" key={m.id}>
                  <div className="mm-main"><b>{m.content}</b><small>{CAT[m.category] || m.category} · {m.source === "manual" ? "bạn tự thêm" : "HeadBro ghi nhớ"} · {timeAgo(m.created_at)}</small></div>
                  <button type="button" className="mm-del" aria-label={`Xoá ghi nhớ: ${m.content}`} onClick={() => ask(m)}><Trash2 className="ic" /></button>
                </div>
              ))}
            </div>
            {shown.length === 0 && <p className="mm-none">Chưa có mục nào trong nhóm này.</p>}
          </>
        )}
        <h3 className="mm-addl">Thêm điều HeadBro cần nhớ</h3>
        <div className="mm-add" style={{ marginTop: 0 }}>
          <input className="input" aria-label="Điều HeadBro cần nhớ về bạn" placeholder="Vd: Không ăn được thịt bò" maxLength={120} autoComplete="off" value={text}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { e.preventDefault(); add.mutate(undefined as never); } }} />
          <button type="button" className="btn btn-primary btn-sm" disabled={!text.trim() || add.isPending} onClick={() => add.mutate(undefined as never)}>Thêm</button>
        </div>
      </div>
    </Sheet>
  );
}
