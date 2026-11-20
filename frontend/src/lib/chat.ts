import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiUrl, get, tokenStore } from "./api";
import type { AgentKey, Card, ChatMessage, TraceItem } from "./types";

export interface SendOptions {
  text: string;
  image?: string | null;
  agent?: string; // "auto" | headbro | coachbro | nutribro
  page?: string;
  pageContext?: string;
  /** Tạo lại / sửa câu hỏi: id tin người dùng cần thay (tin đó và mọi tin sau nó bị thay bằng lượt mới) */
  replaceFrom?: string;
}

interface ServerMessage {
  id: string;
  role: "user" | "assistant";
  agent: AgentKey | null;
  content: string;
  created_at?: string;
  meta: { cards?: Card[]; trace?: TraceItem[]; image?: string; synthesis?: boolean; route?: string; error?: string; followups?: string[]; trace_id?: string; safety_flags?: string[] };
}

const toLocal = (m: ServerMessage): ChatMessage => ({
  id: m.id,
  role: m.role,
  agent: m.agent,
  content: m.content,
  cards: m.meta?.cards || [],
  trace: m.meta?.trace || [],
  image: m.meta?.image || null,
  synthesis: !!m.meta?.synthesis,
  route: m.meta?.route ? { agents: [m.agent || ""], reason: m.meta.route } : null,
  error: m.meta?.error || null,
  followups: m.meta?.followups || [],
  traceId: m.meta?.trace_id || null,
  safetyFlags: m.meta?.safety_flags || [],
});

let tmp = 0;
const tmpId = () => `tmp-${Date.now()}-${tmp++}`;

/**
 * Quản lý 1 cuộc trò chuyện: tải lịch sử + gửi tin nhắn và nhận sự kiện stream (SSE) từ orchestrator.
 * Mỗi sự kiện được vẽ ngay lên UI: router chọn ai → agent nào đang gõ → gọi tool gì → thẻ kết quả.
 */
export function useChat(conversationId: string | null, onConversation?: (id: string) => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ agents: string[]; reason: string; method?: string } | null>(null);
  const convRef = useRef<string | null>(conversationId);
  const skipLoad = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    convRef.current = conversationId;
    if (skipLoad.current) {
      skipLoad.current = false;
      return;
    }
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    let alive = true;
    let timer = 0;
    const url = `/api/chat/conversations/${conversationId}`;
    // Tin cuối là của người dùng = HeadBro còn đang trả lời ở nơi khác (vd. vừa bấm phóng to từ khung chat nhỏ khi đang gõ):
    // hiện "đang gõ" và hỏi lại máy chủ vài giây một lần tới khi câu trả lời được lưu (tối đa ~70 giây).
    const show = (list: ServerMessage[], tries: number) => {
      const local = list.map(toLocal);
      const last = list[list.length - 1];
      const age = last?.created_at ? Date.now() - Date.parse(last.created_at) : Infinity;
      const waiting = last?.role === "user" && age < 75_000 && tries < 28; // chỉ chờ tin vừa gửi (lượt cũ bị lỗi thì thôi)
      setMessages(waiting ? [...local, { id: "waiting-reply", role: "assistant", agent: "headbro", content: "", cards: [], trace: [], streaming: true }] : local);
      if (waiting)
        timer = window.setTimeout(() => {
          get<{ messages: ServerMessage[] }>(url).then((d) => alive && show(d.messages, tries + 1)).catch(() => alive && show(list, tries + 1));
        }, 2500);
    };
    get<{ messages: ServerMessage[] }>(url)
      .then((d) => alive && show(d.messages, 0))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
    return () => { alive = false; window.clearTimeout(timer); };
  }, [conversationId]);

  const patch = useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const send = useCallback(
    async (o: SendOptions) => {
      if (sending || (!o.text.trim() && !o.image)) return;
      setSending(true);
      setRouteInfo(null);
      const userMsg: ChatMessage = { id: tmpId(), role: "user", content: o.text.trim(), cards: [], trace: [], image: o.image || null };
      // Bong bóng "HeadBro đang gõ…" hiện NGAY khi gửi (trước đây phải chờ máy chủ qua bước an toàn + định tuyến
      // 1–3 giây, lâu hơn khi có ảnh, mới thấy gì) — sự kiện agent_start đầu tiên dùng lại bong bóng này.
      const pendingId = tmpId();
      const pendingMsg: ChatMessage = { id: pendingId, role: "assistant", agent: "headbro", content: "", cards: [], trace: [], streaming: true };
      setMessages((ms) => {
        if (!o.replaceFrom) return [...ms, userMsg, pendingMsg];
        const i = ms.findIndex((m) => m.id === o.replaceFrom);
        return [...(i >= 0 ? ms.slice(0, i) : ms), userMsg, pendingMsg];
      });
      let current: string | null = pendingId; // id tin nhắn agent đang stream
      let currentAgent: string | null = "headbro";
      let pendingFree = true; // bong bóng chờ chưa được agent nào dùng
      let routeLocal: ChatMessage["route"] = null; // gắn lý do định tuyến vào agent đầu tiên của lượt

      const handle = (ev: Record<string, unknown>) => {
        switch (ev.type) {
          case "conversation":
            // gắn id thật của tin người dùng (cần cho "Tạo lại" / "Sửa")
            if (ev.user_message_id) {
              const realId = ev.user_message_id as string;
              setMessages((ms) => ms.map((m) => (m.id === userMsg.id ? { ...m, id: realId } : m)));
            }
            if (!convRef.current) {
              convRef.current = ev.id as string;
              skipLoad.current = true;
              onConversation?.(ev.id as string);
            }
            qc.invalidateQueries({ queryKey: ["conversations"] });
            break;
          case "route":
            routeLocal = { agents: ev.agents as string[], reason: ev.reason as string, method: ev.method as string };
            setRouteInfo(routeLocal);
            break;
          case "agent_start": {
            currentAgent = ev.agent as string;
            const fresh = { agent: ev.agent as AgentKey, synthesis: !!ev.synthesis, route: routeLocal, streaming: true };
            if (pendingFree) {
              pendingFree = false;
              current = pendingId;
              patch(pendingId, (m) => ({ ...m, ...fresh }));
            } else {
              const id = tmpId();
              current = id;
              setMessages((ms) => [...ms, { id, role: "assistant", content: "", cards: [], trace: [], ...fresh }]);
            }
            routeLocal = null;
            break;
          }
          case "token":
            if (current && ev.agent === currentAgent) {
              const id = current;
              // model đôi khi mở đầu bằng "[CoachBro] " — server làm sạch ở bản cuối, ở đây làm sạch luôn lúc đang chạy chữ
              patch(id, (m) => ({ ...m, content: (m.content + (ev.delta as string)).replace(/^\s*(\[(HeadBro|CoachBro|NutriBro)\]\s*[:：]?|(HeadBro|CoachBro|NutriBro)\s*[:：])\s*/i, "") }));
            }
            break;
          case "tool_call":
            if (current) {
              const id = current;
              patch(id, (m) => ({ ...m, trace: [...m.trace, { tool: ev.name as string, args: ev.args as Record<string, unknown>, running: true }] }));
            }
            break;
          case "tool_result":
            if (current) {
              const id = current;
              patch(id, (m) => {
                const trace = [...m.trace];
                const i = trace.map((t) => t.tool).lastIndexOf(ev.name as string);
                if (i >= 0) trace[i] = { ...trace[i], summary: ev.summary as string, running: false };
                return { ...m, trace };
              });
            }
            break;
          case "card":
            if (current) {
              const id = current;
              patch(id, (m) => ({ ...m, cards: [...m.cards, ev.card as Card] }));
            }
            break;
          case "agent_message":
            pendingFree = false;
            if (!current) { // câu trả lời không qua agent_start (vd. máy chủ báo quá giờ) → thêm bong bóng mới
              current = tmpId();
              const id0 = current;
              setMessages((ms) => [...ms, { id: id0, role: "assistant", agent: (ev.agent as AgentKey) || "headbro", content: "", cards: [], trace: [], streaming: true }]);
            }
            if (current) {
              const id = current;
              patch(id, (m) => ({
                ...m,
                id: (ev.id as string) || m.id,
                content: ev.content as string,
                cards: (ev.cards as Card[]) || m.cards,
                streaming: false,
              }));
              current = null;
            }
            break;
          case "trace": {
            // gắn trace vào câu trả lời cuối cùng của lượt này → nút "Chi tiết" mở Nhật ký AI
            const tid = ev.id as string;
            setMessages((ms) => {
              const idx = [...ms].reverse().findIndex((m) => m.role === "assistant");
              if (idx < 0) return ms;
              const real = ms.length - 1 - idx;
              return ms.map((m, i) => (i === real ? { ...m, traceId: tid } : m));
            });
            break;
          }
          case "followups":
            setMessages((ms) => ms.map((m) => (m.id === ev.id ? { ...m, followups: ev.items as string[] } : m)));
            break;
          case "error":
            setMessages((ms) => [
              ...ms,
              { id: tmpId(), role: "assistant", agent: "headbro", content: (ev.message as string) || "Có lỗi xảy ra", cards: [], trace: [], error: "error" },
            ]);
            break;
        }
      };

      try {
        abortRef.current = new AbortController();
        const res = await fetch(apiUrl("/api/chat/send"), {
          signal: abortRef.current.signal,
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenStore.get()}` },
          body: JSON.stringify({
            conversation_id: convRef.current,
            text: o.text.trim(),
            image: o.image || null,
            agent: o.agent && o.agent !== "auto" ? o.agent : null,
            page: o.page || null,
            page_context: o.pageContext || null,
            replace_from: o.replaceFrom || null,
          }),
        });
        if (!res.ok || !res.body) {
          const t = await res.text();
          let msg = "Không gửi được tin nhắn";
          try {
            msg = JSON.parse(t).detail || msg;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of chunk.split("\n")) {
              if (line.startsWith("data: ")) {
                try {
                  handle(JSON.parse(line.slice(6)));
                } catch {
                  /* bỏ qua dòng lỗi */
                }
              }
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          setMessages((ms) => ms.map((m) => (m.streaming ? { ...m, streaming: false, content: m.content || "_(đã dừng)_" } : m)));
          return;
        }
        setMessages((ms) => [
          ...ms.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
          { id: tmpId(), role: "assistant", agent: "headbro", content: (e as Error).message, cards: [], trace: [], error: "network" },
        ]);
      } finally {
        // bỏ bong bóng chờ chưa dùng; câu trả lời kết thúc mà rỗng (không chữ, không thẻ) → báo rõ thay vì để ô trống
        setMessages((ms) => ms
          .filter((m) => !(m.id === pendingId && pendingFree && !m.content && !m.cards.length))
          .map((m) => (m.streaming ? { ...m, streaming: false } : m))
          .map((m) => (m.role === "assistant" && !m.content.trim() && !m.cards.length && (m.id === pendingId || m.id.startsWith("tmp-"))
            ? { ...m, content: "HeadBro chưa trả lời được lượt này. Bạn gửi lại giúp mình nhé.", error: "empty" } : m)));
        setSending(false);
        qc.invalidateQueries(); // agent có thể đã tạo plan / dữ liệu mới
      }
    },
    [sending, patch, qc, onConversation],
  );

  const updateCard = useCallback((actionId: string, status: string) => {
    setMessages((ms) =>
      ms.map((m) => ({ ...m, cards: m.cards.map((c) => (c.kind === "confirm" && c.action_id === actionId ? { ...c, status } : c)) })),
    );
  }, []);

  // Dừng: ngắt luồng hiển thị VÀ báo server huỷ lượt đang chạy (nếu không, server vẫn viết tiếp và lưu đủ câu trả lời)
  const stop = useCallback(() => {
    abortRef.current?.abort();
    const cid = convRef.current;
    if (cid)
      fetch(apiUrl(`/api/chat/conversations/${cid}/stop`), { method: "POST", headers: { Authorization: `Bearer ${tokenStore.get()}` } }).catch(() => {});
  }, []);

  return { messages, loading, sending, send, stop, routeInfo, updateCard, setMessages };
}
