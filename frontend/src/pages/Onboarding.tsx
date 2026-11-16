import { useMemo, useState } from "react";
import { fmt } from "../lib/format";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { get, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ACTIVITY, EQUIPMENT, GOALS, LEVELS } from "../lib/constants";
import type { Targets } from "../lib/types";
import { Backdrop, Logo } from "../components/Layout";
import { Button, Field } from "../components/ui";
import { useQuery } from "@tanstack/react-query";

function Choice({ options, value, onChange }: { options: Record<string, string>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      {Object.entries(options).map(([k, v]) => (
        <button
          type="button"
          key={k}
          onClick={() => onChange(k)}
          className={clsx(
            "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition",
            value === k ? "border-primary bg-primary-soft" : "border-border bg-surface-2 hover:border-primary/50",
          )}
        >
          {v} {value === k && <Check size={16} className="text-primary-strong" />}
        </button>
      ))}
    </div>
  );
}

export default function Onboarding() {
  const { user, refresh, signOut } = useAuth();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({
    name: user?.name || "",
    age: 22,
    gender: "male",
    height_cm: 170,
    weight_kg: 65,
    goal: "muscle",
    level: "beginner",
    activity_level: "moderate",
    training_days: 3,
    equipment: "gym",
    injuries: "",
  });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));

  const q = useMemo(
    () => `/api/profile/targets/preview?weight_kg=${f.weight_kg}&height_cm=${f.height_cm}&age=${f.age}&gender=${f.gender}&goal=${f.goal}&activity_level=${f.activity_level}`,
    [f.weight_kg, f.height_cm, f.age, f.gender, f.goal, f.activity_level],
  );
  const { data: preview } = useQuery({ queryKey: ["preview", q], queryFn: () => get<Targets & { tdee: number; bmr: number }>(q), enabled: step === 3 });

  const steps = [
    {
      title: "Chào bạn! Bắt đầu với vài thông tin cơ bản",
      body: (
        <div className="space-y-3">
          <Field label="Tên hiển thị">
            <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tuổi">
              <input className="input" type="number" min={10} max={100} value={f.age} onChange={(e) => set("age", +e.target.value)} />
            </Field>
            <Field label="Giới tính">
              <select className="input" value={f.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="male">Nam</option>
                <option value="female">Nữ</option>
                <option value="other">Khác</option>
              </select>
            </Field>
            <Field label="Chiều cao (cm)">
              <input className="input" type="number" min={100} max={250} value={f.height_cm} onChange={(e) => set("height_cm", +e.target.value)} />
            </Field>
            <Field label="Cân nặng (kg)">
              <input className="input" type="number" step="0.1" min={25} max={300} value={f.weight_kg} onChange={(e) => set("weight_kg", +e.target.value)} />
            </Field>
          </div>
        </div>
      ),
    },
    { title: "Mục tiêu chính của bạn là gì?", body: <Choice options={GOALS} value={f.goal} onChange={(v) => set("goal", v)} /> },
    {
      title: "Trình độ & điều kiện tập luyện",
      body: (
        <div className="space-y-4">
          <Field label="Trình độ">
            <Choice options={LEVELS} value={f.level} onChange={(v) => set("level", v)} />
          </Field>
          <Field label="Bạn tập ở đâu?">
            <Choice options={EQUIPMENT} value={f.equipment} onChange={(v) => set("equipment", v)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Số buổi tập / tuần">
              <input className="input" type="number" min={0} max={7} value={f.training_days} onChange={(e) => set("training_days", +e.target.value)} />
            </Field>
            <Field label="Mức vận động">
              <select className="input" value={f.activity_level} onChange={(e) => set("activity_level", e.target.value)}>
                {Object.entries(ACTIVITY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Chấn thương / lưu ý sức khỏe (không bắt buộc)" hint="Các agent sẽ tránh bài gây ảnh hưởng.">
            <textarea className="input" rows={2} value={f.injuries} onChange={(e) => set("injuries", e.target.value)} placeholder="Vd: từng đau lưng dưới, huyết áp cao..." />
          </Field>
        </div>
      ),
    },
    {
      title: "Mục tiêu dinh dưỡng mỗi ngày của bạn",
      body: preview ? (
        <div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Năng lượng", `${fmt(preview.calories)} kcal`],
              ["Đạm (protein)", `${preview.protein} g`],
              ["Tinh bột", `${preview.carbs} g`],
              ["Chất béo", `${preview.fat} g`],
              ["Nước", `${fmt(preview.water_ml / 1000, 1)} L`],
              ["TDEE", `${preview.tdee} kcal`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[18px] bg-surface-2 p-3.5">
                <p className="text-xs text-muted">{k}</p>
                <p className="num num-accent text-[22px] font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Tính theo công thức Mifflin-St Jeor: BMR {preview.bmr} kcal × hệ số vận động = TDEE, rồi điều chỉnh theo mục tiêu. Bạn có thể sửa trong Cài đặt bất cứ lúc nào.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">Đang tính...</p>
      ),
    },
  ];

  const finish = async () => {
    setBusy(true);
    setErr("");
    try {
      await post("/api/profile/onboard", f);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const s = steps[step];
  return (
    <div className="immersive relative flex min-h-full items-center justify-center p-4">
      <Backdrop />
      <div className="card rise relative z-10 w-full max-w-lg rounded-[30px] p-6 sm:p-9">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <button className="text-xs text-muted hover:text-text" onClick={signOut}>
            Đăng xuất
          </button>
        </div>
        <div className="mb-5 flex gap-1.5">
          {steps.map((_, i) => (
            <div key={i} className={clsx("h-1.5 flex-1 rounded-full transition-colors duration-500", i <= step ? "bg-volt" : "bg-surface-3")} />
          ))}
        </div>
        <h2 className="mb-5 text-[26px] font-bold leading-tight tracking-[-0.03em]">{s.title}</h2>
        {s.body}
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <div className="mt-6 flex justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)} icon={<ArrowLeft size={16} />}>
            Quay lại
          </Button>
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !f.name.trim()}>
              Tiếp tục <ArrowRight size={16} />
            </Button>
          ) : (
            <Button onClick={finish} loading={busy} icon={<Check size={16} />}>
              Bắt đầu dùng FitBro
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
