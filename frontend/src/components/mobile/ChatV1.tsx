import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowUpRight, Check, Copy, Pencil, RotateCcw, ShieldCheck, Volume2, Wrench } from "lucide-react";
import { TOOL_LABELS } from "../../lib/constants";
import { voice } from "../../lib/media";
import type { ChatMessage } from "../../lib/types";
import { Markdown } from "../Markdown";
import { ChatCards } from "../chat/ChatCards";
import { HeadBroSvg } from "../MobileShell";

/** Bong bóng chat V1 "Kính lỏng" (điện thoại). Cùng chức năng với Bubble của bản máy tính: sửa câu hỏi, tạo lại, sao chép, đọc to, chi tiết xử lý, gợi ý tiếp theo. */
export function BubbleV1({ m, onCardStatus, compact, onFollowup, onRegenerate, onEdit }: {
  m: ChatMessage; onCardStatus: (a: string, s: string) => void; compact?: boolean; onFollowup?: (q: string) => void;
  onRegenerate?: () => void; onEdit?: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [t, setT] = useState(m.content);
  const [copied, setCopied] = useState(false);
  const [trace, setTrace] = useState(false);

  if (m.role === "user" && editing && onEdit) {
    const changed = t.trim() && t.trim() !== m.content.trim();
    return (
      <div className="msg mine">
        <div className="bub edit-bub">
          <textarea autoFocus value={t} rows={3} aria-label="Sửa câu hỏi" onChange={(e) => setT(e.target.value)} />
          <div className="btn-row">
            <button type="button" className="btn btn-glass btn-sm" onClick={() => { setEditing(false); setT(m.content); }}>Huỷ</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!changed} onClick={() => { setEditing(false); onEdit(t.trim()); }}>Gửi lại</button>
          </div>
        </div>
      </div>
    );
  }

  if (m.role === "user")
    return (
      <div className="msg mine">
        <div className="bub">
          {m.image && <img src={m.image} alt="" className="bub-img" />}
          <p style={{ whiteSpace: "pre-wrap" }}>{m.content}</p>
        </div>
        {onEdit && <button type="button" className="icon-btn sm mine-edit" aria-label="Sửa câu hỏi" onClick={() => { setT(m.content); setEditing(true); }}><Pencil className="ic ic-sm" /></button>}
      </div>
    );

  const typing = m.streaming && !m.content;
  return (
    <div className="msg">
      <span className="hb"><HeadBroSvg className="ic-ai" /></span>
      <div className="am-col">
        <div className={m.error ? "bub err" : "bub"}>
          <b>HeadBro{m.synthesis ? " · tổng kết" : ""}</b>
          {typing ? <span className="typing" aria-label="HeadBro đang trả lời"><i /><i /><i /></span> : <Markdown>{m.content.replace("các agent chưa thể trả lời", "HeadBro chưa thể trả lời")}</Markdown>}
        </div>
        {m.trace.length > 0 && (
          <div className="am-trace">
            <button type="button" className="link" aria-expanded={trace} onClick={() => setTrace(!trace)}><Wrench className="ic ic-sm" />Đã dùng {m.trace.length} công cụ</button>
            {trace && <ul>{m.trace.map((x, i) => <li key={i}><b>{TOOL_LABELS[x.tool] || x.tool}</b>{x.summary ? ` → ${x.summary}` : ""}</li>)}</ul>}
          </div>
        )}
        {!!m.safetyFlags?.length && <p className="am-note"><ShieldCheck className="ic ic-sm" />Lớp an toàn đã bổ sung lưu ý cho câu trả lời này</p>}
        <div className="am-cards"><ChatCards cards={m.cards} onCardStatus={onCardStatus} compact={compact} /></div>
        {!m.streaming && m.content && (
          <div className="am-acts">
            <button type="button" className="icon-btn sm" aria-label={copied ? "Đã sao chép" : "Sao chép"} onClick={() => { navigator.clipboard?.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check className="ic ic-sm" /> : <Copy className="ic ic-sm" />}</button>
            <button type="button" className="icon-btn sm" aria-label="Đọc to" onClick={() => voice.speak(m.content, { force: true })}><Volume2 className="ic ic-sm" /></button>
            {onRegenerate && <button type="button" className="icon-btn sm" aria-label="Tạo lại câu trả lời" onClick={onRegenerate}><RotateCcw className="ic ic-sm" /></button>}
            {m.traceId && <Link to={`/ai-log?id=${m.traceId}`} className="icon-btn sm" aria-label="Chi tiết xử lý (Nhật ký AI)"><Activity className="ic ic-sm" /></Link>}
          </div>
        )}
        {onFollowup && !!m.followups?.length && (
          <div className="qr am-qr">{m.followups.map((q) => <button key={q} type="button" onClick={() => onFollowup(q)}>{q}<ArrowUpRight className="ic ic-sm" style={{ marginLeft: 4 }} /></button>)}</div>
        )}
      </div>
    </div>
  );
}
