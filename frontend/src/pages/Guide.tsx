import { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useApi } from "../lib/hooks";
import { TOOL_LABELS } from "../lib/constants";
import type { AgentKey } from "../lib/types";
import { AgentAvatar } from "../components/AgentAvatar";
import { Card, PageHeader } from "../components/ui";

interface AgentInfo { name: string; title: string; color: string; domain: string; tools: { name: string; description: string }[] }

const SECTIONS: { t: string; items: [string, string][] }[] = [
  {
    t: "Bắt đầu nhanh (5 phút)",
    items: [
      ["1. Check-in buổi sáng (Hôm nay)", "Trả lời 5 câu hỏi về giấc ngủ, mệt mỏi, đau cơ, căng thẳng → ra Điểm sẵn sàng 0–100. Trang Tổng quan cập nhật ngay lập tức."],
      ["2. Ghi bữa ăn (Dinh dưỡng)", "Chụp ảnh món ăn, gõ 1 câu mô tả, hoặc chọn từ thư viện món Việt. HeadBro tính calo/macro, bạn kiểm tra rồi bấm Lưu. Phân tích được lưu lại để xem bất cứ lúc nào."],
      ["3. Tập luyện", "Chọn chương trình (Leg/Chest/Arm Workout...) hoặc nhờ HeadBro tạo buổi riêng. Bấm Bắt đầu tập: mỗi bài có 10 giây chuẩn bị, ghi từng set, đồng hồ nghỉ tự động."],
      ["4. Nhập chỉ số cơ thể (InBody)", "Nhập cân nặng/số đo hoặc chụp phiếu InBody để HeadBro đọc. Sau đó đặt mục tiêu (tự nhập hoặc cùng HeadBro)."],
    ],
  },
  {
    t: "Tổng quan",
    items: [
      ["Điểm sẵn sàng", "Lấy từ check-in hôm nay. Bấm vào để sang trang Hôm nay xem chi tiết từng thành phần."],
      ["Báo cáo thống kê", "Chọn kỳ 7 ngày / 30 ngày / quý / năm. Bấm vào từng ô (buổi tập, khối lượng, PR, cân nặng, calo, sẵn sàng) để xem biểu đồ và bảng chi tiết."],
      ["Bản đồ nhiệt cơ bắp", "Tô màu nhóm cơ theo số set đã tập trong khoảng thời gian chọn: xanh dương = ít, xanh lá = vừa, cam = nhiều, đỏ = rất nhiều. Cơ chính của bài tính 1 set, cơ phụ 0.5 set."],
      ["Nghe tóm tắt", "Đọc to bản tóm tắt dashboard (sẵn sàng, ăn uống, tập luyện tuần, nước, streak) bằng giọng tiếng Việt của trình duyệt. Nội dung tạo từ dữ liệu thật, không qua AI nên không bịa số."],
      ["Xuất PDF", "Mở hộp thoại in của trình duyệt → chọn 'Lưu dưới dạng PDF'."],
    ],
  },
  {
    t: "Tập luyện & Camera AI",
    items: [
      ["Chương trình tập", "10 chương trình 4–5 bài kiểu các app gym, kèm thời gian ước tính. Buổi do HeadBro tạo cũng xuất hiện ở mục 'Buổi tập của tôi'."],
      ["Bản đồ cơ (AI gợi ý)", "Bấm vào một nhóm cơ → HeadBro chọn 3–4 bài phù hợp dựa trên số set nhóm cơ đó 7 ngày qua, điểm sẵn sàng, đạm đã ăn, cân nặng, trình độ, dụng cụ và chấn thương. Bấm 'Tập ngay' để vào buổi tập."],
      ["Buổi tập trực tiếp", "Bỏ chọn bài muốn bỏ qua (bài phục hồi chỉ cần chọn 1–3 bài). Đếm ngược 10 giây trước mỗi bài, nhập tạ/rep, nghỉ có hẹn giờ (+/−15s), gợi ý tăng tải lũy tiến từ lần tập trước, báo PR ngay khi phá kỷ lục."],
      ["Tăng tải lũy tiến", "Nếu lần trước đạt đủ rep mục tiêu ở mọi set → tăng tạ (bài đa khớp như squat, đẩy ngực +2,5kg; bài đơn khớp +1kg). Chưa đủ → giữ tạ, cố thêm 1 rep."],
      ["Camera AI", "Hỗ trợ squat, lunge, push-up, curl, shoulder press, deadlift, plank, jumping jack. AI (MediaPipe) nhận diện 33 khớp, đo góc khớp để đếm rep và chấm điểm form, nhắc lỗi bằng giọng nói. Video chỉ xử lý trên máy bạn."],
      ["PR (kỷ lục)", "Tính bằng 1RM ước tính theo công thức Epley: tạ × (1 + rep/30). Nhờ vậy so sánh được 100kg×5 với 90kg×8."],
    ],
  },
  {
    t: "Hôm nay",
    items: [
      ["Công thức điểm sẵn sàng", "Ngủ 25% + chất lượng ngủ 15% + mệt mỏi 25% + đau cơ 20% + căng thẳng 15%. ≥80 tập nặng · 60–79 bình thường · 40–59 giảm 20–30% khối lượng · <40 nghỉ/phục hồi."],
      ["HeadBro giúp gì ở đây?", "HeadBro đọc điểm sẵn sàng trước khi soạn buổi tập: thấp → bớt set hoặc chuyển sang Recovery & Mobility; cao → gợi ý tăng tạ. Bấm 'Hôm nay nên tập gì?' để hỏi trực tiếp."],
      ["Streak & huy hiệu", "Streak tăng khi trong ngày có check-in, tập, ghi bữa ăn hoặc uống nước. Huy hiệu tính tự động từ dữ liệu thật."],
      ["Cardio / HIIT", "Bấm thẻ HIIT để vào buổi tập có đồng hồ 40s làm / 20s nghỉ và giọng PT đếm giờ."],
    ],
  },
  {
    t: "Dữ liệu & tài khoản",
    items: [
      ["Lưu ở đâu?", "Toàn bộ dữ liệu lưu trên server theo tài khoản (không còn localStorage như bản cũ) → đăng nhập máy khác vẫn thấy."],
      ["Tự đăng nhập", "Sau khi đăng nhập (email hoặc Google), FitBro nhớ bạn 30 ngày."],
      ["Xoá sạch dữ liệu", "Trong Cài đặt → Dữ liệu. Có thể xuất toàn bộ dữ liệu ra file JSON trước khi xoá."],
    ],
  },
];

function Section({ t, items }: { t: string; items: [string, string][] }) {
  const [open, setOpen] = useState(true);
  return (
    <Card>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold">
        {t} <ChevronDown size={18} className={clsx("transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 px-5 pb-5">
          {items.map(([k, v]) => (
            <div key={k}>
              <p className="text-sm font-semibold">{k}</p>
              <p className="text-sm text-muted">{v}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Guide() {
  const { data } = useApi<Record<string, AgentInfo>>(["agents"], "/api/chat/agents", { staleTime: 3600_000 });
  return (
    <div className="space-y-5">
      <PageHeader title="Hướng dẫn sử dụng" subtitle="Mỗi tính năng làm gì, dựa trên dữ liệu nào và trả về gì" />
      <Card className="p-5">
        <p className="font-semibold">Hệ thống đa tác tử (multi-agent) hoạt động thế nào?</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li><b className="text-text">Safety Guard</b> kiểm tra tin nhắn trước: dấu hiệu cấp cứu, khủng hoảng tâm lý, rối loạn ăn uống, chất cấm → trả lời hướng dẫn an toàn, không chuyển cho agent.</li>
          <li><b className="text-text">Router</b> đọc tin nhắn + ngữ cảnh và chọn 1 (hoặc 2) agent phù hợp. Bạn thấy lý do định tuyến ngay trên tin nhắn. Có thể chọn agent cố định bằng nút phía trên ô chat.</li>
          <li><b className="text-text">Agent chuyên môn</b> suy nghĩ và gọi <i>công cụ</i> để đọc dữ liệu thật của bạn (lịch sử tập, bữa ăn, chỉ số...) rồi mới trả lời → không bịa số liệu. Bấm "Đã dùng N công cụ" để xem agent đã làm gì.</li>
          <li>Khi cần <b className="text-text">ghi dữ liệu</b> (bữa ăn, mục tiêu, cân nặng), agent chỉ tạo thẻ — bạn bấm <b className="text-text">Xác nhận</b> thì mới lưu (human-in-the-loop).</li>
          <li>Nếu 2 agent cùng trả lời, agent thứ 2 đọc câu trả lời của agent thứ nhất, sau đó <b className="text-text">HeadBro tổng kết</b>.</li>
        </ol>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {data &&
          (Object.entries(data) as [AgentKey, AgentInfo][]).map(([k, a]) => (
            <Card key={k} className="p-5">
              <div className="flex items-center gap-2.5">
                <AgentAvatar agent={k} real />
                <div>
                  <p className="font-semibold" style={{ color: a.color }}>{a.name}</p>
                  <p className="text-xs text-muted">{a.title}</p>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted">{a.domain}</p>
              <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Công cụ ({a.tools.length})</p>
              <ul className="space-y-0.5 text-[13px]">
                {a.tools.map((t) => (
                  <li key={t.name} title={t.description}>• {TOOL_LABELS[t.name] || t.name}</li>
                ))}
              </ul>
            </Card>
          ))}
      </div>
      {SECTIONS.map((s) => (
        <Section key={s.t} {...s} />
      ))}
    </div>
  );
}
