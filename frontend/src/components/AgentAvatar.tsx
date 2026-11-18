import { Dumbbell, Salad, ShieldAlert, Crown } from "lucide-react";
import { AGENTS } from "../lib/constants";
import type { AgentKey } from "../lib/types";

// Mỗi agent có biểu tượng + màu riêng (không dùng chung 1 linh vật)
const ICONS = { headbro: Crown, coachbro: Dumbbell, nutribro: Salad, guard: ShieldAlert } as const;

// Người dùng chỉ trò chuyện với HeadBro. CoachBro/NutriBro vẫn chạy phía sau (Router chuyển việc),
// nên giao diện hiển thị chúng dưới tên HeadBro kèm nhãn chuyên môn. `real` = hiện đúng agent (Hướng dẫn, Nhật ký AI).
export const EXPERT: Partial<Record<AgentKey, string>> = { coachbro: "chuyên gia tập luyện", nutribro: "chuyên gia dinh dưỡng" };
const persona = (agent: AgentKey, real?: boolean): AgentKey => (real || agent === "guard" ? agent : "headbro");

export function AgentAvatar({ agent: raw, size = 34, real }: { agent: AgentKey; size?: number; real?: boolean }) {
  const agent = persona(raw, real);
  const a = AGENTS[agent] || AGENTS.headbro;
  // Trợ lý AI (HeadBro) dùng ảnh nhận diện riêng: quả tạ + nhịp tim + tia sáng trên nền tròn tối
  if (agent === "headbro") {
    return <img src="/ai-avatar.png?v=6" alt="" width={size} height={size} className="shrink-0 rounded-full" style={{ width: size, height: size }} />;
  }
  const Icon = ICONS[agent] || Crown;
  return (
    <div className="grid shrink-0 place-items-center rounded-xl" style={{ width: size, height: size, background: a.bg, color: a.color }}>
      <Icon size={Math.round(size * 0.52)} strokeWidth={2.2} />
    </div>
  );
}

export function AgentName({ agent: raw, withTitle = true, real }: { agent: AgentKey; withTitle?: boolean; real?: boolean }) {
  const agent = persona(raw, real);
  const a = AGENTS[agent] || AGENTS.headbro;
  const expert = !real ? EXPERT[raw] : undefined;
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-sm font-semibold" style={{ color: a.color }}>
        {a.name}
      </span>
      {expert ? (
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted" title={`Câu này HeadBro nhờ ${AGENTS[raw].name} (${expert}) xử lý`}>
          {expert}
        </span>
      ) : (
        withTitle && <span className="text-xs text-muted">{a.title}</span>
      )}
    </span>
  );
}
