import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Activity, ArrowUpRight, Check, ChevronDown, ChevronRight, Copy, ImagePlus, Loader2, Mic, MicOff, Pencil, RotateCcw, Send, ShieldCheck, Square, Volume2, Wrench, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useChat } from "../../lib/chat";
import { useDesktop } from "../../lib/hooks";
import { BubbleV1 } from "../mobile/ChatV1";
import { TOOL_LABELS } from "../../lib/constants";
import { createRecognizer, fileToDataUrl, voice } from "../../lib/media";
import type { AgentKey, ChatMessage } from "../../lib/types";
import { useAuth } from "../../lib/auth";
import { AgentAvatar, AgentName } from "../AgentAvatar";
import { Markdown } from "../Markdown";
import { toast } from "../ui";
import { ChatCards } from "./ChatCards";

function Trace({ m }: { m: ChatMessage }) {
  const [open, setOpen] = useState(false);
  if (!m.trace.length) return null;
  return (
    <div className="mb-1.5">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-xs text-muted hover:text-text">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Wrench size={12} /> Đã dùng {m.trace.length} công cụ
        {m.trace.some((t) => t.running) && <Loader2 size={12} className="animate-spin" />}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 border-l-2 border-border pl-3 text-xs text-muted">
          {m.trace.map((t, i) => (
            <li key={i}>
              <span className="font-medium text-text">{TOOL_LABELS[t.tool] || t.tool}</span>
              <code className="ml-1 text-[11px] opacity-70">{t.tool}</code>
              {t.summary && <span> → {t.summary}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="text-muted opacity-60 hover:opacity-100"
      title="Sao chép"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

/** Ô sửa câu hỏi ngay tại bong bóng (Enter = gửi lại, Esc = huỷ). */
function EditBox({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (t: string) => void }) {
  const [t, setT] = useState(initial);
  const submit = () => t.trim() && t.trim() !== initial.trim() && onSave(t.trim());
  return (
    <div className="flex justify-end">
      <div className="w-full max-w-[85%] rounded-[22px] border border-[var(--glass-border)] bg-surface p-2 shadow-[var(--shadow)]">
        <textarea autoFocus value={t} onChange={(e) => setT(e.target.value)} rows={2} aria-label="Sửa câu hỏi"
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          className="w-full resize-none bg-transparent px-2 py-1.5 text-[14.5px] outline-none" style={{ fieldSizing: "content" } as React.CSSProperties} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-full px-3.5 py-1.5 text-sm text-muted hover:bg-surface-2">Huỷ</button>
          <button type="button" onClick={submit} disabled={!t.trim() || t.trim() === initial.trim()}
            className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-on-ink transition hover:opacity-90 disabled:opacity-40">Gửi lại</button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ m, onCardStatus, compact, onFollowup, onRegenerate, onEdit }: {
  m: ChatMessage; onCardStatus: (a: string, s: string) => void; compact?: boolean; onFollowup?: (q: string) => void;
  onRegenerate?: () => void; onEdit?: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (m.role === "user" && editing && onEdit)
    return <EditBox initial={m.content} onCancel={() => setEditing(false)} onSave={(t) => { setEditing(false); onEdit(t); }} />;
  if (m.role === "user")
    return (
      <div className="group flex items-start justify-end gap-1.5">
        {onEdit && (
          <button type="button" onClick={() => setEditing(true)} title="Sửa câu hỏi" aria-label="Sửa câu hỏi"
            className="mt-1.5 grid h-7 w-7 place-items-center rounded-full text-muted opacity-0 transition hover:bg-surface-2 hover:text-text focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60">
            <Pencil size={13} />
          </button>
        )}
        <div className="max-w-[85%] rounded-[22px] rounded-br-md bg-ink px-4 py-2.5 text-[14.5px] text-on-ink">
          {m.image && <img src={m.image} alt="" className="mb-2 max-h-48 rounded-lg" />}
          <p className="whitespace-pre-wrap">{m.content}</p>
        </div>
      </div>
    );
  const agent = (m.agent || "headbro") as AgentKey;
  const showTyping = m.streaming && !m.content;
  return (
    <div className="fade-in flex gap-3">
      <AgentAvatar agent={agent} />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <AgentName agent={agent} withTitle={!compact} />
          {m.synthesis && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted">TỔNG KẾT</span>}
          {!m.streaming && m.content && (
            <span className="ml-auto flex items-center gap-2">
              {onRegenerate && (
                <button className="flex items-center gap-1 text-[11px] text-muted opacity-70 hover:opacity-100" title="Tạo lại câu trả lời" onClick={onRegenerate}>
                  <RotateCcw size={13} /> Tạo lại
                </button>
              )}
              <CopyBtn text={m.content} />
              <button className="text-muted opacity-60 hover:opacity-100" title="Đọc to" onClick={() => voice.speak(m.content, { force: true })}>
                <Volume2 size={14} />
              </button>
              {m.traceId && (
                <Link to={`/ai-log?id=${m.traceId}`} className="text-muted opacity-60 hover:opacity-100" title="Chi tiết xử lý (Nhật ký AI)">
                  <Activity size={14} />
                </Link>
              )}
            </span>
          )}
        </div>
        <Trace m={m} />
        <div className={clsx("rounded-[22px] rounded-tl-md px-4 py-2.5", agent === "guard" ? "border border-warn/40 bg-warn/10" : "bg-surface-2", m.error && "border border-danger/40")}>
          {showTyping ? (
            <span className="flex gap-1 py-1.5">
              <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
              <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
              <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
            </span>
          ) : (
            <Markdown>{m.content}</Markdown>
          )}
        </div>
        {!!m.safetyFlags?.length && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
            <ShieldCheck size={11} /> Lớp an toàn đã bổ sung lưu ý cho câu trả lời này
          </p>
        )}
        <ChatCards cards={m.cards} onCardStatus={onCardStatus} compact={compact} />
        {onFollowup && !!m.followups?.length && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {m.followups.map((q) => (
              <button key={q} onClick={() => onFollowup(q)} className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-[13px] text-muted transition hover:border-primary/60 hover:text-text">
                {q} <ArrowUpRight size={12} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


export interface ChatViewProps {
  conversationId: string | null;
  onConversation?: (id: string) => void;
  compact?: boolean;
  page?: string;
  pageContext?: string;
  initial?: { text: string; agent?: string; autoSend?: boolean } | null;
  /** Gọi ngay sau khi `initial` đã được gửi / điền vào ô nhập → nơi giữ state xoá nó, tránh gửi lại khi khung chat dựng lại */
  onInitialSent?: () => void;
  emptyState?: ReactNode;
  /**
   * Kiểu trang (Claude/Gemini): khi chưa có tin nhắn, vẽ màn chào với ô nhập nằm GIỮA màn hình
   * (hàm nhận sẵn ô nhập để đặt vào bố cục). Có tin nhắn rồi thì ô nhập nổi ở đáy, không viền ngăn cách.
   */
  hero?: (composer: ReactNode) => ReactNode;
}

export function ChatView({ conversationId, onConversation, compact, page, pageContext, initial, onInitialSent, emptyState, hero }: ChatViewProps) {
  const { messages, loading, sending, send, stop, routeInfo, updateCard } = useChat(conversationId, onConversation);
  const { config } = useAuth();
  const [text, setText] = useState("");
  const touch = typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches;
  const [image, setImage] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const sentInitial = useRef<string | null>(null);
  // Điện thoại (< 1024px): bản V1 "Kính lỏng" (bong bóng .msg, ô soạn kính, gợi ý .qr); logic gửi/nhận dùng chung
  const mobile = !useDesktop();

  useEffect(() => {
    if (!initial) {
      sentInitial.current = null; // đã tiêu thụ → lần chọn sau (kể cả trùng câu) vẫn gửi được
      return;
    }
    const key = `${initial.text}|${initial.agent}`;
    if (sentInitial.current === key) return;
    sentInitial.current = key;
    // Nút "Hỏi AI" của một trang có thể gợi ý chuyên gia cho RIÊNG câu đầu; các câu sau luôn tự định tuyến theo nội dung
    // (trước đây chuyên gia bị giữ cho cả cuộc trò chuyện → hỏi sang chủ đề khác bị trả lời sai / từ chối).
    if (initial.autoSend && initial.text) send({ text: initial.text, agent: initial.agent, page, pageContext });
    else setText(initial.text);
    onInitialSent?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    // chưa có tin nhắn (màn chào) → giữ ở đầu để thấy tiêu đề; có tin nhắn → cuộn xuống cuối
    if (!messages.length) return;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, routeInfo]);

  // Nhắn khi HeadBro đang trả lời: giữ câu mới trong hàng đợi và tự gửi khi lượt trước xong
  // (trước đây ô nhập bị xoá nhưng send() bỏ qua vì đang bận → câu mới mất hẳn).
  const [queued, setQueued] = useState<{ text: string; image: string | null } | null>(null);
  useEffect(() => {
    if (sending || !queued) return;
    const q = queued;
    setQueued(null);
    send({ text: q.text, image: q.image, page, pageContext });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi lượt trước vừa xong hoặc có câu mới xếp hàng
  }, [sending, queued]);

  const submit = () => {
    if (!text.trim() && !image) return;
    if (sending) {
      if (queued) return; // đã có một câu chờ: giữ nguyên ô nhập, không ghi đè
      setQueued({ text, image });
    } else send({ text, image, page, pageContext });
    setText("");
    setImage(null);
  };

  const queuedNote = queued && (
    <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5 text-xs text-muted" role="status">
      <span className="min-w-0 flex-1 truncate">Sẽ gửi khi HeadBro trả lời xong: <b className="text-text">{queued.text || "ảnh"}</b></span>
      <button type="button" className="shrink-0 rounded-md px-1.5 py-1 font-semibold text-text hover:bg-surface-3"
        onClick={() => { setText(queued.text); setImage(queued.image); setQueued(null); }}>Huỷ</button>
    </div>
  );

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const r = createRecognizer();
    if (!r) return toast("Trình duyệt chưa hỗ trợ nhập giọng nói (dùng Chrome/Edge)", "error");
    recRef.current = r;
    r.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setText(t);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    setListening(true);
    r.start();
  };

  const isPage = !!hero && !compact;
  const showHero = isPage && !loading && messages.length === 0;

  // Ô nhập dùng chung cho cả 3 kiểu: ngăn nổi (compact), màn chào giữa trang (hero), đáy trang khi đang trò chuyện
  const composer = (
    <div className={clsx(!compact && "mx-auto w-full", !compact && !showHero && "max-w-3xl")}>
      {config?.ai_enabled === false && (
        <p className="mb-2 rounded-lg bg-warn/10 px-3 py-1.5 text-xs text-warn-strong">AI chưa được cấu hình trên server — HeadBro sẽ chưa trả lời được.</p>
      )}
      {queuedNote}
      {image && (
        <div className="relative mb-2 inline-block">
          <img src={image} className="h-20 rounded-lg border border-border" alt="" />
          <button onClick={() => setImage(null)} aria-label="Bỏ ảnh" className="absolute -right-2 -top-2 rounded-full bg-surface-3 p-0.5">
            <X size={14} />
          </button>
        </div>
      )}
      <div
        className={clsx(
          "flex items-end gap-2 border border-[var(--glass-border)] bg-surface transition focus-within:border-[color-mix(in_srgb,var(--text)_22%,transparent)]",
          isPage ? "rounded-[28px] p-2 shadow-[var(--shadow-lg)]" : "rounded-[22px] p-1.5 shadow-[var(--shadow)]",
        )}
      >
        <button className={clsx("grid shrink-0 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-text", isPage ? "h-10 w-10" : "h-9 w-9 pointer-coarse:h-10 pointer-coarse:w-10")} title="Gửi ảnh (món ăn, phiếu InBody...)" aria-label="Gửi ảnh" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={18} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setImage(await fileToDataUrl(f));
            e.target.value = "";
          }}
        />
        <textarea
          value={text}
          autoFocus={showHero && !touch}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          aria-label="Tin nhắn cho trợ lý FitBro"
          placeholder={listening ? "Đang nghe..." : showHero ? (touch ? "Hỏi HeadBro bất cứ điều gì..." : "Hỏi HeadBro về tập luyện, ăn uống, tiến độ...") : touch ? "Nhắn cho HeadBro..." : "Nhắn cho HeadBro... (Enter để gửi)"}
          className={clsx(
            "no-focus-ring flex-1 resize-none bg-transparent px-1 outline-none",
            // 1 dòng cao ĐÚNG bằng nút (40 / 36 px) → chữ và icon cùng nằm trên một đường giữa (optical align);
            // nhiều dòng thì ô giãn lên, các nút vẫn bám đáy (items-end)
            isPage ? "max-h-52 min-h-10 py-[9px] text-[15.5px] leading-[22px]" : "max-h-40 min-h-9 py-[7px] text-[14.5px] leading-[22px]",
          )}
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <button className={clsx("grid shrink-0 place-items-center rounded-full hover:bg-surface-3", isPage ? "h-10 w-10" : "h-9 w-9 pointer-coarse:h-10 pointer-coarse:w-10", listening ? "text-danger" : "text-muted")} title="Nói" aria-label="Nhập bằng giọng nói" onClick={toggleMic}>
          {listening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        {sending ? (
          <button onClick={stop} className={clsx("grid shrink-0 place-items-center rounded-full bg-surface-3 text-text", isPage ? "h-10 w-10" : "h-9 w-9 pointer-coarse:h-10 pointer-coarse:w-10")} title="Dừng trả lời" aria-label="Dừng trả lời">
            <Square size={15} fill="currentColor" />
          </button>
        ) : (
          <button
            disabled={!text.trim() && !image}
            onClick={submit}
            className={clsx("grid shrink-0 place-items-center rounded-full bg-ink text-on-ink transition disabled:opacity-35", isPage ? "h-10 w-10" : "h-9 w-9 rounded-xl pointer-coarse:h-10 pointer-coarse:w-10")}
            title="Gửi"
            aria-label="Gửi tin nhắn"
          >
            <Send size={17} />
          </button>
        )}
      </div>
    </div>
  );

  if (mobile) {
    const composerV1 = (
      <div className="chat-comp">
        {config?.ai_enabled === false && <div className="g alert warn" role="status"><span className="a-ic"><ShieldCheck className="ic" /></span><div><b>AI chưa được cấu hình trên server</b><p>HeadBro sẽ chưa trả lời được.</p></div></div>}
        {queuedNote}
        {image && (
          <div className="chat-img"><img src={image} alt="Ảnh đính kèm" /><button type="button" className="icon-btn sm" aria-label="Bỏ ảnh" onClick={() => setImage(null)}><X className="ic ic-sm" /></button></div>
        )}
        <div className="g composer">
          <button type="button" className="icon-btn sm" aria-label="Gửi ảnh (món ăn, phiếu InBody...)" onClick={() => fileRef.current?.click()}><ImagePlus className="ic" /></button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImage(await fileToDataUrl(f)); e.target.value = ""; }} />
          <textarea value={text} rows={1} aria-label="Tin nhắn cho HeadBro" placeholder={listening ? "Đang nghe..." : "Hỏi HeadBro..."}
            onChange={(e) => setText(e.target.value)} style={{ fieldSizing: "content" } as React.CSSProperties}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !touch) { e.preventDefault(); submit(); } }} />
          <button type="button" className={clsx("icon-btn sm", listening && "rec")} aria-label={listening ? "Dừng nhập giọng nói" : "Nhập bằng giọng nói"} aria-pressed={listening} onClick={toggleMic}>{listening ? <MicOff className="ic" /> : <Mic className="ic" />}</button>
          {sending ? (
            <button type="button" className="send" aria-label="Dừng trả lời" onClick={stop}><Square className="ic ic-sm" fill="currentColor" /></button>
          ) : (
            <button type="button" className="send" aria-label="Gửi tin nhắn" disabled={!text.trim() && !image} onClick={submit}><Send className="ic" /></button>
          )}
        </div>
        {!compact && <p className="chat-foot">HeadBro có thể nhầm lẫn. Hỏi bác sĩ khi có vấn đề sức khoẻ.</p>}
      </div>
    );
    return (
      <div className="v1 chatv1">
        <div ref={scroller} className="chat-scroll">
          <div className="chat">
            {loading && <div className="chat-load"><span className="spinner" aria-label="Đang tải" /></div>}
            {!loading && messages.length === 0 && emptyState}
            {messages.map((m, i) => (
              <BubbleV1 key={m.id} m={m} compact={compact} onCardStatus={updateCard}
                onFollowup={i === messages.length - 1 && !sending ? (q) => send({ text: q, page, pageContext }) : undefined}
                onEdit={m.role === "user" && !sending && !m.id.startsWith("tmp-") && conversationId ? (t) => send({ text: t, page, pageContext, replaceFrom: m.id }) : undefined}
                onRegenerate={(() => {
                  if (m.role !== "assistant" || i !== messages.length - 1 || sending || m.streaming) return undefined;
                  const q = [...messages.slice(0, i)].reverse().find((x) => x.role === "user");
                  if (!q || q.id.startsWith("tmp-") || !conversationId) return undefined;
                  return () => send({ text: q.content, image: q.image, page, pageContext, replaceFrom: q.id });
                })()} />
            ))}
          </div>
        </div>
        {composerV1}
      </div>
    );
  }

  // Màn chào kiểu Claude/Gemini: lời chào + ô nhập ở giữa màn hình, gợi ý bên dưới
  if (showHero) {
    return (
      <div ref={scroller} className="flex h-full min-h-0 flex-col overflow-y-auto px-4 sm:px-6">
        <div className="m-auto w-full max-w-[760px] pb-[10vh] pt-8">{hero!(composer)}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className={clsx("flex-1 overflow-y-auto", compact ? "px-3 py-3" : "px-4 py-6 sm:px-6")}>
        <div className={clsx("mx-auto space-y-5", !compact && "max-w-3xl")}>
          {loading && (
            <div className="flex justify-center py-8 text-muted">
              <Loader2 className="animate-spin" />
            </div>
          )}
          {!loading && messages.length === 0 && emptyState}
          {messages.map((m, i) => (
            <div key={m.id} className="space-y-3">
              <Bubble
                m={m}
                onCardStatus={updateCard}
                compact={compact}
                onFollowup={i === messages.length - 1 && !sending ? (q) => send({ text: q, page, pageContext }) : undefined}
                onEdit={m.role === "user" && !sending && !m.id.startsWith("tmp-") && conversationId
                  ? (t) => send({ text: t, page, pageContext, replaceFrom: m.id }) : undefined}
                onRegenerate={(() => {
                  // chỉ câu trả lời cuối cùng mới có "Tạo lại"; gửi lại câu hỏi ngay trước nó
                  if (m.role !== "assistant" || i !== messages.length - 1 || sending || m.streaming) return undefined;
                  const q = [...messages.slice(0, i)].reverse().find((x) => x.role === "user");
                  if (!q || q.id.startsWith("tmp-") || !conversationId) return undefined;
                  return () => send({ text: q.content, image: q.image, page, pageContext, replaceFrom: q.id });
                })()}
              />
            </div>
          ))}
        </div>
      </div>

      {isPage ? (
        // Trang: ô nhập nổi ở đáy, không có dải viền ngăn cách; nền mờ dần để nội dung cuộn "chìm" dưới ô nhập
        <div className="relative px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-5">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-[var(--bg)] to-transparent" />
          {composer}
          <p className="mt-2 hidden text-center text-[11px] text-muted sm:block">HeadBro có thể nhầm lẫn. Hỏi bác sĩ khi có vấn đề sức khoẻ.</p>
        </div>
      ) : (
        <div className={clsx("border-t border-border bg-[var(--glass-strong)] backdrop-blur-2xl", compact ? "p-2.5" : "p-3 sm:p-4")}>{composer}</div>
      )}
    </div>
  );
}
