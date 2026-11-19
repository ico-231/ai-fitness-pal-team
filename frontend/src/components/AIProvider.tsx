import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, Apple, Beef, CalendarDays, ClipboardList, Dumbbell, Maximize2, MessageSquarePlus, Moon, Scale, Target, TrendingUp, UtensilsCrossed, X, type LucideIcon } from "lucide-react";
import { AgentAvatar } from "./AgentAvatar";

import type { AgentKey } from "../lib/types";
import { Spinner } from "./ui";

// Khung chat (markdown, thẻ kết quả...) chỉ tải khi mở ngăn "Hỏi AI" lần đầu
const ChatView = lazy(() => import("./chat/ChatView").then((m) => ({ default: m.ChatView })));

interface OpenOpts {
  text?: string;
  agent?: AgentKey | "auto";
  context?: string;
  autoSend?: boolean; // mặc định true nếu có text
  /** true → mở trang Trợ lý AI đầy đủ (/chat) thay vì ngăn chat nổi */
  full?: boolean;
}

/** Dữ liệu chuyển sang trang /chat qua location.state */
export interface ChatHandoff {
  text: string;
  agent?: AgentKey | "auto";
  context?: string;
  autoSend: boolean;
  page: string;
}

const Ctx = createContext<{ open: (o?: OpenOpts) => void; close: () => void } | null>(null);

export function useAI() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAI outside provider");
  return c;
}

const PAGE_OF: Record<string, string> = {
  "/": "dashboard",
  "/workouts": "workouts",
  "/daily": "daily",
  "/nutrition": "nutrition",
  "/inbody": "inbody",
  "/guide": "guide",
  "/settings": "settings",
};

/** Ngăn chat nổi: bấm "Hỏi AI" ở bất kỳ trang nào → mở cuộc trò chuyện mới kèm ngữ cảnh của trang đó. */
export function AIProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [conv, setConv] = useState<string | null>(null);
  const [initial, setInitial] = useState<{ text: string; agent?: string; autoSend?: boolean } | null>(null);
  const [context, setContext] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);
  const loc = useLocation();
  const nav = useNavigate();
  const page = PAGE_OF[loc.pathname] || loc.pathname.split("/")[1] || "dashboard";

  const open = useCallback((o: OpenOpts = {}) => {
    if (o.full) {
      setOpen(false);
      const state: ChatHandoff | null = o.text ? { text: o.text, agent: o.agent, context: o.context, autoSend: o.autoSend !== false, page } : null;
      nav("/chat", { state });
      return;
    }
    if (o.text || o.context) {
      setConv(null); // ngữ cảnh mới → cuộc trò chuyện mới
      setNonce((n) => n + 1);
      setInitial(o.text ? { text: o.text, agent: o.agent, autoSend: o.autoSend !== false } : o.agent ? { text: "", agent: o.agent } : null);
      setContext(o.context);
    }
    setOpen(true);
  }, [nav, page]);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, close }), [open, close]);

  const onChatPage = loc.pathname.startsWith("/chat");

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Nút nổi chỉ có trên desktop. Điện thoại: nút nổi che ô chọn mức check-in, ô nhập nước, thẻ macro...
          → thay bằng nút "Hỏi AI" trên thanh trên (Layout), mở cùng ngăn chat theo ngữ cảnh trang. */}
      {!onChatPage && !isOpen && loc.pathname !== "/" && loc.pathname !== "/report" && !(loc.pathname === "/workouts" && loc.search.includes("tab=activity")) &&!loc.pathname.startsWith("/workouts/session") && !loc.pathname.startsWith("/workouts/camera") && (
        <button
          onClick={() => open()}
          aria-label="Hỏi trợ lý AI"
          title="Hỏi trợ lý AI"
          className="no-print group fixed bottom-8 right-8 z-40 hidden rounded-full transition duration-200 hover:-translate-y-0.5 hover:scale-105 active:scale-95 lg:block"
          style={{ boxShadow: "0 16px 22px -10px rgb(0 0 0 / 0.6), 0 3px 6px -1px rgb(0 0 0 / 0.35)" }}
        >
          {/* Hiệu ứng khối cầu (nét): ảnh phẳng + bóng tối mép dưới + vệt phản chiếu sắc cạnh phía trên + viền sáng mảnh */}
          <span className="relative block h-[60px] w-[60px] overflow-hidden rounded-full">
            <img src="/ai-avatar.png?v=6" alt="" width={60} height={60} className="h-full w-full" />
            <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle at 50% 35%, transparent 52%, rgb(0 0 0 / 0.55) 100%)",
                boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.14), inset 0 1.5px 0 rgb(255 255 255 / 0.35), inset 0 -3px 5px rgb(0 0 0 / 0.55)",
              }} />
            {/* vệt phản chiếu: elip mảnh, mép rõ, mờ dần xuống dưới */}
            <span aria-hidden className="pointer-events-none absolute left-1/2 top-[5%] h-[34%] w-[66%] -translate-x-1/2 rounded-[50%]"
              style={{ background: "linear-gradient(180deg, rgb(255 255 255 / 0.42) 0%, rgb(255 255 255 / 0.06) 85%, transparent 100%)" }} />
          </span>
        </button>
      )}
      {isOpen && !onChatPage && (
        <div className="no-print fixed inset-0 z-50 flex justify-end bg-black/30 lg:bg-transparent" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Trợ lý HeadBro"
            className="glass sheet-in flex h-full w-full flex-col overflow-hidden pt-[env(safe-area-inset-top)] [background:color-mix(in_srgb,var(--surface)_96%,transparent)] sm:m-3 sm:h-[calc(100%-1.5rem)] sm:w-[440px] sm:rounded-[28px] sm:pt-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1 border-b border-border py-2 pl-3 pr-1.5 sm:gap-2 sm:pr-3">
              <AgentAvatar agent="headbro" size={30} />
              <div className="ml-1 min-w-0 flex-1">
                <p className="text-sm font-semibold">HeadBro</p>
                <p className="truncate text-[11px] text-muted">Trợ lý FitBro · đang ở trang {page}</p>
              </div>
              <button className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 pointer-coarse:h-11 pointer-coarse:w-11" title="Cuộc trò chuyện mới" aria-label="Cuộc trò chuyện mới" onClick={() => { setConv(null); setInitial(null); setContext(undefined); setNonce((n) => n + 1); }}>
                <MessageSquarePlus size={17} />
              </button>
              <button className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 pointer-coarse:h-11 pointer-coarse:w-11" title="Mở toàn màn hình" aria-label="Mở toàn màn hình" onClick={() => { close(); nav(conv ? `/chat/${conv}` : "/chat"); }}>
                <Maximize2 size={16} />
              </button>
              <button className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 pointer-coarse:h-11 pointer-coarse:w-11" aria-label="Đóng" onClick={close}>
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 pb-[env(safe-area-inset-bottom)] sm:pb-0">
              <Suspense fallback={<Spinner />}>
              <ChatView
                key={nonce}
                compact
                conversationId={conv}
                onConversation={setConv}
                page={page}
                pageContext={context}
                initial={initial}
                onInitialSent={() => setInitial(null)}
                emptyState={<DrawerEmpty page={page} onPick={(t) => setInitial({ text: t, autoSend: true })} />}
              />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

// Gợi ý câu hỏi trong khung chat nổi: mỗi câu có icon theo chủ đề (không lặp avatar HeadBro ở mọi dòng)
const SUGGEST: Record<string, [string, AgentKey, LucideIcon][]> = {
  dashboard: [["Tuần này mình làm tốt và chưa tốt điều gì?", "headbro", TrendingUp], ["Nhóm cơ nào mình đang tập ít?", "coachbro", Dumbbell], ["Hôm nay mình còn thiếu bao nhiêu đạm?", "nutribro", Beef]],
  workouts: [["Hôm nay mình muốn tập tay", "coachbro", Dumbbell], ["Lên lịch tập cả tuần cho mình", "coachbro", CalendarDays], ["Mình nên tăng tạ squat thế nào?", "coachbro", TrendingUp]],
  daily: [["Với điểm sẵn sàng hôm nay mình nên tập gì?", "coachbro", Activity], ["Làm sao để ngủ ngon và hồi phục tốt hơn?", "headbro", Moon]],
  nutrition: [["Lên thực đơn các bữa còn lại hôm nay", "nutribro", ClipboardList], ["Trưa nay mình ăn 1 đĩa cơm tấm sườn", "nutribro", UtensilsCrossed], ["Ăn gì trước buổi tập?", "nutribro", Apple]],
  inbody: [["Giúp mình đặt mục tiêu cụ thể", "headbro", Target], ["Giải thích chỉ số InBody của mình", "headbro", Scale]],
};

function DrawerEmpty({ page, onPick }: { page: string; onPick: (t: string, a: AgentKey) => void }) {
  const list = SUGGEST[page] || SUGGEST.dashboard;
  return (
    <div className="py-6 text-center">
      <p className="text-lg font-semibold tracking-[-0.02em]">Hỏi HeadBro bất cứ điều gì</p>
      <p className="mt-1 text-xs text-muted">Tập luyện, ăn uống, cơ thể — hỏi gì cũng được, ở trang nào cũng được.</p>
      <div className="mt-4 space-y-2 text-left">
        {list.map(([t, a, Icon]) => (
          <button key={t} onClick={() => onPick(t, a)} className="flex w-full items-center gap-2.5 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-sm transition hover:bg-surface-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-strong"><Icon size={15} strokeWidth={2.2} /></span>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
