import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import { ChevronDown, Dumbbell, History, MessageSquarePlus, Pencil, Salad, Search, Sparkles, Target, Trash2 } from "lucide-react";
import { del, api } from "../lib/api";
import { useApi, useInvalidateAll } from "../lib/hooks";
import { AGENTS } from "../lib/constants";
import { timeAgo } from "../lib/format";
import type { AgentKey, Conversation } from "../lib/types";
import { ChatView } from "../components/chat/ChatView";
import { AgentAvatar } from "../components/AgentAvatar";
import { MuscleMini, PRCard, ReadinessCard, SuggestCard, TodayRings, WeekDots, useOverview } from "../components/Widgets";
import { confirmDialog, HelpButton, promptDialog } from "../components/ui";
import type { ChatHandoff } from "../components/AIProvider";

const STARTERS: [string, AgentKey][] = [
  ["Hôm nay mình muốn tập tay, gợi ý bài cho mình", "coachbro"],
  ["Lên lịch tập cả tuần cho mình", "coachbro"],
  ["Trưa nay mình ăn 1 tô bún bò Huế, ghi lại giúp mình", "nutribro"],
  ["Lên thực đơn món Việt cho cả ngày hôm nay", "nutribro"],
  ["Giúp mình đặt mục tiêu giảm mỡ cụ thể", "headbro"],
  ["Muốn tăng cơ thì nên tập và ăn thế nào?", "headbro"],
];

function Welcome({ onPick }: { onPick: (t: string) => void }) {
  const areas: { k: AgentKey; title: string; icon: typeof Dumbbell }[] = [
    { k: "headbro", title: "Tổng quan & mục tiêu", icon: Target },
    { k: "coachbro", title: "Tập luyện", icon: Dumbbell },
    { k: "nutribro", title: "Dinh dưỡng", icon: Salad },
  ];
  return (
    <div className="pb-4 pt-6 text-center sm:pt-10">
      <h2 className="text-[28px] font-bold leading-tight tracking-[-0.035em] sm:text-[36px]">
        <span className="font-light text-muted">Hôm nay</span> HeadBro
        <br />
        giúp gì cho bạn?
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        Hỏi gì cũng được: tập luyện, ăn uống, tiến độ. HeadBro tự điều phối chuyên gia phía sau và trả lời dựa trên dữ liệu của bạn.
      </p>
      <div className="mx-auto mt-6 grid max-w-xl gap-2.5 text-left sm:grid-cols-3">
        {areas.map(({ k, title, icon: I }) => (
          <div key={k} className="rounded-[20px] bg-[var(--glass-fill)] p-3.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-volt text-on-volt"><I size={15} /></span>
            <p className="mt-2.5 text-sm font-semibold">{title}</p>
            <p className="mt-0.5 text-[11px] text-muted">{AGENTS[k].domain}</p>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-4 flex max-w-xl flex-wrap justify-center gap-2">
        {STARTERS.map(([t]) => (
          <button key={t} onClick={() => onPick(t)} className="flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[13px] font-medium shadow-[var(--shadow)] transition hover:-translate-y-0.5">
            <Sparkles size={13} className="text-muted" /> {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Nút "Lịch sử" ở góc trên khung chat: bấm mở danh sách hội thoại (tìm, chọn, đổi tên, xoá). */
function HistoryButton({ current }: { current?: string }) {
  const nav = useNavigate();
  const invalidate = useInvalidateAll();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data: convs } = useApi<Conversation[]>(["conversations"], "/api/chat/conversations");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const list = (convs || []).filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Lịch sử trò chuyện"
        className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--glass-fill)] px-3 text-sm font-medium transition hover:bg-surface-3 sm:px-3.5">
        <History size={15} /> <span className="hidden sm:inline">Lịch sử</span>
        {convs && <span className="num rounded-full bg-surface px-1.5 text-[11px] text-muted">{convs.length}</span>}
        <ChevronDown size={14} className={clsx("text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="fade-in absolute right-0 top-[calc(100%+8px)] z-50 flex max-h-[60vh] w-[min(360px,calc(100vw-2rem))] flex-col rounded-[22px] border border-[var(--card-border)] bg-surface p-2 shadow-[var(--shadow-lg)]">
            <div className="relative mb-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm cuộc trò chuyện..." aria-label="Tìm cuộc trò chuyện"
                className="w-full rounded-full bg-surface-2 py-2 pl-8 pr-3 text-sm outline-none" />
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
              {list.map((c) => (
                <div key={c.id} className={clsx("group flex items-center gap-1 rounded-2xl pr-1 text-sm", c.id === current ? "bg-surface-2 font-medium" : "hover:bg-surface-2")}>
                  <button type="button" aria-current={c.id === current ? "page" : undefined}
                    onClick={() => { nav(`/chat/${c.id}`); setOpen(false); }} className="min-w-0 flex-1 px-3 py-2 text-left">
                    <p className="truncate">{c.title}</p>
                    <p className="text-[11px] text-muted">{timeAgo(c.updated_at)}</p>
                  </button>
                  <button type="button" aria-label={`Đổi tên "${c.title}"`}
                    className="grid h-8 w-8 place-items-center rounded-full text-muted hover:text-text sm:hidden sm:group-hover:grid sm:group-focus-within:grid [@media(hover:none)]:grid"
                    onClick={async () => {
                      const t = await promptDialog({ title: "Đổi tên cuộc trò chuyện", initial: c.title, confirmLabel: "Lưu tên" });
                      if (t) {
                        await api(`/api/chat/conversations/${c.id}`, { method: "PATCH", body: { title: t } });
                        invalidate();
                      }
                    }}>
                    <Pencil size={14} />
                  </button>
                  <button type="button" aria-label={`Xoá "${c.title}"`}
                    className="grid h-8 w-8 place-items-center rounded-full text-muted hover:text-danger sm:hidden sm:group-hover:grid sm:group-focus-within:grid [@media(hover:none)]:grid"
                    onClick={async () => {
                      if (!(await confirmDialog({ title: `Xoá "${c.title}"?`, text: "Toàn bộ tin nhắn trong cuộc trò chuyện này sẽ mất.", confirmLabel: "Xoá cuộc trò chuyện", danger: true }))) return;
                      await del(`/api/chat/conversations/${c.id}`);
                      invalidate();
                      if (c.id === current) nav("/chat");
                    }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {convs && !list.length && <p className="px-3 py-3 text-xs text-muted">{q ? "Không tìm thấy." : "Chưa có cuộc trò chuyện nào."}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Chat() {
  const { id } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const [pick, setPick] = useState<{ text: string; agent?: string; autoSend: boolean } | null>(null);
  const [handoffCtx, setHandoffCtx] = useState<string | undefined>();
  // Câu hỏi chuyển từ trang khác (vd. ô "Hỏi HeadBro" ở Tổng quan): nhận 1 lần rồi xoá state để F5 / quay lại không gửi lại
  useEffect(() => {
    const h = loc.state as ChatHandoff | null;
    if (!h?.text) return;
    if (id) nav("/chat", { replace: true, state: h }); // luôn mở cuộc trò chuyện mới
    else {
      setPick({ text: h.text, agent: h.agent, autoSend: h.autoSend });
      setHandoffCtx(h.context);
      nav("/chat", { replace: true, state: null });
    }
  }, [loc.state, id, nav]);
  // Cuộc trò chuyện vừa được tạo từ khung "mới": đổi URL nhưng GIỮ khung chat đang stream (không dựng lại)
  const created = useRef<string | null>(null);
  const viewKey = id && id === created.current ? "new" : id || "new";
  if (!id) created.current = null;
  const { data: ov } = useOverview();
  const ask = (text: string) => setPick({ text, autoSend: true });

  return (
    <div className="flex h-[calc(100dvh/var(--z)-57px)] gap-5 p-2 sm:p-4 lg:h-screen-z lg:pl-0 lg:pr-5 xl:gap-6">
      {/* Cột trái: thông số hôm nay */}
      <aside className="rise hidden w-[280px] shrink-0 flex-col gap-5 overflow-y-auto pb-2 [scrollbar-width:none] xl:flex">
        {ov && (
          <>
            <ReadinessCard readiness={ov.today.readiness} streak={ov.today.streak.current} />
            <TodayRings t={ov.today} />
            <WeekDots streak={ov.today.streak.current} best={ov.today.streak.best} />
          </>
        )}
      </aside>

      {/* Giữa: khung chat */}
      <section className="card rise relative flex min-w-0 flex-1 flex-col overflow-hidden" style={{ animationDelay: "80ms" }}>
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <AgentAvatar agent="headbro" size={34} />
          <div className="mr-auto min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight">HeadBro</p>
            <p className="hidden truncate text-[11px] text-muted xl:block">Trợ lý chính FitBro · điều phối chuyên gia tập luyện & dinh dưỡng</p>
          </div>
          <HelpButton to="headbro" className="!h-9 !w-9 !bg-transparent" />
          <HistoryButton current={id} />
          <button type="button" onClick={() => { nav("/chat"); setPick(null); setHandoffCtx(undefined); }} aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới"
            className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-3.5 text-sm font-medium text-on-ink transition hover:opacity-90">
            <MessageSquarePlus size={15} /> <span className="hidden sm:inline">Mới</span>
          </button>
        </header>
        <ChatView
          key={viewKey}
          conversationId={id || null}
          onConversation={(cid) => {
            created.current = cid;
            nav(`/chat/${cid}`, { replace: true });
          }}
          page="chat"
          pageContext={handoffCtx}
          initial={pick}
          onInitialSent={() => setPick(null)}
          emptyState={<Welcome onPick={ask} />}
        />
      </section>

      {/* Cột phải: hình & chỉ số */}
      <aside className="rise hidden w-[300px] shrink-0 flex-col gap-5 overflow-y-auto pb-2 [scrollbar-width:none] lg:flex" style={{ animationDelay: "160ms" }}>
        <MuscleMini days={7} />
        {ov && <PRCard prs={ov.prs} limit={3} />}
        {ov && <SuggestCard insights={ov.insights || []} onPick={ask} />}
      </aside>
    </div>
  );
}
