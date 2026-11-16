import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { Activity, AlertTriangle, ArrowLeft, BookOpen, Clock, Cpu, Gauge, ShieldCheck, Wrench, Zap } from "lucide-react";
import { useApi } from "../lib/hooks";
import { AGENTS, TOOL_LABELS } from "../lib/constants";
import type { AgentKey } from "../lib/types";
import { Badge, Button, Card, CardHeader, Empty, PageHeader, Segmented, Spinner, Stat } from "../components/ui";

interface TraceBrief {
  id: string;
  created_at: string;
  question: string;
  agents: string[];
  route_method: string | null;
  status: "ok" | "error" | "blocked";
  guard: string | null;
  total_ms: number;
  ttft_ms: number | null;
  llm_calls: number;
  tool_calls: number;
  tool_errors: number;
  tokens_in: number;
  tokens_out: number;
  providers: string[];
  output_flags: string[];
  rag: number;
  sample?: boolean;
}

interface Span {
  kind: "guard" | "router" | "agent" | "llm" | "tool" | "rag";
  name: string;
  stage: string;
  start_ms: number;
  ms: number;
  provider?: string;
  model?: string;
  ttft_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  fallbacks?: number;
  tool_calls?: string[];
  error?: string;
  args?: string;
  method?: string;
  hits?: string[];
  query?: string;
  level?: string;
  guard_kind?: string;
  notes?: string[];
  flags?: string[];
  agents?: string[];
}

interface TraceDetail extends Omit<TraceBrief, "rag" | "output_flags"> {
  error: string | null;
  spans: Span[];
  rag: { query: string; method: string; hits: string[] }[];
  output_flags: { kind: string; detail?: string }[];
}

interface Stats {
  count: number;
  blocked: number;
  errors: number;
  error_rate: number;
  latency: { p50: number | null; p95: number | null; avg: number | null };
  ttft: { p50: number | null; p95: number | null };
  llm: { calls: number; p50_ms: number | null; fallbacks: number; by_model: Record<string, number> };
  tokens: { in: number; out: number };
  tools: { name: string; calls: number; p50_ms: number | null; errors: number }[];
  agents: Record<string, number>;
  route_methods: Record<string, number>;
  guard: Record<string, number>;
  output_flags: Record<string, number>;
  rag: Record<string, number>;
}

const sec = (ms: number | null | undefined) => (ms == null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const time = (iso: string) => new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

const KIND_COLOR: Record<Span["kind"], string> = {
  guard: "var(--color-warn)",
  router: "#8b5cf6",
  agent: "var(--color-border)",
  llm: "var(--color-primary)",
  tool: "#ec4899",
  rag: "#0ea5e9",
};

const GUARD_LABEL: Record<string, string> = {
  emergency: "Cấp cứu",
  crisis: "Khủng hoảng tâm lý",
  eating_disorder: "Rối loạn ăn uống",
  drugs: "Chất cấm",
  medical_caution: "Thận trọng y tế",
  injection: "Prompt injection",
  extreme_diet: "Ăn kiêng cực đoan",
};
const FLAG_LABEL: Record<string, string> = {
  low_calorie: "Calo quá thấp",
  fast_weight_loss: "Giảm cân quá nhanh",
  long_fasting: "Nhịn ăn dài ngày",
  diagnosis: "Chẩn đoán bệnh",
  medication_dose: "Liều thuốc",
  prompt_leak: "Lộ prompt",
};

function agentName(a: string) {
  return AGENTS[a as AgentKey]?.name || (a === "guard" ? "Safety Guard" : a);
}

function StatusBadge({ t }: { t: Pick<TraceBrief, "status" | "guard"> }) {
  if (t.status === "blocked") return <Badge color="var(--color-warn)">Chặn · {GUARD_LABEL[t.guard || ""] || t.guard}</Badge>;
  if (t.status === "error") return <Badge color="var(--color-danger)">Lỗi</Badge>;
  return <Badge color="#10b981">OK</Badge>;
}

function spanLabel(s: Span) {
  if (s.kind === "llm") return `LLM ${s.name === "stream" ? "" : `(${s.name}) `}· ${s.model || ""}`;
  if (s.kind === "tool") return TOOL_LABELS[s.name] || s.name;
  if (s.kind === "agent") return agentName(s.name);
  if (s.kind === "guard") return s.name === "input" ? "Safety Guard (đầu vào)" : "Guard đầu ra";
  if (s.kind === "router") return "Router";
  if (s.kind === "rag") return "RAG · tìm kiến thức";
  return s.name;
}

function spanDetail(s: Span) {
  const bits: string[] = [];
  if (s.kind === "llm") {
    if (s.provider) bits.push(s.provider === "primary" ? "nhà cung cấp chính" : "dự phòng");
    if (s.ttft_ms != null) bits.push(`chữ đầu ${sec(s.ttft_ms)}`);
    if (s.tokens_in || s.tokens_out) bits.push(`${s.tokens_in || 0}→${s.tokens_out || 0} token`);
    if (s.fallbacks) bits.push(`chuyển dự phòng ${s.fallbacks} lần`);
    if (s.tool_calls?.length) bits.push(`gọi: ${s.tool_calls.join(", ")}`);
  }
  if (s.kind === "guard" && s.name === "input") bits.push(`${s.level}${s.guard_kind ? ` · ${GUARD_LABEL[s.guard_kind] || s.guard_kind}` : ""}${s.method === "llm" ? " · LLM phân loại" : ""}`);
  if (s.kind === "guard" && s.flags?.length) bits.push(s.flags.map((f) => FLAG_LABEL[f] || f).join(", "));
  if (s.kind === "router" && s.agents) bits.push(`${s.agents.map(agentName).join(" + ")} · ${s.method}`);
  if (s.kind === "rag") bits.push(`${s.method} · ${s.hits?.join(", ") || "không có"}`);
  if (s.kind === "tool" && s.args && s.args !== "{}") bits.push(s.args);
  return bits.join(" · ");
}

function Waterfall({ spans, total }: { spans: Span[]; total: number }) {
  const max = Math.max(total, ...spans.map((s) => s.start_ms + s.ms), 1);
  const rows = spans.filter((s) => s.kind !== "agent" || s.ms > 0);
  return (
    <div className="space-y-1.5">
      {rows.map((s, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)] gap-1 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center sm:gap-3">
          <div className={clsx("min-w-0 text-xs", s.kind === "agent" ? "font-semibold" : s.kind === "llm" || s.kind === "tool" || s.kind === "rag" ? "sm:pl-3" : "")}>
            <div className="flex items-center gap-1.5 truncate">
              {s.error && <AlertTriangle size={12} className="shrink-0 text-danger" />}
              <span className="truncate">{spanLabel(s)}</span>
            </div>
            {spanDetail(s) && <div className="truncate text-[11px] text-muted">{spanDetail(s)}</div>}
            {s.error && <div className="truncate text-[11px] text-danger">{s.error}</div>}
          </div>
          <div className="relative h-5 rounded bg-surface-2">
            <div
              className="absolute top-0.5 bottom-0.5 rounded"
              style={{
                left: `${(s.start_ms / max) * 100}%`,
                width: `max(3px, ${(s.ms / max) * 100}%)`,
                background: KIND_COLOR[s.kind],
                opacity: s.kind === "agent" ? 0.6 : 0.9,
              }}
            />
            <span className="absolute right-1.5 top-0.5 text-[11px] text-muted">{sec(s.ms)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: t, isLoading, error } = useApi<TraceDetail>(["trace", id], `/api/traces/${id}`);
  if (isLoading) return <Spinner />;
  if (error || !t) return <Empty title="Không tìm thấy trace" action={<Button onClick={onBack}>Quay lại</Button>} />;
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft size={14} /> Tất cả lượt chat
      </Button>
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {t.sample && <Badge>Dữ liệu mẫu · số đo minh hoạ</Badge>}
          <StatusBadge t={t} /> {time(t.created_at)} · {t.agents.map(agentName).join(" + ") || "—"} · route: {t.route_method || "—"}
        </div>
        <p className="mt-2 text-[15px] font-medium">{t.question}</p>
        {t.error && <p className="mt-2 text-sm text-danger">{t.error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-muted">Tổng thời gian</p><p className="font-semibold">{sec(t.total_ms)}</p></div>
          <div><p className="text-xs text-muted">Tới chữ đầu tiên</p><p className="font-semibold">{sec(t.ttft_ms)}</p></div>
          <div><p className="text-xs text-muted">LLM / công cụ</p><p className="font-semibold">{t.llm_calls} / {t.tool_calls}{t.tool_errors ? ` (${t.tool_errors} lỗi)` : ""}</p></div>
          <div><p className="text-xs text-muted">Token vào → ra</p><p className="font-semibold">{t.tokens_in.toLocaleString("vi-VN")} → {t.tokens_out.toLocaleString("vi-VN")}</p></div>
        </div>
        {!!t.output_flags?.length && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-warn-strong">
            <ShieldCheck size={13} /> Guard đầu ra đã thêm lưu ý: {t.output_flags.map((f) => FLAG_LABEL[f.kind] || f.kind).join(", ")}
          </p>
        )}
      </Card>
      <Card>
        <CardHeader title="Dòng thời gian xử lý" subtitle="Mỗi thanh là một bước; độ dài = thời gian chạy" icon={<Activity size={16} />} />
        <div className="mb-3 flex flex-wrap gap-3 px-5 text-[11px] text-muted">
          {(["guard", "router", "llm", "tool", "rag"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: KIND_COLOR[k] }} /> {k === "llm" ? "Gọi model" : k === "tool" ? "Công cụ" : k === "rag" ? "RAG" : k === "guard" ? "An toàn" : "Router"}
            </span>
          ))}
        </div>
        <div className="px-5 pb-5">
          <Waterfall spans={t.spans} total={t.total_ms} />
        </div>
      </Card>
    </div>
  );
}

function Overview({ onOpen }: { onOpen: (id: string) => void }) {
  const [params, setParams] = useSearchParams();
  const days = params.get("days") || "7";
  const { data: st } = useApi<Stats>(["trace-stats", days], `/api/traces/stats?days=${days}`);
  const { data: list, isLoading } = useApi<{ items: TraceBrief[] }>(["traces"], "/api/traces?limit=60");
  const topModels = useMemo(() => Object.entries(st?.llm.by_model || {}).slice(0, 4), [st]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Segmented size="sm" value={days} onChange={(v) => setParams({ days: v })} options={[{ value: "1", label: "24 giờ" }, { value: "7", label: "7 ngày" }, { value: "30", label: "30 ngày" }]} />
      </div>
      {st && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Lượt chat" value={st.count} icon={<Activity size={16} />} sub={`${st.blocked} bị Safety Guard chặn`} />
          <Stat label="Độ trễ p50 / p95" value={sec(st.latency.p50)} icon={<Clock size={16} />} sub={`p95 ${sec(st.latency.p95)} · chữ đầu p50 ${sec(st.ttft.p50)}`} />
          <Stat label="Tỉ lệ lỗi" value={`${Math.round(st.error_rate * 100)}%`} icon={<AlertTriangle size={16} />} sub={`${st.llm.fallbacks} lần chuyển model dự phòng`} />
          <Stat label="Token vào / ra" value={(st.tokens.in + st.tokens.out).toLocaleString("vi-VN")} icon={<Cpu size={16} />} sub={`${st.tokens.in.toLocaleString("vi-VN")} / ${st.tokens.out.toLocaleString("vi-VN")}`} />
        </div>
      )}
      {st && st.count > 0 && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader title="Model & agent" icon={<Zap size={16} />} />
            <ul className="space-y-1 px-5 pb-5 text-sm">
              {topModels.map(([m, n]) => (
                <li key={m} className="flex justify-between gap-2"><span className="truncate text-muted">{m}</span><b>{n}</b></li>
              ))}
              {Object.entries(st.agents).map(([a, n]) => (
                <li key={a} className="flex justify-between"><span className="text-muted">{agentName(a)}</span><b>{n}</b></li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Công cụ hay dùng" icon={<Wrench size={16} />} />
            <ul className="space-y-1 px-5 pb-5 text-sm">
              {st.tools.slice(0, 7).map((t) => (
                <li key={t.name} className="flex justify-between gap-2">
                  <span className="truncate text-muted">{TOOL_LABELS[t.name] || t.name}</span>
                  <span>{t.calls} · {sec(t.p50_ms)}{t.errors ? <span className="text-danger"> · {t.errors} lỗi</span> : null}</span>
                </li>
              ))}
              {!st.tools.length && <li className="text-muted">Chưa có</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="An toàn & RAG" icon={<ShieldCheck size={16} />} />
            <ul className="space-y-1 px-5 pb-5 text-sm">
              {Object.entries(st.guard).map(([k, n]) => (
                <li key={k} className="flex justify-between"><span className="text-muted">{GUARD_LABEL[k] || k}</span><b>{n}</b></li>
              ))}
              {Object.entries(st.output_flags).map(([k, n]) => (
                <li key={k} className="flex justify-between"><span className="text-muted">Đầu ra: {FLAG_LABEL[k] || k}</span><b>{n}</b></li>
              ))}
              {Object.entries(st.rag).map(([k, n]) => (
                <li key={k} className="flex justify-between"><span className="flex items-center gap-1 text-muted"><BookOpen size={12} /> RAG {k}</span><b>{n}</b></li>
              ))}
              {!Object.keys(st.guard).length && !Object.keys(st.output_flags).length && !Object.keys(st.rag).length && <li className="text-muted">Chưa có sự kiện</li>}
            </ul>
          </Card>
        </div>
      )}
      <Card>
        <CardHeader title="Các lượt gần đây" icon={<Gauge size={16} />} />
        {isLoading ? (
          <Spinner />
        ) : !list?.items.length ? (
          <Empty title="Chưa có lượt chat nào" text="Hỏi Trợ lý AI một câu, rồi quay lại đây để xem hệ thống đã xử lý thế nào." />
        ) : (
          <ul className="divide-y divide-border">
            {list.items.map((t) => (
              <li key={t.id}>
                <button onClick={() => onOpen(t.id)} className="flex w-full flex-col gap-1 px-5 py-3 text-left transition hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.question || "(ảnh)"}</p>
                    <p className="truncate text-xs text-muted">
                      {time(t.created_at)} · {t.agents.map(agentName).join(" + ") || "—"} · {t.llm_calls} LLM · {t.tool_calls} công cụ{t.rag ? ` · RAG ${t.rag}` : ""}
                      {t.output_flags.length ? " · có lưu ý an toàn" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {t.sample && <Badge>Mẫu</Badge>}
                    <StatusBadge t={t} />
                    <span className="w-14 text-right text-sm tabular-nums">{sec(t.total_ms)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function AiLog() {
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader lead="Nhật ký AI," title="mỗi lượt xử lý" subtitle="Observability: mỗi câu hỏi đã đi qua Safety Guard, Router, agent, model và công cụ nào, mất bao lâu" />
      {id ? <Detail id={id} onBack={() => setParams({})} /> : <Overview onOpen={(tid) => setParams({ id: tid })} />}
    </div>
  );
}
