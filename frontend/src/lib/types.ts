export type AgentKey = "headbro" | "coachbro" | "nutribro" | "guard";

export interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water_ml: number;
}

export interface Settings {
  voice_coach: boolean;
  voice_rate: number;
  prep_seconds: number;
  auto_camera: boolean;
  theme: "system" | "light" | "dark";
  reminders: { checkin: string; workout: string; water_every_min: number; enabled: boolean };
}

export interface Profile {
  onboarded: boolean;
  age: number | null;
  gender: "male" | "female" | "other" | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal: "muscle" | "fat_loss" | "maintain" | "endurance" | "health";
  level: "beginner" | "intermediate" | "advanced";
  activity_level: "sedentary" | "light" | "moderate" | "active" | "very_active";
  training_days: number;
  equipment: "gym" | "home" | "bodyweight";
  injuries: string;
  targets: Targets;
  targets_manual: boolean;
  calculated: (Targets & { bmr: number; tdee: number }) | null;
  bmi: number | null;
  settings: Settings;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  has_password: boolean;
  google: boolean;
  profile: Profile | null;
}

export interface Exercise {
  id: string;
  name: string;
  name_vi?: string | null;
  body_part: string;
  body_part_vi: string;
  target: string;
  equipment: string;
  equipment_vi: string;
  primary: string[];
  secondary: string[];
  steps?: string[];
  gif: string;
  camera: string | null;
  timed: boolean;
  compound: boolean;
  kind: "strength" | "cardio" | "mobility";
}

export interface PlanItem {
  exercise_id: string;
  sets: number;
  reps: number;
  rest_sec: number;
  duration_sec: number;
  note?: string;
  exercise: Exercise;
}

export interface Plan {
  id: string;
  name: string;
  focus: string;
  level?: string;
  equipment?: string;
  description: string;
  est_minutes: number;
  items: PlanItem[];
  source: "template" | "ai" | "custom";
  optional?: boolean;
}

export interface WorkoutSet {
  id: string;
  exercise_id: string;
  exercise_name: string;
  set_index: number;
  weight_kg: number;
  reps: number;
  duration_sec: number;
  form_score: number | null;
  created_at: string;
}

export interface WorkoutSession {
  id: string;
  plan_id: string | null;
  name: string;
  status: "active" | "completed";
  started_at: string;
  ended_at: string | null;
  duration_sec: number;
  total_volume: number;
  avg_form_score: number | null;
  date: string;
  sets: WorkoutSet[];
}

export interface Readiness {
  score: number;
  band: "high" | "good" | "moderate" | "low";
  label: string;
  advice: string;
  intensity: number;
  weakest: string;
  components: { key: string; label: string; score: number; weight: number }[];
  date: string;
  inputs: Record<string, number | null>;
  note: string;
}

export interface Meal {
  id: string;
  date: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  items: { name: string; grams?: number; calories?: number; protein?: number; carbs?: number; fat?: number }[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  image: string | null;
  analysis: string;
  source: string;
  created_at: string;
}

export interface Food {
  id: string;
  name: string;
  category: string;
  category_vi: string;
  serving: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  image: string | null;
  emoji: string;
  clean: boolean;
  summary: string;
  tip: string;
}

export interface MuscleVolume {
  days: number;
  start: string;
  end: string;
  total_sets: number;
  muscles: Record<string, { label: string; sets: number; level: number }>;
  levels: { level: number; label: string; min: number }[];
  top: string[];
  untrained: string[];
}

export interface PR {
  exercise_id: string;
  exercise_name: string;
  e1rm: number;
  weight_kg: number;
  reps: number;
  date: string;
  previous?: number;
}

export interface Goal {
  id: string;
  title: string;
  metric: string;
  start_value: number | null;
  target_value: number | null;
  current_value: number | null;
  progress_pct: number | null;
  deadline: string | null;
  days_left: number | null;
  status: string;
  plan: string;
  source: string;
}

// ---- Chat ----
export type Card =
  | { kind: "exercises"; title?: string | null; focus?: string | null; items: Exercise[] }
  | { kind: "plan"; plan: Plan }
  | { kind: "foods"; items: Food[] }
  | { kind: "buttons"; buttons: { label: string; to: string }[] }
  | { kind: "memory"; content: string; memory_id: string }
  | { kind: "mealplan"; title: string; items: MealPlanItem[]; totals: Record<"calories" | "protein" | "carbs" | "fat", number>; targets: Targets }
  | { kind: "sources"; items: { ref: number; id: string; title: string; source: string }[] }
  | { kind: "confirm"; action_id: string; action_type: string; summary: string; payload: Record<string, unknown>; status: string; result?: Record<string, unknown> };

export interface MealPlanItem {
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  servings: number;
  food_id: string | null;
  name: string;
  image: string | null;
  emoji: string;
  serving: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Insight {
  level: "info" | "warn" | "good";
  title: string;
  text: string;
  action: { label: string; to: string } | null;
  ask: { agent: AgentKey; text: string } | null;
}

export interface ScheduleDay {
  weekday: number;
  label: string;
  plan: { id: string; name: string; focus: string; est_minutes: number; count: number; source: string } | null;
  rest: boolean;
  note: string;
  is_today: boolean;
  done: boolean;
}

export interface TraceItem {
  tool: string;
  args?: Record<string, unknown>;
  summary?: string;
  running?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  agent?: AgentKey | null;
  content: string;
  cards: Card[];
  trace: TraceItem[];
  image?: string | null;
  streaming?: boolean;
  synthesis?: boolean;
  route?: { agents: string[]; reason: string; method?: string } | null;
  error?: string | null;
  followups?: string[];
  traceId?: string | null;
  safetyFlags?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}
