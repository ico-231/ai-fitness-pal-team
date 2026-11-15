import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, ArrowRight, CheckCircle2, Circle, Droplets, Dumbbell, Flame, Pause, Play, Printer, Scale, Sparkles, Target, Trophy, Utensils, Volume2, Weight,
} from "lucide-react";
import { get, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction, useApi } from "../lib/hooks";
import { fmt, greeting, minutes, shortDate } from "../lib/format";
import { voice } from "../lib/media";
import type { Goal, Insight, MuscleVolume, PR, Readiness, Targets } from "../lib/types";
import { BodyMap, HeatLegend } from "../components/BodyMap";
import { BarSeries, LineSeries } from "../components/Charts";
import { useTodayAdvice } from "../components/WorkoutExtras";
import { useAI } from "../components/AIProvider";
import { Badge, Button, Card, CardHeader, Field, Modal, PageHeader, Progress, Ring, Segmented, Spinner, Stat, toast, clickable, IconButton } from "../components/ui";
import { AgentAvatar } from "../components/AgentAvatar";

interface Overview {
  user: { name: string };
  today: {
    date: string;
    readiness: Readiness | null;
    water_ml: number;
    nutrition: { calories: number; protein: number; carbs: number; fat: number; meals_count: number };
    targets: Targets;
    workouts: { count: number; minutes: number; volume: number; avg_form_score: number | null; names: string[] };
    streak: { current: number; best: number; today_active: boolean };
  };
  prs: PR[];
  latest_body: Record<string, { value: number; date: string }>;
  goals: Goal[];
  badges: { achieved: number; total: number };
  insights: Insight[];
  has_any_data: boolean;
}

interface Report {
  period: string;
  start: string;
  end: string;
  bucket_days: number;
  summary: {
    sessions: number; total_volume: number; total_minutes: number; avg_form_score: number | null; pr_count: number;
    avg_calories: number | null; avg_protein: number | null; meal_logged_days: number; weight_change: number | null; avg_readiness: number | null;
  };
  series: { date: string; volume: number; sessions: number; minutes: number; calories: number; protein: number }[];
  sessions: { id: string; name: string; date: string; minutes: number; volume: number; sets: number; form: number | null }[];
  weights: { date: string; weight: number | null; body_fat_pct: number | null; skeletal_muscle_kg: number | null }[];
  readiness: { date: string; readiness: number }[];
  prs: PR[];
}

const BAND_COLOR: Record<string, string> = { high: "var(--primary)", good: "var(--primary)", moderate: "var(--warn)", low: "var(--danger)" };
const PERIODS = { week: "7 ngày", month: "30 ngày", quarter: "Quý (90 ngày)", year: "Năm" } as const;
type DetailKind = "sessions" | "volume" | "prs" | "weight" | "nutrition" | "readiness";

function ReportDetail({ kind, report, onClose, targets }: { kind: DetailKind | null; report?: Report; onClose: () => void; targets?: Targets }) {
  if (!kind || !report) return null;
  const titles: Record<DetailKind, string> = {
    sessions: "Buổi tập", volume: "Khối lượng tập (kg)", prs: "Kỷ lục cá nhân mới", weight: "Xu hướng cân nặng & thành phần cơ thể",
    nutrition: "Dinh dưỡng theo ngày", readiness: "Điểm sẵn sàng",
  };
  const unitDays = report.bucket_days > 1 ? " (gộp theo tuần)" : "";
  return (
    <Modal open onClose={onClose} title={`${titles[kind]} · ${shortDate(report.start)} – ${shortDate(report.end)}`} wide>
      {kind === "sessions" || kind === "volume" ? (
        <>
          <BarSeries data={report.series} dataKey={kind === "sessions" ? "sessions" : "volume"} unit={kind === "sessions" ? "buổi" : "kg"} label={titles[kind]} color="var(--coach)" />
          <p className="mb-3 text-xs text-muted">Khối lượng = Σ (mức tạ × số rep) của mọi set{unitDays}.</p>
          {report.sessions.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1.5">Ngày</th><th>Buổi tập</th><th className="text-right">Thời gian</th><th className="text-right">Set</th><th className="text-right">Khối lượng</th><th className="text-right">Form</th>
                </tr>
              </thead>
              <tbody>
                {report.sessions.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-1.5">{shortDate(s.date)}</td><td>{s.name}</td><td className="text-right">{s.minutes}′</td><td className="text-right">{s.sets}</td>
                    <td className="text-right">{fmt(s.volume)} kg</td><td className="text-right">{s.form ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">Chưa có buổi tập nào trong kỳ này.</p>
          )}
        </>
      ) : kind === "prs" ? (
        report.prs.length ? (
          <ul className="divide-y divide-border text-sm">
            {report.prs.map((p, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium first-letter:uppercase">{p.exercise_name}</p>
                  <p className="text-xs text-muted">{shortDate(p.date)} · {fmt(p.weight_kg, 1)}kg × {p.reps}</p>
                </div>
                <p className="text-right font-semibold text-primary-strong">{p.previous} → {p.e1rm} kg<span className="block text-xs font-normal text-muted">1RM ước tính</span></p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Chưa phá kỷ lục nào trong kỳ này. PR được tính khi 1RM ước tính (Epley) vượt mọi lần trước.</p>
        )
      ) : kind === "weight" ? (
        report.weights.length ? (
          <LineSeries
            data={report.weights}
            lines={[
              { key: "weight", color: "var(--head)", label: "Cân nặng (kg)" },
              { key: "body_fat_pct", color: "var(--nutri)", label: "% mỡ", yAxis: "right" },
            ]}
          />
        ) : (
          <p className="text-sm text-muted">Chưa có lần đo nào trong kỳ này. Nhập cân nặng ở trang InBody.</p>
        )
      ) : kind === "nutrition" ? (
        <>
          <BarSeries data={report.series} dataKey="calories" unit="kcal" label="Calo" color="var(--nutri)" target={report.bucket_days === 1 ? targets?.calories : undefined} />
          <BarSeries data={report.series} dataKey="protein" unit="g" label="Đạm" color="var(--primary)" target={report.bucket_days === 1 ? targets?.protein : undefined} height={180} />
          <p className="text-xs text-muted">Có ghi bữa ăn {report.summary.meal_logged_days} ngày{unitDays}.</p>
        </>
      ) : (
        <BarSeries data={report.readiness} dataKey="readiness" label="Điểm sẵn sàng" color="var(--primary)" />
      )}
    </Modal>
  );
}

const LEVEL_COLOR = { info: "var(--info)", warn: "var(--warn)", good: "var(--primary-strong)" } as const;

function Insights({ items }: { items: Insight[] }) {
  const nav = useNavigate();
  const ai = useAI();
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 2);
  return (
    <Card>
      <CardHeader
        title="HeadBro nhắc bạn"
        subtitle="Tự phát hiện từ dữ liệu của bạn"
        icon={<AgentAvatar agent="headbro" size={26} />}
        right={items.length > 2 ? <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>{all ? "Thu gọn" : `Xem thêm ${items.length - 2}`}</Button> : undefined}
      />
      <div className="grid gap-2 px-4 pb-4 md:grid-cols-2">
        {shown.map((it, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3">
            <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[it.level] }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{it.title}</p>
              <p className="text-xs text-muted">{it.text}</p>
            </div>
            {it.action && (
              <Button size="sm" variant="outline" onClick={() => nav(it.action!.to)}>
                {it.action.label}
              </Button>
            )}
            {it.ask && (
              <Button size="sm" variant="outline" icon={<Sparkles size={13} />} onClick={() => ai.open({ agent: it.ask!.agent, text: it.ask!.text })}>
                Hỏi
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function QuickActions() {
  const nav = useNavigate();
  const [weightOpen, setWeightOpen] = useState(false);
  const [w, setW] = useState("");
  const water = useAction(() => post("/api/daily/water", { delta_ml: 250 }), { success: "+250ml nước" });
  const weight = useAction(() => post("/api/body/metrics", { weight_kg: +w }), {
    success: "Đã lưu cân nặng",
    onSuccess: () => {
      setWeightOpen(false);
      setW("");
    },
  });
  const btn = "flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium hover:border-primary/60";
  return (
    <div className="no-print flex flex-wrap gap-2">
      <button className={btn} onClick={() => water.mutate(undefined as never)}>
        <Droplets size={16} className="text-info" /> +250ml nước
      </button>
      <button className={btn} onClick={() => setWeightOpen(true)}>
        <Scale size={16} className="text-head" /> Ghi cân nặng
      </button>
      <button className={btn} onClick={() => nav("/nutrition")}>
        <Utensils size={16} className="text-nutri" /> Ghi bữa ăn
      </button>
      <button className={btn} onClick={() => nav("/workouts")}>
        <Dumbbell size={16} className="text-coach" /> Tập luyện
      </button>
      <Modal
        open={weightOpen}
        onClose={() => setWeightOpen(false)}
        title="Ghi cân nặng hôm nay"
        footer={
          <Button disabled={!w} loading={weight.isPending} onClick={() => weight.mutate(undefined as never)}>
            Lưu
          </Button>
        }
      >
        <Field label="Cân nặng (kg)">
          <input className="input" type="number" step="0.1" autoFocus value={w} onChange={(e) => setW(e.target.value)} />
        </Field>
        <p className="mt-2 text-xs text-muted">Mẹo: cân vào buổi sáng sau khi thức dậy để số liệu ổn định.</p>
      </Modal>
    </div>
  );
}

function TodayHero({ readiness: r, streak }: { readiness: Readiness | null; streak: number }) {
  const advice = useTodayAdvice();
  const nav = useNavigate();
  return (
    <section aria-label="Hôm nay" className="card overflow-hidden">
      <div className="grid gap-5 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-6">
        <button type="button" onClick={() => nav("/daily")} className="flex items-center gap-4 rounded-2xl text-left" aria-label={r ? `Điểm sẵn sàng ${r.score} trên 100, ${r.label}. Mở chi tiết` : "Check-in để có điểm sẵn sàng"}>
          <Ring value={r?.score ?? 0} color={r ? BAND_COLOR[r.band] : "var(--surface-3)"} size={112} stroke={10}>
            <div>
              <p className="text-[34px] font-extrabold leading-none tracking-tight tabular-nums">{r ? r.score : "—"}</p>
              <p className="mt-0.5 text-[11px] text-muted">sẵn sàng</p>
            </div>
          </Ring>
          <div className="sm:hidden">
            {r ? <Badge color={BAND_COLOR[r.band]}>{r.label}</Badge> : <p className="text-sm text-muted">Chưa check-in</p>}
            {streak > 0 && (
              <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-energy-strong">
                <Flame size={15} /> Chuỗi {streak} ngày
              </p>
            )}
          </div>
        </button>
        <div className="min-w-0">
          <div className="mb-2 hidden flex-wrap items-center gap-2 sm:flex">
            {r && <Badge color={BAND_COLOR[r.band]}>{r.label}</Badge>}
            {streak > 0 && (
              <span className="flex items-center gap-1 text-sm font-semibold text-energy-strong">
                <Flame size={15} /> Chuỗi {streak} ngày
              </span>
            )}
          </div>
          {advice ? (
            <>
              <h2 className="text-xl font-bold leading-snug tracking-tight">{advice.headline}</h2>
              <p className="mt-1 text-sm text-muted">{advice.reason}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {advice.action && (
                  <Button icon={advice.tone === "go" ? <Play size={16} /> : undefined} onClick={() => nav(advice.action!.to)}>
                    {advice.action.label}
                  </Button>
                )}
                {advice.secondary && (
                  <Button variant="outline" onClick={() => nav(advice.secondary!.to)}>
                    {advice.secondary.label}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <Spinner />
          )}
        </div>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const ai = useAI();
  const [period, setPeriod] = useState<keyof typeof PERIODS>("week");
  const [days, setDays] = useState(7);
  const [detail, setDetail] = useState<DetailKind | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [briefText, setBriefText] = useState<string | null>(null);
  const { data: ov, isLoading } = useApi<Overview>(["dashboard"], "/api/dashboard");
  const { data: rep } = useApi<Report>(["report", period], `/api/dashboard/report?period=${period}`);
  const { data: heat } = useApi<MuscleVolume>(["heatmap", days], `/api/dashboard/heatmap?days=${days}`);

  if (isLoading || !ov) return <Spinner />;
  const t = ov.today;
  const r = t.readiness;
  const s = rep?.summary;

  const brief = async () => {
    if (speaking) {
      voice.stop();
      setSpeaking(false);
      return;
    }
    try {
      const { text } = await get<{ text: string }>("/api/dashboard/briefing");
      setBriefText(text);
      if (!voice.supported()) return toast("Trình duyệt không hỗ trợ đọc giọng nói", "error");
      voice.speak(text, { force: true });
      setSpeaking(true);
      const iv = window.setInterval(() => {
        if (!voice.speaking()) {
          setSpeaking(false);
          window.clearInterval(iv);
        }
      }, 500);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const checklist = [
    { done: !!r, label: "Check-in buổi sáng để có điểm sẵn sàng", to: "/daily" },
    { done: t.nutrition.meals_count > 0, label: "Ghi bữa ăn đầu tiên (chụp ảnh hoặc chọn món)", to: "/nutrition" },
    { done: (s?.sessions || 0) > 0, label: "Hoàn thành 1 buổi tập", to: "/workouts" },
    { done: Object.keys(ov.latest_body).length > 1 || ov.goals.length > 0, label: "Nhập chỉ số InBody hoặc đặt mục tiêu", to: "/inbody" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting()}, ${user?.name || "bạn"}`}
        subtitle={new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        actions={
          <>
            <IconButton title={speaking ? "Dừng đọc" : "Nghe tóm tắt hôm nay"} onClick={brief}>
              {speaking ? <Pause size={18} /> : <Volume2 size={18} />}
            </IconButton>
            <IconButton title="Xuất báo cáo PDF" onClick={() => window.print()}>
              <Printer size={18} />
            </IconButton>
            <Button
              icon={<Sparkles size={16} />}
              onClick={() => ai.open({ agent: "headbro", text: "Phân tích tổng thể tiến độ của mình (tập luyện, dinh dưỡng, cơ thể) và cho mình 3 việc nên làm tuần này." })}
            >
              HeadBro phân tích
            </Button>
          </>
        }
      />


      {briefText && (
        <Card className="fade-in flex gap-3 p-4">
          <AgentAvatar agent="headbro" size={30} />
          <p className="text-sm text-muted">{briefText}</p>
        </Card>
      )}

      {!ov.has_any_data && (
        <Card className="p-5">
          <p className="font-semibold">Bắt đầu hành trình của bạn</p>
          <p className="mt-0.5 text-sm text-muted">Trang này chỉ hiển thị dữ liệu thật bạn nhập — chưa có gì ở đây cả. Làm 4 bước sau:</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {checklist.map((c) => (
              <button key={c.label} onClick={() => nav(c.to)} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left text-sm hover:border-primary/60">
                {c.done ? <CheckCircle2 size={18} className="text-primary-strong" /> : <Circle size={18} className="text-muted" />}
                <span className={c.done ? "text-muted line-through" : ""}>{c.label}</span>
                <ArrowRight size={14} className="ml-auto text-muted" />
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Hàng chính: hôm nay mình thế nào và nên làm gì */}
      <TodayHero readiness={r} streak={t.streak.current} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Hôm nay */}
        <Card className="p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-medium text-muted">Tóm tắt hôm nay</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3" {...clickable(() => nav("/nutrition"))} aria-label="Mở Dinh dưỡng">
              {[
                ["Calo", t.nutrition.calories, t.targets.calories, "kcal", "var(--nutri)"],
                ["Đạm", t.nutrition.protein, t.targets.protein, "g", "var(--primary)"],
                ["Nước", t.water_ml / 1000, t.targets.water_ml / 1000, "L", "var(--info)"],
              ].map(([label, v, max, unit, color]) => (
                <div key={label as string}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      {label === "Nước" ? <Droplets size={14} /> : <Utensils size={14} />} {label}
                    </span>
                    <span className="text-muted">
                      <b className="text-text">{fmt(v as number, 1)}</b> / {fmt(max as number, 1)} {unit}
                    </span>
                  </div>
                  <Progress value={v as number} max={max as number} color={color as string} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2" {...clickable(() => nav("/workouts"))} aria-label="Mở Tập luyện">
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-xs text-muted">Buổi tập</p>
                <p className="text-xl font-bold">{t.workouts.count}</p>
                <p className="truncate text-xs text-muted">{t.workouts.names.join(", ") || "Chưa tập"}</p>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-xs text-muted">Thời gian</p>
                <p className="text-xl font-bold">{t.workouts.minutes}′</p>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-xs text-muted">Khối lượng</p>
                <p className="text-xl font-bold">{fmt(t.workouts.volume)}</p>
                <p className="text-xs text-muted">kg</p>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-xs text-muted">Điểm form</p>
                <p className="text-xl font-bold">{t.workouts.avg_form_score ?? "—"}</p>
                <p className="text-xs text-muted">Camera AI</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <QuickActions />
      <Insights items={ov.insights || []} />

      {/* Báo cáo */}
      <Card>
        <CardHeader
          title="Báo cáo thống kê"
          subtitle="Bấm vào từng ô để xem chi tiết"
          right={
            <Segmented
              size="sm"
              value={period}
              onChange={setPeriod}
              options={(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((k) => ({ value: k, label: k === "quarter" ? "Quý" : PERIODS[k] }))}
            />
          }
        />
        <div className="grid grid-cols-2 gap-3 p-4 pt-2 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Buổi tập" value={s?.sessions ?? "—"} sub={s ? minutes(s.total_minutes * 60) : ""} icon={<Dumbbell size={15} />} accent="var(--coach)" onClick={() => setDetail("sessions")} />
          <Stat label="Khối lượng" value={fmt(s?.total_volume)} unit="kg" sub="Σ tạ × rep" icon={<Weight size={15} />} accent="var(--coach)" onClick={() => setDetail("volume")} />
          <Stat label="PR mới" value={s?.pr_count ?? "—"} sub="kỷ lục cá nhân" icon={<Trophy size={15} />} accent="var(--energy)" onClick={() => setDetail("prs")} />
          <Stat
            label="Cân nặng"
            value={s?.weight_change != null ? `${s.weight_change > 0 ? "+" : ""}${fmt(s.weight_change, 1)}` : "—"}
            unit={s?.weight_change != null ? "kg" : ""}
            sub={ov.latest_body.weight_kg ? `Hiện tại ${fmt(ov.latest_body.weight_kg.value, 1)} kg` : "Chưa đo"}
            icon={<Scale size={15} />}
            accent="var(--head)"
            onClick={() => setDetail("weight")}
          />
          <Stat label="Calo TB/ngày" value={fmt(s?.avg_calories)} unit={s?.avg_calories ? "kcal" : ""} sub={s?.avg_protein ? `${fmt(s.avg_protein)}g đạm TB` : "Chưa ghi bữa ăn"} icon={<Utensils size={15} />} accent="var(--nutri)" onClick={() => setDetail("nutrition")} />
          <Stat label="Sẵn sàng TB" value={s?.avg_readiness ?? "—"} sub="điểm / 100" icon={<Activity size={15} />} accent="var(--primary)" onClick={() => setDetail("readiness")} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Heatmap */}
        <Card className="lg:col-span-3">
          <CardHeader
            title="Bản đồ nhiệt cơ bắp"
            subtitle="Nhóm cơ đã tập nhiều nhất trong khoảng thời gian"
            right={
              <Segmented
                size="sm"
                value={String(days)}
                onChange={(v) => setDays(+v)}
                options={[
                  { value: "7", label: "7 ngày" },
                  { value: "30", label: "Tháng" },
                  { value: "90", label: "Quý" },
                  { value: "365", label: "Năm" },
                ]}
              />
            }
          />
          <div className="px-4 pb-5">
            {heat ? (
              <>
                <BodyMap data={heat.muscles} />
                <div className="mt-2">
                  <HeatLegend levels={heat.levels} />
                </div>
                <p className="mt-2 text-center text-xs text-muted">
                  Cơ chính = 1 set, cơ phụ = 0,5 set. Khuyến nghị 10–20 set/nhóm cơ/tuần để tăng cơ.
                </p>
                {heat.total_sets > 0 ? (
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                    {Object.entries(heat.muscles)
                      .filter(([, v]) => v.sets > 0)
                      .sort((a, b) => b[1].sets - a[1].sets)
                      .slice(0, 6)
                      .map(([k, v]) => (
                        <Badge key={k}>
                          {v.label}: {fmt(v.sets, 1)} set
                        </Badge>
                      ))}
                  </div>
                ) : (
                  <p className="mt-3 text-center text-sm text-muted">Chưa có buổi tập nào trong khoảng này.</p>
                )}
              </>
            ) : (
              <Spinner />
            )}
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Kỷ lục cá nhân (PR)" icon={<Trophy size={16} />} />
            <div className="px-5 pb-4">
              {ov.prs.length ? (
                <ul className="divide-y divide-border text-sm">
                  {ov.prs.map((p) => (
                    <li key={p.exercise_id} className="flex justify-between py-2">
                      <span className="truncate pr-2 first-letter:uppercase">{p.exercise_name}</span>
                      <span className="shrink-0 font-semibold">
                        {fmt(p.e1rm, 1)} kg <span className="text-xs font-normal text-muted">({fmt(p.weight_kg, 1)}×{p.reps})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-sm text-muted">Hoàn thành buổi tập có tạ để ghi nhận PR.</p>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Mục tiêu" icon={<Target size={16} />} right={<Button size="sm" variant="ghost" onClick={() => nav("/inbody")}>Quản lý</Button>} />
            <div className="space-y-3 px-5 pb-5">
              {ov.goals.length ? (
                [...ov.goals.slice(0, 3).map((g) => (
                  <div key={g.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{g.title}</span>
                      <span className="text-muted">{g.progress_pct ?? 0}%</span>
                    </div>
                    <Progress value={g.progress_pct ?? 0} max={100} />
                    {g.days_left != null && <p className="mt-0.5 text-xs text-muted">Còn {g.days_left} ngày</p>}
                  </div>
                )), ov.goals.length > 3 && (
                  <button key="more" type="button" onClick={() => nav("/inbody")} className="text-sm font-medium text-primary-strong hover:underline">
                    Xem thêm {ov.goals.length - 3} mục tiêu
                  </button>
                )]
              ) : (
                <div className="text-sm text-muted">
                  Chưa có mục tiêu.{" "}
                  <button className="font-medium text-primary-strong" onClick={() => ai.open({ agent: "headbro", text: "Mình muốn đặt một mục tiêu cụ thể. Hãy hỏi mình từng bước." })}>
                    Đặt cùng HeadBro
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <ReportDetail kind={detail} report={rep} onClose={() => setDetail(null)} targets={t.targets} />
    </div>
  );
}
