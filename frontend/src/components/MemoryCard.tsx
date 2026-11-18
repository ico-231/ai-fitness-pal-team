import { useState } from "react";
import { Brain, Plus, Trash2 } from "lucide-react";
import { del, post } from "../lib/api";
import { useAction, useApi } from "../lib/hooks";
import { timeAgo } from "../lib/format";
import { AGENTS } from "../lib/constants";
import type { AgentKey } from "../lib/types";
import { Button, Card, CardHeader, Spinner } from "./ui";

interface Mem { id: string; content: string; category: string; source: string; created_at: string }

const CAT: Record<string, string> = { preference: "Sở thích", health: "Sức khỏe", schedule: "Lịch sinh hoạt", food: "Ăn uống", goal: "Mục tiêu", other: "Khác" };

/** Trí nhớ dài hạn: những điều agent đã ghi nhớ về người dùng — minh bạch, người dùng toàn quyền xoá. */
export function MemoryCard() {
  const { data } = useApi<Mem[]>(["memories"], "/api/memories");
  const [text, setText] = useState("");
  const add = useAction(() => post("/api/memories", { content: text, category: "other" }), { success: "Đã thêm", onSuccess: () => setText("") });
  const remove = useAction((id: string) => del(`/api/memories/${id}`), { success: "Đã xoá ký ức" });
  return (
    <Card>
      <div id="memory" />
      <CardHeader title="Trí nhớ của AI" subtitle="Những điều các agent đã ghi nhớ về bạn để không phải hỏi lại" icon={<Brain size={16} />} />
      <div className="space-y-3 px-5 pb-5">
        {!data ? (
          <Spinner />
        ) : data.length === 0 ? (
          <p className="text-sm text-muted">Chưa có gì. Khi bạn kể với AI kiểu "mình dị ứng hải sản" hay "mình hay tập lúc 6h sáng", agent sẽ tự ghi nhớ.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p>{m.content}</p>
                  <p className="text-[11px] text-muted">
                    {CAT[m.category] || m.category} · {m.source === "manual" ? "bạn tự thêm" : `${AGENTS[m.source as AgentKey]?.name || m.source} ghi nhớ`} · {timeAgo(m.created_at)}
                  </p>
                </div>
                <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger pointer-coarse:h-11 pointer-coarse:w-11" onClick={() => remove.mutate(m.id)} title="Xoá" aria-label="Xoá ghi nhớ này">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input className="input" aria-label="Thêm điều HeadBro cần nhớ về bạn" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tự thêm, vd: Không ăn được thịt bò" onKeyDown={(e) => e.key === "Enter" && text.trim() && add.mutate(undefined as never)} />
          <Button variant="outline" icon={<Plus size={15} />} disabled={!text.trim()} loading={add.isPending} onClick={() => add.mutate(undefined as never)}>
            Thêm
          </Button>
        </div>
      </div>
    </Card>
  );
}
