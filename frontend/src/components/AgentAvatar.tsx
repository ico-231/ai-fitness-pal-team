import { Dumbbell, Salad, ShieldAlert, Crown } from "lucide-react";
import { AGENTS } from "../lib/constants";
import type { AgentKey } from "../lib/types";

// Mỗi agent có biểu tượng + màu riêng (không dùng chung 1 linh vật)
const ICONS = { headbro: Crown, coachbro: Dumbbell, nutribro: Salad, guard: ShieldAlert } as const;

export function AgentAvatar({ agent, size = 34 }: { agent: AgentKey; size?: number }) {
  const a = AGENTS[agent] || AGENTS.headbro;
  const Icon = ICONS[agent] || Crown;
  return (
    <div className="grid shrink-0 place-items-center rounded-xl" style={{ width: size, height: size, background: a.bg, color: a.color }}>
      <Icon size={Math.round(size * 0.52)} strokeWidth={2.2} />
    </div>
  );
}

export function AgentName({ agent, withTitle = true }: { agent: AgentKey; withTitle?: boolean }) {
  const a = AGENTS[agent] || AGENTS.headbro;
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-sm font-semibold" style={{ color: a.color }}>
        {a.name}
      </span>
      {withTitle && <span className="text-xs text-muted">{a.title}</span>}
    </span>
  );
}
