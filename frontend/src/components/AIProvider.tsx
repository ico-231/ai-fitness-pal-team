import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Maximize2, MessageSquarePlus, Sparkles, X } from "lucide-react";
import { ChatView } from "./chat/ChatView";
import { AgentAvatar } from "./AgentAvatar";

import type { AgentKey } from "../lib/types";

interface OpenOpts {
  text?: string;
  agent?: AgentKey | "auto";
  context?: string;
  autoSend?: boolean; // mặc định true nếu có text
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
    if (o.text || o.context) {
      setConv(null); // ngữ cảnh mới → cuộc trò chuyện mới
      setNonce((n) => n + 1);
      setInitial(o.text ? { text: o.text, agent: o.agent, autoSend: o.autoSend !== false } : o.agent ? { text: "", agent: o.agent } : null);
      setContext(o.context);
    }
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, close }), [open, close]);

  const onChatPage = loc.pathname.startsWith("/chat");

  return (
    <Ctx.Provider value={value}>
      {children}
      {!onChatPage && !isOpen && !loc.pathname.startsWith("/workouts/session") && !loc.pathname.startsWith("/workouts/camera") && (
        <button
          onClick={() => open()}
          className="no-print fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-primary-strong px-4 py-3 text-sm font-semibold text-on-primary shadow-xl transition hover:scale-105 lg:bottom-6 lg:right-6"
        >
          <Sparkles size={18} /> Hỏi AI
        </button>
      )}
      {isOpen && !onChatPage && (
        <div className="no-print fixed inset-0 z-50 flex justify-end bg-black/30 lg:bg-transparent" onClick={close}>
          <div
            className="fade-in flex h-full w-full flex-col border-l border-border bg-surface shadow-2xl sm:w-[440px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <AgentAvatar agent="headbro" size={30} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">HeadBro</p>
                <p className="truncate text-[11px] text-muted">Trợ lý FitBro · đang ở trang {page}</p>
              </div>
              <button className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2" title="Cuộc trò chuyện mới" onClick={() => { setConv(null); setInitial(null); setContext(undefined); setNonce((n) => n + 1); }}>
                <MessageSquarePlus size={17} />
              </button>
              <button className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2" title="Mở toàn màn hình" onClick={() => { close(); nav(conv ? `/chat/${conv}` : "/chat"); }}>
                <Maximize2 size={16} />
              </button>
              <button className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2" onClick={close}>
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ChatView
                key={nonce}
                compact
                conversationId={conv}
                onConversation={setConv}
                page={page}
                pageContext={context}
                initial={initial}
                emptyState={<DrawerEmpty page={page} onPick={(t, a) => setInitial({ text: t, agent: a, autoSend: true })} />}
              />
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

const SUGGEST: Record<string, [string, AgentKey][]> = {
  dashboard: [["Tuần này mình làm tốt và chưa tốt điều gì?", "headbro"], ["Nhóm cơ nào mình đang tập ít?", "coachbro"], ["Hôm nay mình còn thiếu bao nhiêu đạm?", "nutribro"]],
  workouts: [["Hôm nay mình muốn tập tay", "coachbro"], ["Lên lịch tập cả tuần cho mình", "coachbro"], ["Mình nên tăng tạ squat thế nào?", "coachbro"]],
  daily: [["Với điểm sẵn sàng hôm nay mình nên tập gì?", "coachbro"], ["Làm sao để ngủ ngon và hồi phục tốt hơn?", "headbro"]],
  nutrition: [["Lên thực đơn các bữa còn lại hôm nay", "nutribro"], ["Trưa nay mình ăn 1 đĩa cơm tấm sườn", "nutribro"], ["Ăn gì trước buổi tập?", "nutribro"]],
  inbody: [["Giúp mình đặt mục tiêu cụ thể", "headbro"], ["Giải thích chỉ số InBody của mình", "headbro"]],
};

function DrawerEmpty({ page, onPick }: { page: string; onPick: (t: string, a: AgentKey) => void }) {
  const list = SUGGEST[page] || SUGGEST.dashboard;
  return (
    <div className="py-6 text-center">
      <p className="text-sm font-semibold">Hỏi đội FitBro bất cứ điều gì</p>
      <p className="mt-1 text-xs text-muted">Router sẽ chuyển câu hỏi cho đúng chuyên gia.</p>
      <div className="mt-4 space-y-2 text-left">
        {list.map(([t, a]) => (
          <button key={t} onClick={() => onPick(t, a)} className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm hover:border-primary/60">
            <AgentAvatar agent={a} size={24} />
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
