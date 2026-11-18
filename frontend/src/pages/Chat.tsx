import { MobileMenuButton } from "../components/MobileMenu";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import { CalendarDays, ChevronDown, Dumbbell, History, MessageSquarePlus, Pencil, Salad, Search, Target, Trash2, TrendingUp } from "lucide-react";
import { del, api } from "../lib/api";
import { useApi, useInvalidateAll } from "../lib/hooks";
import { greeting, timeAgo } from "../lib/format";
import { useAuth } from "../lib/auth";
import type { AgentKey, Conversation } from "../lib/types";
import { ChatView } from "../components/chat/ChatView";
import { AgentAvatar } from "../components/AgentAvatar";
import { confirmDialog, HelpButton, promptDialog } from "../components/ui";
import type { ChatHandoff } from "../components/AIProvider";

// Gợi ý dưới ô nhập: nhãn ngắn (hiện trên viên) + câu đầy đủ (gửi đi), nhóm theo chuyên gia
const STARTERS: { label: string; text: string; agent: AgentKey; icon: typeof Dumbbell }[] = [
  { label: "Gợi ý bài tập tay", text: "Hôm nay mình muốn tập tay, gợi ý bài cho mình", agent: "coachbro", icon: Dumbbell },
  { label: "Lên lịch tập tuần", text: "Lên lịch tập cả tuần cho mình", agent: "coachbro", icon: CalendarDays },
  { label: "Ghi bữa ăn", text: "Trưa nay mình ăn 1 tô bún bò Huế, ghi lại giúp mình", agent: "nutribro", icon: Salad },
  { label: "Đặt mục tiêu", text: "Giúp mình đặt mục tiêu giảm mỡ cụ thể", agent: "headbro", icon: Target },
  { label: "Tuần này thế nào?", text: "Tuần này mình tập và ăn uống thế nào, cần cải thiện gì?", agent: "headbro", icon: TrendingUp },
];

function Welcome({ composer, onPick }: { composer: ReactNode; onPick: (t: string) => void }) {
  const { user } = useAuth();
  const first = (user?.name || "").trim().split(/\s+/).pop();
  return (
    <div className="flex flex-col items-center">
      <h1 className="flex items-center gap-3 text-center text-[28px] font-semibold leading-tight tracking-[-0.03em] sm:text-[38px]">
        <AgentAvatar agent="headbro" size={38} />
        <span>
          <span className="font-light text-muted">{greeting()}{first ? `, ${first}` : ""}.</span> Hôm nay tập gì?
        </span>
      </h1>
      <p className="mt-2 max-w-lg text-center text-sm text-muted">
        HeadBro tự gọi chuyên gia tập luyện hoặc dinh dưỡng và trả lời theo dữ liệu thật của bạn.
      </p>
      <div className="mt-7 w-full">{composer}</div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {STARTERS.map(({ label, text, icon: I }) => (
          <button key={label} type="button" onClick={() => onPick(text)} title={text}
            className="flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-surface px-3.5 py-2 text-[13px] font-medium text-muted transition hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:text-text">
            <I size={14} /> {label}
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
  const ask = (text: string) => setPick({ text, autoSend: true });

  return (
    // Trang Trợ lý AI chỉ còn khung chat (theo góp ý: bỏ các khối chỉ số hai bên cho gọn, tập trung vào hội thoại)
    <div className="flex h-[calc(100dvh/var(--z)-env(safe-area-inset-top)-var(--bottombar-h))] flex-col lg:h-screen-z lg:pr-2">
      <section className="relative flex min-h-0 w-full flex-1 flex-col">
        <header className="flex items-center gap-2 px-3 py-3 sm:px-5">
          <div className="mr-auto flex min-w-0 items-center gap-2">
            <AgentAvatar agent="headbro" size={28} />
            <p className="truncate text-[15px] font-semibold">HeadBro</p>
          </div>
          <HelpButton to="headbro" className="!h-9 !w-9 !bg-transparent" />
          <HistoryButton current={id} />
          <button type="button" onClick={() => { nav("/chat"); setPick(null); setHandoffCtx(undefined); }} aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới"
            className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-3.5 text-sm font-medium text-on-ink transition hover:opacity-90">
            <MessageSquarePlus size={15} /> <span className="hidden sm:inline">Mới</span>
          </button>
          {/* Điện thoại: avatar bung menu nhỏ (InBody, Hướng dẫn, Cài đặt...) như các trang khác */}
          <MobileMenuButton className="ml-1" />
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
          hero={(composer) => <Welcome composer={composer} onPick={ask} />}
        />
      </section>

    </div>
  );
}
