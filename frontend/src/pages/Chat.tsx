import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import { MessageSquarePlus, PanelLeft, Pencil, Trash2 } from "lucide-react";
import { del, api } from "../lib/api";
import { useApi, useInvalidateAll } from "../lib/hooks";
import { AGENTS } from "../lib/constants";
import { timeAgo } from "../lib/format";
import type { AgentKey, Conversation } from "../lib/types";
import { ChatView } from "../components/chat/ChatView";
import { AgentAvatar } from "../components/AgentAvatar";
import { confirmDialog, promptDialog } from "../components/ui";

const STARTERS: [string, AgentKey][] = [
  ["Hôm nay mình muốn tập tay, gợi ý bài cho mình", "coachbro"],
  ["Lên lịch tập cả tuần cho mình", "coachbro"],
  ["Trưa nay mình ăn 1 tô bún bò Huế, ghi lại giúp mình", "nutribro"],
  ["Lên thực đơn món Việt cho cả ngày hôm nay", "nutribro"],
  ["Giúp mình đặt mục tiêu giảm mỡ cụ thể", "headbro"],
  ["Muốn tăng cơ thì nên tập và ăn thế nào?", "headbro"],
];

function Welcome({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="py-6 text-center sm:py-12">
      <div className="mx-auto flex w-fit -space-x-2">
        <AgentAvatar agent="headbro" size={52} />
      </div>
      <h2 className="mt-4 text-2xl font-bold">HeadBro sẵn sàng</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">
        Hỏi gì cũng được: tập luyện, ăn uống, tiến độ. HeadBro tự nhờ chuyên gia phía sau xử lý và đọc dữ liệu thật của bạn.
      </p>
      <div className="mx-auto mt-6 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
        {(["headbro", "coachbro", "nutribro"] as AgentKey[]).map((a) => (
          <div key={a} className="card p-3.5">
            <p className="font-semibold">{a === "headbro" ? "Tổng quan & mục tiêu" : a === "coachbro" ? "Tập luyện" : "Dinh dưỡng"}</p>
            <p className="mt-1 text-xs text-muted">{AGENTS[a].domain}</p>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-5 grid max-w-2xl gap-2 text-left sm:grid-cols-2">
        {STARTERS.map(([t, a]) => (
          <button key={t} onClick={() => onPick(t)} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm hover:border-primary/60">
            <span className="text-muted" aria-hidden>{a === "coachbro" ? "🏋️" : a === "nutribro" ? "🥗" : "🎯"}</span>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Chat() {
  const { id } = useParams();
  const nav = useNavigate();
  const [side, setSide] = useState(false);
  const [pick, setPick] = useState<{ text: string; autoSend: boolean } | null>(null);
  // Cuộc trò chuyện vừa được tạo từ khung "mới": đổi URL nhưng GIỮ khung chat đang stream (không dựng lại)
  const created = useRef<string | null>(null);
  const viewKey = id && id === created.current ? "new" : id || "new";
  if (!id) created.current = null;
  const { data: convs } = useApi<Conversation[]>(["conversations"], "/api/chat/conversations");
  const invalidate = useInvalidateAll();

  const list = (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          onClick={() => {
            nav("/chat");
            setPick(null);
            setSide(false);
          }}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-medium hover:bg-surface-2"
        >
          <MessageSquarePlus size={17} /> Cuộc trò chuyện mới
        </button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {(convs || []).map((c) => (
          <div
            key={c.id}
            className={clsx("group flex items-center gap-1 rounded-lg pr-1 text-sm", c.id === id ? "bg-surface-3" : "hover:bg-surface-2")}
          >
            <button
              type="button"
              aria-current={c.id === id ? "page" : undefined}
              onClick={() => {
                nav(`/chat/${c.id}`);
                setSide(false);
              }}
              className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left"
            >
              <p className="truncate">{c.title}</p>
              <p className="text-[11px] text-muted">{timeAgo(c.updated_at)}</p>
            </button>
            <button
              type="button"
              aria-label={`Đổi tên "${c.title}"`}
              className="grid h-8 w-8 place-items-center rounded-md text-muted hover:text-text sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
              onClick={async () => {
                const t = await promptDialog({ title: "Đổi tên cuộc trò chuyện", initial: c.title, confirmLabel: "Lưu tên" });
                if (t) {
                  await api(`/api/chat/conversations/${c.id}`, { method: "PATCH", body: { title: t } });
                  invalidate();
                }
              }}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              aria-label={`Xoá "${c.title}"`}
              className="grid h-8 w-8 place-items-center rounded-md text-muted hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
              onClick={async () => {
                if (!(await confirmDialog({ title: `Xoá "${c.title}"?`, text: "Toàn bộ tin nhắn trong cuộc trò chuyện này sẽ mất.", confirmLabel: "Xoá cuộc trò chuyện", danger: true }))) return;
                await del(`/api/chat/conversations/${c.id}`);
                invalidate();
                if (c.id === id) nav("/chat");
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {convs && !convs.length && <p className="px-3 py-2 text-xs text-muted">Chưa có cuộc trò chuyện nào.</p>}
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-57px)] lg:h-dvh">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface-2/50 md:block">{list}</aside>
      {side && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setSide(false)}>
          <div className="h-full w-72 bg-surface" onClick={(e) => e.stopPropagation()}>
            {list}
          </div>
        </div>
      )}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 md:hidden">
          <button className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm text-muted hover:text-text" aria-label="Mở danh sách cuộc trò chuyện" onClick={() => setSide(true)}>
            <PanelLeft size={16} /> Cuộc trò chuyện
          </button>
          <button className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label="Cuộc trò chuyện mới" onClick={() => nav("/chat")}>
            <MessageSquarePlus size={17} />
          </button>
        </div>
        <ChatView
          key={viewKey}
          conversationId={id || null}
          onConversation={(cid) => {
            created.current = cid;
            nav(`/chat/${cid}`, { replace: true });
          }}
          page="chat"
          initial={pick}
          emptyState={<Welcome onPick={(t) => setPick({ text: t, autoSend: true })} />}
        />
      </div>
    </div>
  );
}
