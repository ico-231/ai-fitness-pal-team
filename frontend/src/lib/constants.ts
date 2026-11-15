import type { AgentKey } from "./types";

export const AGENTS: Record<AgentKey, { name: string; title: string; color: string; bg: string; short: string; domain: string }> = {
  headbro: {
    name: "HeadBro",
    title: "Huấn luyện viên trưởng",
    color: "var(--head)",
    bg: "color-mix(in srgb, var(--head) 14%, transparent)",
    short: "H",
    domain: "Tổng quan, điểm sẵn sàng, InBody, đặt mục tiêu",
  },
  coachbro: {
    name: "CoachBro",
    title: "HLV sức mạnh & kỹ thuật",
    color: "var(--coach)",
    bg: "color-mix(in srgb, var(--coach) 14%, transparent)",
    short: "C",
    domain: "Bài tập, giáo án, form, tăng tải, cardio",
  },
  nutribro: {
    name: "NutriBro",
    title: "Chuyên gia dinh dưỡng",
    color: "var(--nutri)",
    bg: "color-mix(in srgb, var(--nutri) 14%, transparent)",
    short: "N",
    domain: "Bữa ăn, calo, macro, món Việt, thực đơn",
  },
  guard: {
    name: "Safety Guard",
    title: "Lớp an toàn",
    color: "var(--muted)",
    bg: "color-mix(in srgb, var(--muted) 14%, transparent)",
    short: "!",
    domain: "Chặn chủ đề y tế khẩn cấp",
  },
};

export const GOALS: Record<string, string> = {
  muscle: "Tăng cơ",
  fat_loss: "Giảm mỡ",
  maintain: "Duy trì vóc dáng",
  endurance: "Tăng sức bền",
  health: "Sức khỏe & an toàn khớp",
};

export const LEVELS: Record<string, string> = {
  beginner: "Người mới (< 6 tháng)",
  intermediate: "Trung cấp (6 tháng – 2 năm)",
  advanced: "Nâng cao (> 2 năm)",
};

export const ACTIVITY: Record<string, string> = {
  sedentary: "Ít vận động (ngồi nhiều)",
  light: "Nhẹ (tập 1–3 buổi/tuần)",
  moderate: "Vừa (tập 3–5 buổi/tuần)",
  active: "Cao (tập 6–7 buổi/tuần)",
  very_active: "Rất cao (VĐV / lao động nặng)",
};

export const EQUIPMENT: Record<string, string> = {
  gym: "Phòng gym đầy đủ",
  home: "Tại nhà có tạ đơn / dây",
  bodyweight: "Không dụng cụ",
};

export const FOCUS: Record<string, string> = {
  chest: "Ngực",
  back: "Lưng",
  shoulders: "Vai",
  arms: "Tay",
  legs: "Chân & Mông",
  abs: "Bụng & Core",
  cardio: "Cardio",
  mobility: "Giãn cơ",
  full: "Toàn thân",
};

export const MEAL_TYPES: Record<string, string> = {
  breakfast: "Bữa sáng",
  lunch: "Bữa trưa",
  dinner: "Bữa tối",
  snack: "Bữa phụ",
};

export const MUSCLES: Record<string, string> = {
  chest: "Ngực",
  shoulders: "Vai",
  biceps: "Tay trước",
  triceps: "Tay sau",
  forearms: "Cẳng tay",
  abs: "Bụng",
  obliques: "Liên sườn",
  traps: "Cầu vai",
  upper_back: "Lưng trên",
  lats: "Lưng xô",
  lower_back: "Lưng dưới",
  glutes: "Mông",
  quads: "Đùi trước",
  hamstrings: "Đùi sau",
  calves: "Bắp chân",
  adductors: "Đùi trong",
};

// Màu bản đồ nhiệt: tập ít → xanh, tập nhiều → đỏ
export const HEAT_COLORS = ["var(--muscle-0)", "var(--info)", "#4ade80", "#fb923c", "#ef4444"];

export const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "Tra kho kiến thức",
  get_user_profile: "Đọc hồ sơ",
  get_today_summary: "Xem tổng quan hôm nay",
  get_readiness: "Xem điểm sẵn sàng",
  search_exercises: "Tìm bài tập",
  get_exercise_detail: "Xem chi tiết bài tập",
  get_workout_history: "Xem lịch sử tập",
  get_muscle_volume: "Phân tích nhóm cơ đã tập",
  get_personal_records: "Xem kỷ lục PR",
  get_overload_suggestion: "Tính tăng tải lũy tiến",
  list_workout_templates: "Xem chương trình có sẵn",
  suggest_template: "Gợi ý chương trình",
  create_workout_plan: "Tạo buổi tập",
  open_workouts: "Mở trang Workouts",
  get_nutrition_day: "Xem nhật ký ăn uống",
  get_nutrition_history: "Xem lịch sử dinh dưỡng",
  search_food_library: "Tra thư viện món Việt",
  calculate_nutrition_targets: "Tính TDEE & macro",
  propose_meal_log: "Chuẩn bị ghi bữa ăn",
  get_progress_report: "Xem báo cáo tiến độ",
  get_body_metrics: "Xem chỉ số cơ thể",
  get_goals: "Xem mục tiêu",
  propose_goal: "Chuẩn bị lưu mục tiêu",
  propose_body_metric: "Chuẩn bị lưu chỉ số",
  get_streak_and_badges: "Xem streak & huy hiệu",
  navigate: "Tạo lối tắt",
  remember: "Ghi nhớ thông tin về bạn",
  get_weekly_schedule: "Xem lịch tập tuần",
  propose_weekly_schedule: "Chuẩn bị lịch tập tuần",
  create_meal_plan: "Lập thực đơn",
  get_insights: "Phân tích điểm cần cải thiện",
};
