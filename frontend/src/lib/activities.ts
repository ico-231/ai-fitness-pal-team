/** Hoạt động khác (M8): kiểu dữ liệu + icon. Calo luôn do server tính (POST /api/activities/estimate). */
import {
  Activity as ActivityIcon, Baby, Bike, Dog, Feather, Flag, Flower2, Footprints, House, Mountain, Music, Package, Sailboat,
  Sprout, Sunrise, Swords, Timer, TrendingUp, Trophy, Waves, type LucideIcon,
} from "lucide-react";

export type Intensity = "light" | "moderate" | "vigorous";

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  category_vi: string;
  icon: string;
  popular: boolean;
  met: Record<Intensity, number>;
  compendium: string;
  aliases: string[];
  distance: boolean;
  steps: boolean;
}

export interface Catalog {
  categories: Record<string, string>;
  items: CatalogItem[];
  intensities: { key: Intensity; label: string; talk_test: string }[];
}

export interface Estimate {
  activity_code: string;
  name: string;
  intensity: Intensity;
  intensity_vi: string;
  who_class: Intensity;
  minutes: number;
  distance_km: number | null;
  steps: number | null;
  speed_kmh: number | null;
  met: number;
  weight_kg: number;
  kcal_gross: number;
  kcal_net: number;
  who_minutes: number;
  formula: string;
  compendium: string;
  warnings: string[];
  notes: string[];
}

export interface ActivityRow {
  id: string;
  date: string;
  activity_code: string;
  name: string;
  icon: string;
  intensity: Intensity;
  intensity_vi: string;
  duration_min: number;
  distance_km: number | null;
  steps: number | null;
  avg_hr: number | null;
  met: number;
  kcal_gross: number;
  kcal_net: number;
  who_minutes: number;
  formula: string;
  source: string;
  note: string;
}

export interface GymRow { id: string; name: string; minutes: number; met: number; hiit: boolean; kcal_gross: number; kcal_net: number }

export interface ActivitySummary {
  date: string;
  day: { activities: ActivityRow[]; gym: GymRow[]; total_kcal_net: number; total_kcal_gross: number; minutes: number };
  week: {
    start: string; end: string; who_minutes: number; target_min: number; target_max: number; strength_days: number; strength_target: number;
    activity_count: number; kcal_net: number; kcal_gross: number;
    days: { date: string; minutes: number; kcal: number; strength: boolean; future: boolean; is_today: boolean }[];
  };
  history: { start: string; who_minutes: number; strength_days: number; kcal_net: number }[];
  recent: { activity_code: string; name: string; duration_min: number; intensity: Intensity; intensity_vi: string; distance_km: number | null; steps: number | null; icon: string }[];
  energy: { mode: "average" | "tracked"; eat_back: number; lifestyle: string; lifestyle_label: string; has_weight: boolean; adjust_kcal: number };
}

const ICONS: Record<string, LucideIcon> = {
  Footprints, TrendingUp, Mountain, Activity: ActivityIcon, Bike, Waves, Sailboat, Feather, Trophy, Flag, Flower2, Music,
  Sunrise, Timer, Swords, Home: House, Sprout, Baby, Package, Dog,
};

export function activityIcon(name?: string | null): LucideIcon {
  return (name && ICONS[name]) || ActivityIcon;
}

export const FORMULA_VI: Record<string, string> = {
  met_net_bmr: "MET × cân nặng × giờ; phần cộng thêm trừ năng lượng nghỉ (BMR) của chính bạn",
  met_net_basic: "MET × cân nặng × giờ (thiếu chiều cao/tuổi → ước lượng thô)",
  hr_keytel: "Theo nhịp tim trung bình (công thức Keytel 2005)",
  steps: "Số bước vượt mức đi lại thường ngày ÷ 100 bước/phút × MET đi bộ",
};
