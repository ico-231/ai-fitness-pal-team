/**
 * Nội dung tab Hướng dẫn — vừa giới thiệu tính năng vừa chỉ cách dùng từng bước.
 * Sửa chữ ở đây, không cần đụng giao diện (pages/Guide.tsx).
 *
 * Quy ước: **chữ đậm** = tên nút / mục đúng như trên màn hình.
 * Mỗi thẻ: intro (là gì) · when (dùng khi nào) · steps (các bước) · tips (mẹo) · notes (lưu ý) · link (mở trang).
 */

export type Visual = "readiness" | "heat" | "camera" | "macros" | "overload";

export interface GuideCard {
  id: string;
  title: string;
  intro: string;
  when?: string;
  steps: string[];
  tips?: string[];
  notes?: string[];
  /** từ khoá ẩn để tìm kiếm (từ đồng nghĩa, cách gọi khác) */
  keywords?: string;
  link?: { to: string; label: string };
  /** câu hỏi mẫu: bấm là mở HeadBro với câu này */
  ask?: string[];
  visual?: Visual;
}

export interface GuideChapter {
  id: string;
  title: string;
  icon: string;
  blurb: string;
  cards: GuideCard[];
}

export interface Trouble {
  id: string;
  group: string;
  symptom: string;
  cause: string;
  fix: string[];
  keywords?: string;
  link?: { to: string; label: string };
}

export const INTRO =
  "FitBro là huấn luyện viên cá nhân bằng AI: lên buổi tập, đếm rep bằng camera, tính calo từ ảnh món Việt và theo dõi cơ thể bạn mỗi ngày. Mọi lời khuyên dựa trên dữ liệu thật bạn ghi, không bịa số.";

export const HIGHLIGHTS: { icon: string; title: string; text: string; chapter: string }[] = [
  { icon: "sparkles", title: "Trợ lý HeadBro", text: "Hỏi gì cũng được, nhờ ghi bữa ăn, soạn buổi tập, đặt mục tiêu", chapter: "headbro" },
  { icon: "dumbbell", title: "Buổi tập có PT ảo", text: "Đếm ngược, đồng hồ nghỉ, giọng nhắc, gợi ý tăng tạ", chapter: "tap-luyen" },
  { icon: "camera", title: "Camera AI", text: "Đếm rep, chấm điểm form ngay trên máy, không gửi video đi", chapter: "camera" },
  { icon: "salad", title: "Quét ảnh món Việt", text: "Chụp món ăn → calo, đạm, tinh bột, béo", chapter: "dinh-duong" },
  { icon: "gauge", title: "Điểm sẵn sàng", text: "Check-in 30 giây biết hôm nay nên tập nặng hay nhẹ", chapter: "hom-nay" },
  { icon: "scale", title: "InBody & mục tiêu", text: "Chụp phiếu InBody, theo dõi mỡ/cơ, tự báo khi đạt mục tiêu", chapter: "inbody" },
];

export const CHAPTERS: GuideChapter[] = [
  // ------------------------------------------------------------------ 0
  {
    id: "bat-dau",
    title: "Bắt đầu",
    icon: "rocket",
    blurb: "Tạo tài khoản, khai báo hồ sơ và làm quen cách đi lại trong app.",
    cards: [
      {
        id: "dang-ky",
        title: "Tạo tài khoản và đăng nhập",
        intro: "Mỗi tài khoản có dữ liệu riêng, lưu trên máy chủ — đổi điện thoại hay máy tính vẫn thấy đủ.",
        when: "Lần đầu dùng FitBro, hoặc đăng nhập trên thiết bị mới.",
        steps: [
          "Ở màn đăng nhập, chọn **Đăng ký** (lần đầu) hoặc **Đăng nhập** (đã có tài khoản).",
          "Nhập tên, email và mật khẩu (tối thiểu 6 ký tự), rồi bấm **Tạo tài khoản**.",
          "Hoặc bấm **Tiếp tục với Google** (nếu nút hiển thị) để đăng nhập bằng tài khoản Google.",
        ],
        tips: ["FitBro nhớ đăng nhập 30 ngày trên mỗi trình duyệt, không cần gõ lại mật khẩu mỗi lần."],
        notes: ["Đăng nhập bằng Google thì chưa có mật khẩu riêng — có thể đặt sau trong **Cài đặt → Đổi mật khẩu**."],
        keywords: "dang nhap dang ky tai khoan login sign up google mat khau",
      },
      {
        id: "ho-so",
        title: "Hoàn thiện hồ sơ (3 bước đầu tiên)",
        intro: "Hồ sơ giúp FitBro tính calo, đạm, nước mỗi ngày và chọn bài tập hợp với bạn.",
        when: "Ngay sau khi tạo tài khoản — app tự mở màn này.",
        steps: [
          "Bước 1: nhập tên hiển thị, tuổi, giới tính, chiều cao, cân nặng → **Tiếp tục**.",
          "Bước 2: chọn mục tiêu chính (tăng cơ, giảm mỡ, giữ dáng, sức bền, sức khoẻ), trình độ, mức vận động, nơi tập (phòng gym / tại nhà / không dụng cụ), số buổi mỗi tuần và ghi chấn thương nếu có → **Tiếp tục**.",
          "Bước 3: xem mục tiêu dinh dưỡng mỗi ngày app tự tính (năng lượng, đạm, tinh bột, chất béo, nước) → **Bắt đầu dùng FitBro**.",
        ],
        tips: [
          "Ghi rõ chấn thương (vd \"từng đau lưng dưới\") để HeadBro tránh bài gây ảnh hưởng.",
          "Sửa lại bất cứ lúc nào trong **Cài đặt → Hồ sơ cá nhân** — mục tiêu dinh dưỡng tự tính lại.",
        ],
        keywords: "onboarding ho so thong tin ca nhan chieu cao can nang muc tieu",
        link: { to: "/settings", label: "Mở Cài đặt" },
      },
      {
        id: "mot-ngay",
        title: "Một ngày dùng FitBro điển hình",
        intro: "Mất khoảng 5 phút mỗi ngày để FitBro hiểu bạn và đưa lời khuyên đúng.",
        steps: [
          "Sáng: mở **Hôm nay** → check-in 30 giây để có điểm sẵn sàng.",
          "Bữa ăn: chụp ảnh món ăn ở **Dinh dưỡng** (hoặc nói với HeadBro \"trưa nay mình ăn…\").",
          "Chiều/tối: vào **Tập luyện** → tập theo lịch hoặc theo gợi ý \"Hôm nay nên tập gì\".",
          "Trong ngày: bấm +250 ml mỗi lần uống nước.",
          "Tối: xem **Tổng quan** hoặc bấm loa để nghe tóm tắt ngày.",
        ],
        tips: ["Chỉ cần làm 1 việc mỗi ngày (check-in, ghi bữa, tập hoặc uống nước) là giữ được chuỗi ngày."],
        keywords: "mot ngay thoi quen quy trinh bat dau nhanh",
      },
      {
        id: "di-lai",
        title: "Đi lại trong app",
        intro: "Mọi trang đều cách nhau 1 lần bấm.",
        steps: [
          "Máy tính: thanh dọc bên trái chia 2 khối. Khối trên: Tổng quan, Trợ lý AI, Tập luyện, Hôm nay, Dinh dưỡng, InBody. Khối dưới: Hướng dẫn, Cài đặt và ảnh đại diện (đăng xuất). Đổi sáng/tối trong **Cài đặt → Giao diện & nhắc nhở**.",
          "Điện thoại: thanh điều hướng ở đáy màn hình; các trang còn lại ở nút menu góc trên.",
          "Nút **Hỏi AI** nổi ở góc dưới phải: mở HeadBro ở bất kỳ trang nào.",
          "Nút **?** cạnh tiêu đề mỗi trang: mở đúng phần hướng dẫn của trang đó.",
        ],
        keywords: "menu dieu huong thanh ben trai sidebar dang xuat",
      },
    ],
  },
  // ------------------------------------------------------------------ 1
  {
    id: "headbro",
    title: "Trợ lý HeadBro",
    icon: "sparkles",
    blurb: "Một trợ lý duy nhất cho mọi câu hỏi về tập luyện, ăn uống và tiến độ.",
    cards: [
      {
        id: "headbro-la-ai",
        title: "HeadBro là ai?",
        intro: "HeadBro là trợ lý AI của FitBro. Phía sau có chuyên gia tập luyện và chuyên gia dinh dưỡng — HeadBro tự chuyển câu hỏi cho đúng người, bạn không cần chọn.",
        when: "Bất cứ khi nào bạn có câu hỏi, cần lời khuyên hoặc muốn ghi dữ liệu nhanh bằng lời.",
        steps: [
          "HeadBro trả lời dựa trên dữ liệu của bạn (lịch sử tập, bữa ăn, chỉ số cơ thể, điểm sẵn sàng).",
          "Câu trả lời có nhãn nhỏ cho biết chuyên gia nào đã xử lý.",
        ],
        notes: ["HeadBro không thay bác sĩ. Câu hỏi về bệnh, thuốc hay cấp cứu sẽ được trả lời bằng hướng dẫn an toàn."],
        keywords: "ai tro ly chatbot coachbro nutribro chuyen gia",
      },
      {
        id: "hoi-headbro",
        title: "Hỏi HeadBro thế nào",
        intro: "Gõ, nói hoặc gửi ảnh — như nhắn tin với một huấn luyện viên.",
        steps: [
          "Mở trang **Trợ lý AI**, hoặc bấm nút **Hỏi AI** ở bất kỳ trang nào (HeadBro biết bạn đang xem trang gì).",
          "Gõ câu hỏi vào ô **Nhắn cho HeadBro...** rồi bấm Enter.",
          "Muốn nói thay vì gõ: bấm biểu tượng micro (Chrome/Edge).",
          "Muốn gửi ảnh (món ăn, phiếu InBody): bấm biểu tượng ảnh cạnh ô nhập.",
          "Đang trả lời mà muốn dừng: bấm **Dừng trả lời**.",
        ],
        tips: ["Hỏi càng cụ thể càng tốt: \"Tạo buổi tập tay 45 phút, chỉ có tạ đơn\" tốt hơn \"tập gì\"."],
        ask: [
          "Hôm nay mình còn thiếu bao nhiêu đạm, nên ăn gì?",
          "Tạo buổi tập tay 45 phút cho mình",
          "Lên thực đơn món Việt cho cả ngày hôm nay",
        ],
        keywords: "chat nhan tin hoi dap micro giong noi gui anh",
        link: { to: "/chat", label: "Mở Trợ lý AI" },
      },
      {
        id: "headbro-ghi",
        title: "Nhờ HeadBro ghi dữ liệu",
        intro: "Nói bằng lời, HeadBro điền sẵn — bạn chỉ cần xác nhận.",
        when: "Lười mở từng trang: ghi bữa ăn, cân nặng, mục tiêu, lịch tập tuần hay tạo buổi tập mới.",
        steps: [
          "Nhắn ví dụ: \"Trưa nay mình ăn 1 tô bún bò Huế\" hoặc \"Sáng nay mình cân 68,5kg\".",
          "HeadBro hiện một thẻ với số liệu đã tính.",
          "Kiểm tra lại, bấm **Xác nhận** để lưu. Bấm huỷ thì không có gì được lưu.",
        ],
        notes: ["HeadBro không bao giờ tự lưu dữ liệu khi chưa có bạn xác nhận."],
        ask: ["Trưa nay mình ăn 1 tô bún bò Huế, ghi lại giúp mình", "Lên lịch tập cả tuần cho mình"],
        keywords: "ghi bua an qua chat xac nhan the luu",
      },
      {
        id: "doc-tra-loi",
        title: "Đọc câu trả lời",
        intro: "Câu trả lời không chỉ là chữ — có thẻ bài tập, thẻ món ăn, nguồn tham khảo.",
        steps: [
          "Thẻ bài tập/buổi tập: bấm để xem chi tiết hoặc **Tập ngay**.",
          "Thẻ món ăn, thực đơn: xem calo/macro, ghi nhanh vào nhật ký.",
          "Nút **Đọc to** để nghe, **Sao chép** để copy câu trả lời.",
          "Cuối câu trả lời có câu hỏi gợi ý tiếp theo — bấm là hỏi luôn.",
        ],
        keywords: "the bai tap nguon tham khao doc to sao chep goi y",
      },
      {
        id: "tao-lai",
        title: "Tạo lại hoặc sửa câu hỏi",
        intro: "Chưa ưng câu trả lời? Cho HeadBro trả lời lại, hoặc sửa câu hỏi cho rõ hơn.",
        steps: [
          "Câu trả lời cuối cùng có nút **Tạo lại** → HeadBro trả lời lại câu hỏi đó.",
          "Rê chuột lên câu hỏi của bạn (điện thoại: nút hiện sẵn) → bấm bút chì **Sửa câu hỏi**.",
          "Sửa xong bấm Enter (hoặc **Gửi lại**); Esc để huỷ.",
        ],
        notes: ["Khi sửa câu hỏi, các tin nhắn phía sau câu đó được thay bằng câu trả lời mới."],
        keywords: "tao lai regenerate sua cau hoi edit",
      },
      {
        id: "lich-su-chat",
        title: "Lịch sử trò chuyện",
        intro: "Mọi cuộc trò chuyện được lưu để xem lại.",
        steps: [
          "Ở trang **Trợ lý AI**, bấm **Lịch sử** ở góc trên khung chat.",
          "Gõ để tìm theo tên, bấm một dòng để mở lại.",
          "Đổi tên hoặc xoá cuộc trò chuyện bằng các nút trên từng dòng.",
          "Bấm **Cuộc trò chuyện mới** để bắt đầu chủ đề khác.",
        ],
        keywords: "lich su hoi thoai cuoc tro chuyen moi doi ten xoa",
        link: { to: "/chat", label: "Mở Trợ lý AI" },
      },
      {
        id: "gioi-han-ai",
        title: "Giới hạn và quyền riêng tư",
        intro: "Để giữ chi phí và an toàn, AI có giới hạn mỗi ngày.",
        steps: [
          "Tối đa 150 tin chat với HeadBro mỗi ngày.",
          "Tối đa 40 lượt AI khác mỗi ngày: phân tích ảnh/mô tả bữa ăn, đọc phiếu InBody, gợi ý bài theo nhóm cơ.",
          "Hết lượt: vẫn nhập tay, chọn món từ thư viện và tập bình thường; gợi ý bài tự chuyển sang cách chọn theo luật. Lượt mới mở vào ngày hôm sau.",
        ],
        notes: [
          "HeadBro không nhận tên và email của bạn.",
          "Video Camera AI xử lý ngay trên máy, không gửi lên máy chủ.",
        ],
        keywords: "gioi han luot ai het luot 150 40 rieng tu bao mat",
      },
    ],
  },
  // ------------------------------------------------------------------ 2
  {
    id: "tong-quan",
    title: "Tổng quan",
    icon: "layout",
    blurb: "Một màn hình cho cả ngày: sẵn sàng, ăn uống, tập luyện, cơ thể và nhắc nhở.",
    cards: [
      {
        id: "tong-quan-co-gi",
        title: "Trang Tổng quan cho biết gì",
        intro: "Mở app là thấy ngay hôm nay bạn đang ở đâu.",
        steps: [
          "Lời chào và việc nên làm tiếp theo (vd \"Check-in để bắt đầu ngày mới\").",
          "Thẻ **Điểm sẵn sàng** và lịch tập hôm nay — bấm **Check-in** hoặc **Bắt đầu tập**.",
          "Vòng **Hôm nay**: calo, đạm, nước và buổi tập đã làm.",
          "Bản đồ cơ ở giữa, **Kỷ lục cá nhân** và **Mục tiêu** bên phải.",
          "Ô **Hỏi HeadBro** ở dưới cùng để hỏi nhanh.",
        ],
        keywords: "dashboard trang chu tong quan",
        link: { to: "/", label: "Mở Tổng quan" },
      },
      {
        id: "ban-do-co",
        title: "Đọc bản đồ cơ",
        intro: "Hình người tô màu theo số set bạn đã tập cho từng nhóm cơ — nhìn là biết nhóm nào đang bị bỏ quên.",
        steps: [
          "Chọn khoảng thời gian ở trên hình: **7 ngày**, **Tháng**, **Quý**, **Năm**.",
          "Đọc màu theo chú giải bên dưới (xám → xanh dương → xanh lá → cam → đỏ).",
          "Rê chuột lên một cơ để xem đúng số set.",
          "Các nhãn ghim cạnh hình là nhóm cơ tập nhiều nhất.",
        ],
        tips: ["Khoảng 10–20 set mỗi nhóm cơ mỗi tuần là vùng tăng cơ hiệu quả."],
        notes: ["Cơ chính của bài tính 1 set, cơ phụ tính 0,5 set. Set khởi động không được tính."],
        visual: "heat",
        keywords: "ban do nhiet heatmap mau nhom co set",
      },
      {
        id: "nhac-nho",
        title: "HeadBro nhắc bạn",
        intro: "FitBro tự soi dữ liệu và nhắc khi có điều cần chú ý — không cần hỏi.",
        steps: [
          "Thiếu đạm mấy ngày gần đây, ăn vượt/thiếu calo so với mục tiêu.",
          "Lâu chưa tập một nhóm cơ lớn (chân, lưng, ngực, vai).",
          "Tuần này tập thiếu buổi so với kế hoạch.",
          "Sắp mất chuỗi ngày, uống ít nước buổi chiều.",
          "Cân nặng đi ngược mục tiêu trong 2 tuần.",
          "Mục tiêu sắp hết hạn hoặc đã quá hạn.",
          "Tin vui: vừa phá kỷ lục.",
        ],
        tips: ["Mỗi nhắc nhở có nút làm ngay (vd **Ghi nước**) hoặc hỏi HeadBro cách xử lý."],
        keywords: "nhac nho goi y canh bao insight",
      },
      {
        id: "bao-cao",
        title: "Báo cáo thống kê",
        intro: "Xem tiến bộ theo tuần, tháng, quý, năm.",
        steps: [
          "Kéo xuống phần **Báo cáo thống kê** ở Tổng quan, chọn kỳ.",
          "Bấm vào từng ô (Buổi tập, Khối lượng, PR mới, Cân nặng, Calo TB/ngày, Sẵn sàng TB) để mở biểu đồ và bảng chi tiết.",
        ],
        keywords: "bao cao thong ke bieu do tuan thang quy nam",
      },
      {
        id: "thao-tac-nhanh",
        title: "Thao tác nhanh, nghe tóm tắt, xuất PDF",
        intro: "Làm việc thường ngày mà không cần chuyển trang.",
        steps: [
          "Hàng biểu tượng cạnh ngày tháng: check-in sáng, ghi bữa ăn, tập luyện (rê chuột để xem tên). Nước uống và cân nặng ghi ở trang **Hôm nay**.",
          "Nút loa **Nghe tóm tắt hôm nay**: đọc to tình hình ngày bằng giọng tiếng Việt. Số liệu lấy thẳng từ dữ liệu, không qua AI.",
          "Nút in **Xuất báo cáo PDF**: chọn \"Lưu dưới dạng PDF\" trong hộp thoại in.",
        ],
        keywords: "nghe tom tat giong doc in pdf xuat bao cao them nuoc",
      },
    ],
  },
  // ------------------------------------------------------------------ 3
  {
    id: "hom-nay",
    title: "Hôm nay",
    icon: "sunrise",
    blurb: "Check-in buổi sáng, nước uống, chuỗi ngày và huy hiệu.",
    cards: [
      {
        id: "check-in",
        title: "Check-in buổi sáng",
        intro: "5 câu hỏi nhanh về giấc ngủ và cơ thể → điểm sẵn sàng 0–100 cho biết hôm nay nên tập nặng hay nhẹ.",
        when: "Mỗi sáng sau khi ngủ dậy, trước khi tập.",
        steps: [
          "Mở **Hôm nay** (hoặc bấm **Check-in** ở Tổng quan).",
          "Kéo thanh số giờ ngủ đêm qua.",
          "Chọn mức 1–5 cho **Chất lượng giấc ngủ**, **Mức độ mệt mỏi**, **Đau nhức cơ (DOMS)**, **Căng thẳng**. Mọi thang đọc cùng một chiều: bên trái (1) là tệ nhất, bên phải (5) là tốt nhất.",
          "Tuỳ chọn: nhập **Cân nặng sáng nay** — cân sau khi thức dậy, trước khi ăn. Số này vào luôn biểu đồ cân nặng ở InBody.",
          "Ghi chú nếu cần (vd \"hơi đau vai trái\") → bấm **Tính điểm sẵn sàng**.",
        ],
        tips: ["Khai nhầm? Bấm nút **Xoá check-in hôm nay** rồi làm lại."],
        keywords: "check in buoi sang diem san sang giac ngu met moi",
        link: { to: "/daily", label: "Mở Hôm nay" },
      },
      {
        id: "diem-san-sang",
        title: "Điểm sẵn sàng nghĩa là gì",
        intro: "Một con số tóm tắt cơ thể bạn đã hồi phục tới đâu.",
        steps: [
          "Công thức: số giờ ngủ 25% + chất lượng ngủ 15% + mệt mỏi 25% + đau cơ 20% + căng thẳng 15%.",
          "≥ 80: sẵn sàng cao — tập nặng, thử phá kỷ lục.",
          "60–79: khá tốt — tập theo kế hoạch.",
          "40–59: trung bình — nên giảm khối lượng.",
          "< 40: cần phục hồi — nghỉ hoặc giãn cơ nhẹ.",
        ],
        tips: ["Điểm từ 59 trở xuống thì buổi tập tự đề xuất **bản nhẹ** (xem phần Tập luyện)."],
        visual: "readiness",
        keywords: "readiness cong thuc nguong diem",
      },
      {
        id: "nen-tap-gi",
        title: "Hôm nay nên tập gì?",
        intro: "Thẻ gộp lịch tập tuần và điểm sẵn sàng thành một lời khuyên duy nhất.",
        steps: [
          "Xem thẻ **Hôm nay nên tập gì?** ở trang Hôm nay (hoặc thẻ tương tự ở Tổng quan, Tập luyện).",
          "Bấm **Bắt đầu tập** để tập buổi theo lịch, hoặc **Chuyển sang bài phục hồi** khi cơ thể mệt.",
        ],
        keywords: "goi y buoi tap hom nay lich phuc hoi",
      },
      {
        id: "nuoc",
        title: "Ghi nước uống",
        intro: "Theo dõi lượng nước mỗi ngày so với mục tiêu tính theo cân nặng.",
        steps: [
          "Ở **Hôm nay**, bấm **+250 ml** hoặc **+500 ml** mỗi lần uống.",
          "Bấm nhầm: nút **−** (Bớt 250 ml).",
          "Vòng xanh cho biết đã đạt bao nhiêu % mục tiêu.",
        ],
        tips: ["Muốn nhắc uống nước định kỳ: bật trong **Cài đặt → Giao diện & nhắc nhở**."],
        keywords: "nuoc uong water ml lit",
        link: { to: "/daily", label: "Mở Hôm nay" },
      },
      {
        id: "chuoi-ngay",
        title: "Chuỗi ngày và lịch hoạt động",
        intro: "Đếm số ngày liên tiếp bạn có hoạt động — giúp giữ thói quen.",
        steps: [
          "Chuỗi tăng khi trong ngày có check-in, buổi tập, bữa ăn được ghi hoặc nước uống.",
          "Hôm nay chưa làm gì thì chuỗi vẫn giữ — chỉ mất nếu hết ngày mà không có hoạt động.",
          "Lịch hoạt động tô màu từng ngày: có tập, có ghi chép hay nghỉ.",
        ],
        keywords: "streak chuoi ngay lien tiep lich hoat dong",
      },
      {
        id: "huy-hieu",
        title: "Huy hiệu và cột mốc",
        intro: "Phần thưởng nhỏ khi đạt cột mốc, tính tự động từ dữ liệu thật.",
        steps: [
          "Xem ở mục **Huy hiệu & cột mốc** trang Hôm nay, kèm tiến độ còn thiếu.",
          "Ví dụ: buổi tập đầu tiên, 10/50 buổi tập, chuỗi 3/7/30 ngày, 7 lần check-in, 7 ngày đủ đạm, tổng 10 tấn khối lượng, điểm form ≥ 90, lần đo cơ thể đầu tiên.",
        ],
        keywords: "huy hieu badge thanh tich cot moc",
      },
    ],
  },
  // ------------------------------------------------------------------ 4
  {
    id: "tap-luyen",
    title: "Tập luyện",
    icon: "dumbbell",
    blurb: "Chọn buổi, tập có PT ảo dẫn dắt, ghi set, theo dõi kỷ lục và lịch tuần.",
    cards: [
      {
        id: "chon-buoi",
        title: "Trang Tập luyện có gì",
        intro: "Mọi thứ về tập luyện chia thành các tab trên một thanh.",
        steps: [
          "**Chương trình**: các buổi có sẵn (Leg, Chest, Back, Shoulder, Arm, Full Body, tại nhà, Core, HIIT, phục hồi).",
          "**Custom**: buổi bạn tự tạo hoặc HeadBro tạo.",
          "**Lịch tuần**: gắn buổi tập cho từng ngày.",
          "**Bản đồ cơ (AI gợi ý)**: bấm nhóm cơ để được gợi ý bài.",
          "**Thư viện bài tập**: hơn 1.300 bài có ảnh động minh hoạ.",
          "**Lịch sử & PR**: các buổi đã tập và kỷ lục.",
        ],
        keywords: "tab chuong trinh custom thu vien lich su",
        link: { to: "/workouts", label: "Mở Tập luyện" },
      },
      {
        id: "bat-dau-buoi",
        title: "Bắt đầu một buổi tập",
        intro: "Từ lúc chọn buổi tới lúc tập chỉ 2 lần bấm.",
        steps: [
          "Ở tab **Chương trình** hoặc **Custom**, bấm vào một buổi.",
          "Màn trước khi tập hiện danh sách bài, số set × rep, thời gian nghỉ và thời gian ước tính.",
          "Bấm **Bắt đầu (N bài)**.",
        ],
        tips: ["Bài có nhãn **Hỗ trợ Camera AI** sẽ đếm rep bằng camera."],
        keywords: "bat dau tap chon chuong trinh",
      },
      {
        id: "tuy-chinh",
        title: "Tuỳ chỉnh buổi trước khi tập",
        intro: "Không có máy? Muốn đổi bài? Sửa ngay trước khi bắt đầu.",
        steps: [
          "Bấm vào một bài để bỏ chọn (bỏ qua bài đó hôm nay).",
          "**Đổi**: thay bằng bài khác cùng nhóm cơ.",
          "**Xoá**: bỏ hẳn bài khỏi buổi. **Thêm bài liên quan**: thêm bài mới.",
          "Bấm **Lưu thay đổi** (buổi của bạn) hoặc **Lưu thành buổi Custom** (chương trình có sẵn — bản gốc giữ nguyên).",
        ],
        notes: ["Bài phục hồi/giãn cơ chỉ cần chọn 1–3 bài muốn tập."],
        keywords: "doi bai them bai xoa bai sua buoi tap",
      },
      {
        id: "trong-luc-tap",
        title: "Trong lúc tập: từng bước",
        intro: "FitBro dẫn bạn qua từng set như một PT đứng cạnh.",
        steps: [
          "Đếm ngược chuẩn bị (mặc định 10 giây): **+10 giây**, **Tạm dừng**, **Vào luôn**.",
          "Nhập mức tạ và số rep bằng nút −/+ (hoặc gõ số) → bấm **Hoàn thành set**.",
          "Đồng hồ nghỉ tự chạy: **−15s**, **+15s**, **Bỏ nghỉ**. Hết giờ có tiếng bíp và giọng nhắc.",
          "Bài tính giờ (plank…): đồng hồ đếm ngược, có **Tạm dừng** và **Xong sớm**.",
          "Thanh trên cùng: thời gian đã tập, bài thứ mấy; nút **Bỏ qua bài** và **Kết thúc**.",
        ],
        tips: ["Phá kỷ lục trong lúc tập, FitBro báo ngay."],
        keywords: "ghi set nhap ta rep dong ho nghi dem nguoc",
      },
      {
        id: "sua-set",
        title: "Sửa hoặc xoá set gõ nhầm",
        intro: "Gõ nhầm 100kg thành 1000kg? Sửa lại để kỷ lục và khối lượng không bị sai.",
        steps: [
          "Dưới nút ghi set có danh sách **Đã ghi ở bài này**.",
          "Bấm bút chì cạnh set → sửa số → bấm dấu ✓ để lưu.",
          "Bấm thùng rác để xoá set → xác nhận **Xoá set**.",
        ],
        notes: [
          "Kỷ lục và tổng khối lượng tự tính lại.",
          "Xoá một set thì sau giờ nghỉ app cho bạn làm lại đúng set đó.",
        ],
        keywords: "sua set xoa set go nham sai so lieu",
      },
      {
        id: "khoi-dong",
        title: "Set khởi động",
        intro: "Làm nóng với tạ nhẹ mà không làm sai số liệu.",
        steps: [
          "Trước set chính đầu tiên của bài, tích ô **Set khởi động**.",
          "Nhập tạ nhẹ → bấm **Ghi set khởi động**. Sau đó nghỉ ngắn (tối đa 60 giây).",
          "Làm bao nhiêu set khởi động cũng được, rồi bỏ tích để vào set chính.",
        ],
        notes: ["Set khởi động không tính vào số set, khối lượng, kỷ lục và bản đồ cơ."],
        keywords: "khoi dong warm up lam nong",
      },
      {
        id: "ban-nhe",
        title: "Bản nhẹ khi cơ thể mệt",
        intro: "Điểm sẵn sàng thấp, FitBro tự đề xuất buổi nhẹ hơn để tránh quá tải.",
        when: "Bạn đã check-in sáng nay và điểm sẵn sàng từ 59 trở xuống.",
        steps: [
          "Màn trước khi tập hiện thẻ điểm sẵn sàng, công tắc **Dùng bản nhẹ** bật sẵn.",
          "Mức Trung bình (40–59): bớt 1 set mỗi bài, tạ gợi ý giảm 10%.",
          "Mức Cần phục hồi (< 40): còn nửa số set, tạ gợi ý giảm 20%.",
          "Muốn tập như bình thường: tắt công tắc trước khi bấm Bắt đầu.",
        ],
        notes: ["Chương trình gốc giữ nguyên, chỉ buổi hôm nay nhẹ đi. Lịch sử ghi tên buổi kèm \"(bản nhẹ)\"."],
        keywords: "ban nhe giam tai met diem san sang thap deload",
      },
      {
        id: "tang-tai",
        title: "Gợi ý tăng tạ (tăng tải lũy tiến)",
        intro: "Muốn tiến bộ, mỗi lần tập phải nặng hơn một chút — FitBro tính giúp bạn.",
        steps: [
          "Ở set đầu của mỗi bài, khung **Tăng tải lũy tiến** cho biết hôm nay nên dùng mức nào.",
          "Lần trước đủ số rep mục tiêu ở mọi set → tăng tạ: bài nhiều khớp (squat, đẩy ngực…) +2,5kg, bài một khớp +1kg.",
          "Chưa đủ rep → giữ mức tạ, cố thêm 1 rep mỗi set.",
          "Bài không tạ: thêm 1 rep. Bài giữ (plank): thêm 5 giây khi đã giữ đủ.",
        ],
        tips: ["Mốc rep lấy đúng theo chương trình bạn đang tập (5 rep, 8 rep, 12 rep…)."],
        visual: "overload",
        keywords: "tang ta tang tai luy tien progressive overload goi y muc ta",
      },
      {
        id: "ky-luc",
        title: "Kỷ lục cá nhân (PR)",
        intro: "FitBro tự nhận ra mỗi khi bạn mạnh hơn trước.",
        steps: [
          "Bài có tạ: so bằng **1RM ước tính** = tạ × (1 + rep ÷ 30). Nhờ vậy so được 100kg × 5 với 90kg × 8.",
          "Bài không tạ (hít đất, kéo xà…): so số rep nhiều nhất.",
          "Bài giữ (plank…): so số giây lâu nhất.",
          "Xem tất cả ở tab **Lịch sử & PR** hoặc thẻ **Kỷ lục cá nhân** ở Tổng quan. Bấm vào một bài để xem biểu đồ tăng tiến.",
        ],
        keywords: "pr ky luc 1rm epley",
      },
      {
        id: "tien-do-ta",
        title: "Theo dõi mức tạ tăng dần từng bài",
        intro: "Biểu đồ cho thấy mức tạ của bạn ở một bài tăng thế nào qua từng buổi — động lực rõ ràng nhất khi tập lâu dài.",
        when: "Bạn tập một bài đều đặn (vd squat, đẩy ngực) và muốn biết mình có đang tiến bộ không.",
        steps: [
          "Tab **Lịch sử & PR** → bấm một bài trong **Kỷ lục cá nhân**; hoặc mở bài bất kỳ đã từng tập trong **Thư viện bài tập**.",
          "Khung **Tiến độ mức tạ** vẽ 2 đường: **Mức tạ nặng nhất** mỗi buổi và **1RM ước tính**.",
          "Nhãn xanh/đỏ góc phải cho biết tăng hay giảm bao nhiêu kg (và %) từ buổi đầu tới buổi gần nhất.",
          "Bài không tạ hiện số rep tốt nhất, bài giữ (plank) hiện số giây.",
        ],
        notes: ["Set khởi động không được tính. Cần ít nhất 2 buổi để có đường biểu đồ."],
        keywords: "tien do muc ta tang tien bieu do progression theo doi",
        visual: "overload",
      },
      {
        id: "giong-pt",
        title: "Giọng PT",
        intro: "Giọng đọc tiếng Việt đếm giờ, báo nghỉ, nhắc form để bạn không phải nhìn màn hình.",
        steps: [
          "Trong buổi tập: nút **Giọng PT** để tắt/bật nhanh.",
          "Trong **Cài đặt → Giọng nói PT & buổi tập**: bật/tắt mặc định, chỉnh tốc độ đọc, thời gian chuẩn bị trước mỗi bài, **Nghe thử giọng**.",
        ],
        keywords: "giong noi pt doc so voice",
        link: { to: "/settings", label: "Mở Cài đặt" },
      },
      {
        id: "man-hinh-sang",
        title: "Màn hình luôn sáng, đồng hồ luôn đúng",
        intro: "Đặt điện thoại cạnh máy tập mà không lo màn hình tự tắt.",
        steps: [
          "Trong lúc tập, FitBro giữ màn hình sáng (trên trình duyệt hỗ trợ).",
          "Lỡ chuyển app hoặc khoá máy: quay lại đồng hồ nghỉ vẫn đúng số giây còn lại.",
        ],
        keywords: "man hinh tat khoa may dong ho sai",
      },
      {
        id: "tiep-tuc",
        title: "Tiếp tục buổi tập dở",
        intro: "Lỡ thoát giữa chừng vẫn tập tiếp được.",
        steps: [
          "Trang Tập luyện hiện thông báo buổi đang tập dở kèm nút **Tiếp tục**.",
          "Bấm để quay về đúng bài và set còn thiếu.",
        ],
        notes: ["Buổi không có set nào mới trong 4 giờ sẽ tự kết thúc (ghi chú \"Tự kết thúc vì bỏ dở\"), thời gian tính tới set cuối cùng."],
        keywords: "tiep tuc buoi tap do thoat giua chung",
      },
      {
        id: "tong-ket",
        title: "Màn tổng kết sau buổi tập",
        intro: "Xem lại thành quả ngay khi bấm Kết thúc.",
        steps: [
          "Thời gian, số set, khối lượng (kg), điểm form trung bình.",
          "Danh sách kỷ lục mới và bản đồ nhóm cơ đã tập.",
          "**HeadBro nhận xét**: nhận xét buổi tập và gợi ý buổi sau. **Ghi bữa ăn sau tập** để bổ sung đạm.",
        ],
        keywords: "tong ket ket thuc buoi tap ket qua",
      },
      {
        id: "tu-soan",
        title: "Tự soạn buổi tập (Custom)",
        intro: "Gom các bài bạn thích thành buổi tập riêng.",
        steps: [
          "Vào **Thư viện bài tập**, mở một bài → **Thêm vào buổi tự soạn**.",
          "Nút **Buổi tự soạn** kèm số bài hiện trên thanh tab.",
          "Bấm vào để đặt tên, chỉnh set/rep/nghỉ, sắp xếp → **Lưu & tập ngay** (hoặc chỉ lưu).",
          "Hoặc bấm **Tạo buổi Custom** ở tab Custom để soạn từ đầu.",
        ],
        tips: ["Nên giữ 4–6 bài, bài nhiều khớp nặng (squat, đẩy ngực, kéo) đặt trước."],
        ask: ["Tạo Leg Workout 60 phút phù hợp trình độ của mình"],
        keywords: "custom tu soan tao buoi tap rieng",
      },
      {
        id: "lich-tuan",
        title: "Lịch tập tuần",
        intro: "Gắn mỗi ngày trong tuần với một buổi tập hoặc nghỉ.",
        steps: [
          "Tab **Lịch tuần** → chọn buổi tập cho từng ngày (hoặc để Nghỉ) → **Lưu lịch**.",
          "Hoặc nhờ HeadBro: \"Lên lịch tập cả tuần cho mình\".",
        ],
        notes: ["Lịch tuần quyết định ngày nào là ngày tập/ngày nghỉ, ảnh hưởng tới calo mục tiêu (xem Dinh dưỡng) và nhắc nhở."],
        ask: ["Lên lịch tập 1 tuần theo mục tiêu của mình"],
        keywords: "lich tap tuan schedule ngay nghi",
      },
      {
        id: "goi-y-nhom-co",
        title: "Bản đồ cơ (AI gợi ý)",
        intro: "Muốn tập một nhóm cơ cụ thể? Bấm vào hình người, HeadBro chọn bài cho bạn.",
        steps: [
          "Tab **Bản đồ cơ (AI gợi ý)** → bấm vào nhóm cơ trên hình (hoặc chip tên nhóm cơ).",
          "HeadBro chọn 3–5 bài dựa trên số set nhóm cơ đó 7 ngày qua, điểm sẵn sàng, đạm đã ăn, trình độ, dụng cụ và chấn thương.",
          "Bấm **Tập ngay** để vào buổi tập với các bài đó.",
        ],
        notes: ["Mỗi lần gợi ý bằng AI tính 1 lượt AI trong ngày; hết lượt thì gợi ý theo luật."],
        keywords: "goi y bai tap theo nhom co ai",
      },
      {
        id: "thu-vien",
        title: "Thư viện bài tập",
        intro: "Hơn 1.300 bài có ảnh động, mô tả cách tập và cơ được tác động.",
        steps: [
          "Gõ tên bài (tiếng Anh hoặc Việt) vào ô tìm kiếm.",
          "Lọc theo nhóm cơ (Ngực, Lưng, Chân & Mông…), chọn dụng cụ ở ô **Mọi dụng cụ**, bật **Có Camera AI** nếu muốn tập có chấm form. **Bỏ lọc** để xem lại tất cả.",
          "Bấm một bài để xem ảnh động, cơ chính/phụ, các bước, lần tập trước, kỷ lục và gợi ý mức tạ hôm nay.",
        ],
        keywords: "thu vien bai tap tim bai gif huong dan",
      },
      {
        id: "lich-su-tap",
        title: "Lịch sử buổi tập",
        intro: "Xem lại mọi buổi đã tập.",
        steps: [
          "Tab **Lịch sử & PR** → danh sách buổi theo ngày, thời gian, khối lượng.",
          "Danh sách chia trang, 8 buổi mỗi trang — bấm số trang hoặc ‹ › ở cuối danh sách.",
          "Xoá buổi ghi nhầm: bấm **Xoá buổi tập này** — kỷ lục và thống kê tự tính lại.",
        ],
        keywords: "lich su buoi tap xoa buoi",
      },
    ],
  },
  // ------------------------------------------------------------------ 5
  {
    id: "camera",
    title: "Camera AI",
    icon: "camera",
    blurb: "Đếm rep và chấm điểm form bằng camera, xử lý ngay trên máy bạn.",
    cards: [
      {
        id: "camera-la-gi",
        title: "Camera AI làm được gì",
        intro: "AI nhận diện 33 khớp trên cơ thể, đo góc khớp để đếm rep và chấm điểm form 0–100.",
        steps: [
          "Vẽ khung xương lên hình: xanh = đúng form, cam = có lỗi, xám = chưa thấy đủ khớp.",
          "Đếm rep tự động, báo bằng tiếng bíp và giọng đọc.",
          "Nhắc lỗi bằng chữ và giọng (vd \"Hạ thấp hông hơn\").",
        ],
        notes: ["Video chỉ xử lý trên máy bạn, không gửi lên máy chủ và không lưu lại."],
        keywords: "camera ai mediapipe dem rep cham diem form",
      },
      {
        id: "camera-bai",
        title: "Những bài được hỗ trợ",
        intro: "Camera AI hỗ trợ các bài phổ biến nhất.",
        steps: [
          "Squat, lunge, push-up (hít đất), bicep curl, shoulder press, deadlift, plank (đếm giây giữ đúng form), jumping jack.",
          "Trong buổi tập và thư viện, bài hỗ trợ có nhãn **Hỗ trợ Camera AI** / **Có Camera AI**.",
        ],
        keywords: "bai ho tro camera squat push up plank",
      },
      {
        id: "dat-camera",
        title: "Đặt điện thoại / laptop thế nào",
        intro: "Đặt máy đúng chỗ là 80% độ chính xác.",
        steps: [
          "Đặt máy cách người 2–3 m, cao ngang hông, dựng đứng và cố định (tựa vào chai nước, giá đỡ).",
          "Squat, lunge, deadlift, push-up, plank: đứng **nghiêng** so với camera.",
          "Curl, shoulder press, jumping jack: đứng **chính diện**.",
          "Phải thấy đủ các khớp liên quan (vai, hông, gối, cổ chân…) trong khung hình; phòng đủ sáng, tránh ngược sáng.",
        ],
        tips: ["Mặc đồ bó vừa người, khác màu nền giúp AI nhận diện tốt hơn."],
        visual: "camera",
        keywords: "dat camera vi tri goc nghieng chinh dien anh sang",
      },
      {
        id: "camera-trong-buoi",
        title: "Dùng Camera AI trong buổi tập",
        intro: "Camera tự bật khi tới bài có hỗ trợ.",
        steps: [
          "Tới bài có hỗ trợ, camera tự bật (tắt tự động trong **Cài đặt → Tự bật Camera AI**). Hoặc bấm **Bật Camera AI**.",
          "Lần đầu, trình duyệt hỏi quyền camera → chọn **Cho phép**.",
          "Tập như bình thường; số rep camera đếm tự điền vào ô rep.",
          "**Đếm lại** để reset số rep, **Tắt camera** khi không cần.",
        ],
        keywords: "bat camera trong buoi tap quyen camera",
      },
      {
        id: "camera-rieng",
        title: "Dùng riêng ở trang Camera",
        intro: "Tập thử một set bất kỳ có chấm điểm, không cần vào buổi tập.",
        steps: [
          "Mở trang Camera AI (từ thẻ bài tập có camera hoặc menu).",
          "Chọn bài, đọc hướng dẫn **Đặt camera**, tập một set.",
          "Xem **Kết quả set này** (số rep, điểm form TB), nhập mức tạ nếu có → lưu vào lịch sử tập.",
        ],
        keywords: "trang camera tap thu",
        link: { to: "/workouts/camera", label: "Mở Camera AI" },
      },
      {
        id: "diem-form",
        title: "Hiểu điểm form",
        intro: "Điểm form cho biết kỹ thuật của bạn tốt tới đâu.",
        steps: [
          "≥ 80: form tốt — giữ vững.",
          "50–79: cần chỉnh — đọc lời nhắc và sửa từng rep.",
          "< 50: nên giảm tạ và xem lại kỹ thuật trong thư viện bài tập.",
        ],
        tips: ["Điểm thấp bất thường thường do đặt máy sai góc — xem lại cách đặt camera."],
        keywords: "diem form ky thuat",
      },
    ],
  },
  // ------------------------------------------------------------------ 6
  {
    id: "dinh-duong",
    title: "Dinh dưỡng",
    icon: "salad",
    blurb: "Ghi bữa ăn bằng ảnh, lời mô tả hay thư viện món Việt; theo dõi calo và macro.",
    cards: [
      {
        id: "ghi-bua",
        title: "Ghi bữa ăn — 6 cách",
        intro: "Chọn cách nhanh nhất với bạn trong hộp **Ghi bữa ăn**.",
        steps: [
          "**Yêu thích**: món bạn đã lưu — bấm là ghi.",
          "**Gần đây**: món đã ăn gần đây — bấm là ghi lại y như cũ.",
          "**Ảnh**: chụp/chọn ảnh → **Phân tích bằng AI** → kiểm tra số liệu → **Lưu bữa ăn**.",
          "**Mô tả**: gõ 1 câu (vd \"1 bát cơm, 1 đùi gà rán, canh rau\") → phân tích → lưu.",
          "**Món Việt**: tìm trong thư viện, chọn khẩu phần → ghi.",
          "**Nhập tay**: tự điền tên, calo, đạm, tinh bột, béo.",
        ],
        tips: ["Chọn đúng bữa (sáng/trưa/tối/phụ) ở ô **Bữa** trước khi lưu."],
        keywords: "ghi bua an chup anh mo ta nhap tay them mon",
        link: { to: "/nutrition", label: "Mở Dinh dưỡng" },
      },
      {
        id: "chup-anh",
        title: "Chụp ảnh món ăn cho chuẩn",
        intro: "Ảnh tốt giúp AI ước lượng khẩu phần chính xác hơn.",
        steps: [
          "Chụp từ trên xuống hoặc chéo 45°, thấy rõ cả bát/đĩa.",
          "Đủ sáng, không bị mờ; mỗi lần chụp một bữa.",
          "Thêm mô tả nếu có món khó nhìn ra (vd \"cơm 1,5 bát\", \"nước dùng không uống hết\").",
          "Luôn kiểm tra số liệu và sửa trước khi lưu.",
        ],
        notes: ["Mỗi lần phân tích tính 1 lượt AI trong ngày."],
        keywords: "chup anh mon an chinh xac",
      },
      {
        id: "vong-calo",
        title: "Đọc vòng calo và macro",
        intro: "Biết ngay hôm nay còn được ăn bao nhiêu.",
        steps: [
          "Vòng lớn: calo đã ăn / mục tiêu; dòng chữ cho biết còn bao nhiêu hoặc đã vượt.",
          "3 vòng nhỏ: **Đạm**, **Tinh bột**, **Chất béo** theo % mục tiêu.",
          "**Lịch sử 14 ngày**: biểu đồ calo; bấm một ngày bên dưới để xem lại ngày đó.",
          "Mũi tên cạnh ngày ở đầu trang: xem ngày trước/sau.",
        ],
        visual: "macros",
        keywords: "calo macro dam tinh bot chat beo protein",
      },
      {
        id: "calo-ngay-tap",
        title: "Calo ngày tập / ngày nghỉ",
        intro: "Ngày tập cần thêm năng lượng, ngày nghỉ cần ít hơn — FitBro tự điều chỉnh.",
        steps: [
          "Ngày có buổi tập theo lịch tuần (hoặc đã tập xong): **+150 kcal**.",
          "Ngày nghỉ theo lịch: **−150 kcal**.",
          "Chỉ điều chỉnh tinh bột, đạm giữ nguyên. Nhãn **Ngày tập / Ngày nghỉ** hiện dưới vòng calo.",
          "Chưa có lịch tuần và chưa tập thì giữ mục tiêu gốc.",
        ],
        tips: ["Tắt trong **Cài đặt → Calo theo ngày tập / nghỉ** nếu muốn mục tiêu cố định."],
        keywords: "calo ngay tap ngay nghi carb cycling",
      },
      {
        id: "sua-bua",
        title: "Sửa, xoá, ăn lại một bữa",
        intro: "Bấm vào một bữa đã ghi để mở chi tiết.",
        steps: [
          "**Sửa**: chỉnh tên, bữa, calo, macro → **Lưu thay đổi**.",
          "**Xoá**: bỏ bữa ăn, calo ngày tự tính lại.",
          "**Ăn lại hôm nay**: ghi lại y hệt vào hôm nay.",
          "**Lưu yêu thích**, **Hỏi HeadBro** (đánh giá bữa ăn, gợi ý bữa sau).",
        ],
        notes: ["Phân tích AI của bữa ăn được lưu lại để xem bất cứ lúc nào."],
        keywords: "sua bua an xoa bua an an lai",
      },
      {
        id: "chep-ngay",
        title: "Chép bữa hôm qua",
        intro: "Ăn giống hôm qua? Chép cả ngày chỉ với 1 lần bấm.",
        steps: [
          "Ở phần **Bữa ăn** (hoặc khi ngày còn trống), bấm **Chép bữa hôm qua**.",
          "Đang xem ngày cũ thì nút chép từ ngày liền trước ngày đó.",
          "Xoá bớt món không ăn sau khi chép.",
        ],
        keywords: "chep bua hom qua copy ngay",
      },
      {
        id: "yeu-thich",
        title: "Món yêu thích",
        intro: "Lưu các món hay ăn để ghi nhanh.",
        steps: [
          "Mở một bữa đã ghi → **Lưu yêu thích**.",
          "Lần sau: **Ghi bữa ăn** → tab **Yêu thích** → bấm món.",
          "Bỏ khỏi yêu thích: bấm × cạnh món.",
        ],
        keywords: "mon yeu thich favorite luu mon",
      },
      {
        id: "thu-vien-mon",
        title: "Thư viện món Việt",
        intro: "Calo và macro ước tính cho 1 khẩu phần phổ biến các món Việt.",
        steps: [
          "Cuộn xuống **Thư viện món Việt** ở trang Dinh dưỡng, gõ tên món.",
          "Bật **Clean** để chỉ xem món ăn sạch.",
          "**Xem chi tiết** để đọc thành phần và mẹo ăn sạch; **Ghi nhanh** để ghi vào hôm nay.",
          "Thư viện chia trang, 10 món mỗi trang — chuyển trang ở cuối danh sách.",
        ],
        keywords: "thu vien mon viet pho com tam bun clean eating",
      },
      {
        id: "muc-tieu-dd",
        title: "Mục tiêu dinh dưỡng đến từ đâu",
        intro: "Tính tự động theo công thức Mifflin-St Jeor từ hồ sơ của bạn.",
        steps: [
          "Năng lượng = nhu cầu cơ bản × mức vận động, cộng/trừ theo mục tiêu (tăng cơ/giảm mỡ).",
          "Đạm tính theo cân nặng (vd 1,6–2,2 g/kg khi tăng cơ).",
          "Muốn tự đặt: **Cài đặt → Tự đặt mục tiêu dinh dưỡng**.",
        ],
        keywords: "muc tieu calo cong thuc tdee bmr",
      },
    ],
  },
  // ------------------------------------------------------------------ 7
  {
    id: "inbody",
    title: "InBody & mục tiêu",
    icon: "scale",
    blurb: "Theo dõi thành phần cơ thể theo thời gian và đặt mục tiêu đo được.",
    cards: [
      {
        id: "nhap-chi-so",
        title: "Nhập chỉ số cơ thể",
        intro: "Ghi cân nặng, % mỡ, cơ xương, số đo vòng… để thấy cơ thể thay đổi thế nào.",
        steps: [
          "Trang **InBody** → **Nhập chỉ số**.",
          "Chọn ngày đo, điền ô nào có số liệu (không cần điền hết) → **Lưu**.",
          "Chỉ ghi cân nặng nhanh: nhập ô **Cân nặng sáng nay** khi check-in ở trang Hôm nay.",
        ],
        tips: ["Cân vào cùng một giờ mỗi lần (vd sáng sau khi thức dậy) để số liệu so sánh được."],
        keywords: "nhap chi so can nang mo co so do",
        link: { to: "/inbody", label: "Mở InBody" },
      },
      {
        id: "quet-phieu",
        title: "Quét phiếu InBody",
        intro: "Chụp phiếu kết quả InBody, AI đọc và điền sẵn mọi ô.",
        steps: [
          "**Nhập chỉ số** → **Quét phiếu InBody** → chụp hoặc chọn ảnh phiếu.",
          "Chờ HeadBro đọc, các ô được điền sẵn (gồm cả khối nạc từng phần tay/chân).",
          "Kiểm tra lại từng số → **Lưu**.",
        ],
        notes: ["Chụp thẳng, đủ sáng, không bị loá. Mỗi lần quét tính 1 lượt AI."],
        keywords: "quet phieu inbody chup phieu doc so",
      },
      {
        id: "y-nghia-chi-so",
        title: "Ý nghĩa từng chỉ số",
        intro: "Không biết SMM, BFM là gì? Bấm vào ô chỉ số.",
        steps: [
          "Mỗi ô chỉ số có giải thích \"là gì\" và \"liên quan gì tới tập luyện\".",
          "Nhãn nhỏ dưới số: thay đổi so với lần đo đầu — xanh là tốt, đỏ là đi ngược hướng.",
          "Bấm **Nhờ HeadBro giải thích** để nghe giải thích bằng lời dễ hiểu.",
        ],
        keywords: "smm bfm bmi bmr mo noi tang y nghia",
      },
      {
        id: "bieu-do-co-the",
        title: "Biểu đồ theo thời gian",
        intro: "Nhìn xu hướng thay vì một con số.",
        steps: ["Chọn **Cân nặng**, **Cơ & mỡ** hoặc **Số đo** ở thẻ biểu đồ."],
        keywords: "bieu do xu huong can nang",
      },
      {
        id: "mat-can-doi",
        title: "Mất cân đối trái/phải",
        intro: "So khối nạc tay/chân trái với phải để phát hiện bên yếu.",
        steps: [
          "Cần nhập khối nạc từng phần (có trên phiếu InBody, hoặc quét phiếu).",
          "Lệch ≤ 5%: cân đối. 5–10%: theo dõi. > 10%: nên thêm bài 1 tay/1 chân, bắt đầu bằng bên yếu.",
        ],
        keywords: "mat can doi trai phai lech",
      },
      {
        id: "sua-lan-do",
        title: "Sửa hoặc xoá lần đo",
        intro: "Nhập nhầm số đo? Sửa lại ở Lịch sử đo.",
        steps: [
          "Kéo xuống **Lịch sử đo** → bút chì để sửa, thùng rác để xoá.",
          "Cân nặng trong hồ sơ và calo mục tiêu tự cập nhật theo lần cân mới nhất còn lại.",
        ],
        keywords: "sua lan do xoa lan do nhap nham",
      },
      {
        id: "dat-muc-tieu",
        title: "Đặt mục tiêu",
        intro: "Mục tiêu đo được (vd \"Giảm còn 66kg trước 30/6\") giúp FitBro theo dõi tiến độ cho bạn.",
        steps: [
          "Thẻ **Mục tiêu** → **Tự nhập**: tên, chỉ số theo dõi (cân nặng, % mỡ, cơ xương, vòng eo, số buổi/tuần, khác), giá trị mục tiêu, hạn chót, kế hoạch → **Lưu**.",
          "Hoặc **Đặt cùng HeadBro**: HeadBro hỏi từng bước để chốt mục tiêu thực tế.",
          "Thanh tiến độ % tự cập nhật mỗi lần bạn nhập chỉ số.",
        ],
        notes: [
          "Đạt 100% → tự chuyển **Đã đạt** và có lời chúc mừng.",
          "Mục tiêu số buổi/tuần và mục tiêu \"Khác\" không tự đóng — bấm **Đánh dấu đã đạt** khi xong.",
          "Còn ≤ 7 ngày hoặc quá hạn: Tổng quan sẽ nhắc.",
        ],
        ask: ["Mình muốn đặt một mục tiêu mới thật cụ thể"],
        keywords: "muc tieu dat muc tieu goal tien do han chot",
      },
    ],
  },
  // ------------------------------------------------------------------ 8
  {
    id: "cai-dat",
    title: "Cài đặt & dữ liệu",
    icon: "settings",
    blurb: "Hồ sơ, giọng PT, giao diện, nhắc nhở, mật khẩu và dữ liệu của bạn.",
    cards: [
      {
        id: "sua-ho-so",
        title: "Hồ sơ cá nhân",
        intro: "Thông tin để FitBro cá nhân hoá mọi lời khuyên.",
        steps: [
          "**Cài đặt → Hồ sơ cá nhân**: sửa tuổi, chiều cao, cân nặng, mục tiêu, trình độ, mức vận động, số buổi/tuần, dụng cụ, chấn thương.",
          "Bấm **Lưu hồ sơ** — mục tiêu dinh dưỡng tự tính lại.",
          "Muốn tự đặt calo/macro/nước: bật **Tự đặt mục tiêu dinh dưỡng** rồi điền số.",
        ],
        keywords: "ho so ca nhan sua thong tin muc tieu dinh duong tu dat",
        link: { to: "/settings", label: "Mở Cài đặt" },
      },
      {
        id: "cai-dat-tap",
        title: "Giọng PT và buổi tập",
        intro: "Tuỳ chỉnh trải nghiệm trong buổi tập.",
        steps: [
          "Bật/tắt giọng PT, kéo tốc độ đọc.",
          "**Tự bật Camera AI với bài hỗ trợ**.",
          "**Thời gian chuẩn bị trước mỗi bài**: 5 / 10 / 15 / 20 giây.",
          "**Nghe thử giọng** và **Kiểm tra camera** để chắc mọi thứ hoạt động trước khi tập.",
        ],
        keywords: "cai dat giong noi camera thoi gian chuan bi",
      },
      {
        id: "giao-dien",
        title: "Giao diện và nhắc nhở",
        intro: "Chọn sáng/tối (chỉ đổi ở đây) và để FitBro nhắc bạn đúng giờ.",
        steps: [
          "**Chủ đề**: Sáng / Tối / **Theo máy** (tự đổi theo điện thoại/máy tính).",
          "Bật nhắc nhở → trình duyệt hỏi quyền thông báo → **Cho phép**.",
          "Đặt giờ nhắc check-in, giờ tập và chu kỳ nhắc uống nước.",
        ],
        notes: ["Nhắc nhở chỉ hiện khi FitBro đang mở trong trình duyệt (có thể để ở tab nền)."],
        keywords: "giao dien sang toi theme nhac nho thong bao",
      },
      {
        id: "cai-dat-calo",
        title: "Calo theo ngày tập / nghỉ",
        intro: "Bật hoặc tắt việc tự cộng/trừ calo theo lịch tập tuần.",
        steps: ["**Cài đặt → Hồ sơ cá nhân** → công tắc **Calo theo ngày tập / nghỉ**."],
        keywords: "calo ngay tap ngay nghi bat tat",
      },
      {
        id: "mat-khau",
        title: "Đổi hoặc đặt mật khẩu",
        intro: "Giữ tài khoản an toàn.",
        steps: [
          "**Cài đặt → Đổi mật khẩu**: nhập mật khẩu hiện tại, mật khẩu mới (tối thiểu 6 ký tự, khác mật khẩu cũ), nhập lại → lưu.",
          "Tài khoản Google chưa có mật khẩu: mục này là **Đặt mật khẩu** (không cần mật khẩu hiện tại).",
        ],
        keywords: "doi mat khau dat mat khau password",
      },
      {
        id: "du-lieu",
        title: "Xuất dữ liệu, xoá sạch, xoá tài khoản",
        intro: "Dữ liệu là của bạn — mang đi hoặc xoá bất cứ lúc nào.",
        steps: [
          "**Xuất toàn bộ dữ liệu (JSON)**: tải về file gồm hồ sơ, check-in, buổi tập, bữa ăn, số đo, mục tiêu, lịch tập, món yêu thích.",
          "**Xoá sạch dữ liệu**: gõ \"XOA\" để xác nhận — xoá mọi bản ghi, tài khoản vẫn còn.",
          "**Xoá tài khoản**: xoá vĩnh viễn tài khoản và toàn bộ dữ liệu.",
        ],
        notes: ["Xoá sạch và xoá tài khoản **không thể khôi phục**. Nên xuất dữ liệu trước."],
        keywords: "xuat du lieu export xoa du lieu xoa tai khoan json",
      },
      {
        id: "nhat-ky-ai",
        title: "Nhật ký AI",
        intro: "Xem HeadBro đã xử lý từng câu hỏi thế nào: chuyển cho ai, dùng công cụ gì, mất bao lâu.",
        steps: [
          "Trong câu trả lời, bấm **Chi tiết xử lý (Nhật ký AI)**, hoặc mở trang Nhật ký AI.",
          "Dành cho người tò mò — không cần dùng khi tập luyện thường ngày.",
        ],
        keywords: "nhat ky ai trace log",
        link: { to: "/ai-log", label: "Mở Nhật ký AI" },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Lỗi & khắc phục — mục riêng
// ---------------------------------------------------------------------------
export const TROUBLE_GROUPS = ["Đăng nhập", "Camera", "Giọng nói", "Buổi tập", "AI & HeadBro", "Dinh dưỡng", "InBody & mục tiêu", "Hiển thị & dữ liệu"] as const;

export const TROUBLES: Trouble[] = [
  // Đăng nhập
  {
    id: "quen-mat-khau", group: "Đăng nhập", symptom: "Quên mật khẩu",
    cause: "FitBro chưa có tính năng tự đặt lại mật khẩu qua email.",
    fix: ["Nếu tài khoản dùng email Google: bấm **Tiếp tục với Google** với cùng email.", "Nếu không: liên hệ quản trị viên nhóm FitBro để được hỗ trợ.", "Sau khi vào được, đặt mật khẩu mới trong **Cài đặt → Đổi mật khẩu**."],
    keywords: "quen mat khau khong dang nhap duoc reset",
  },
  {
    id: "email-ton-tai", group: "Đăng nhập", symptom: "Báo \"Email này đã được đăng ký\"",
    cause: "Email này đã có tài khoản (có thể bạn từng đăng ký hoặc đăng nhập bằng Google).",
    fix: ["Chuyển sang **Đăng nhập** và dùng mật khẩu cũ.", "Hoặc bấm **Tiếp tục với Google** nếu trước đây dùng Google."],
    keywords: "email da ton tai trung email",
  },
  {
    id: "sai-mat-khau", group: "Đăng nhập", symptom: "Báo \"Email hoặc mật khẩu không đúng\"",
    cause: "Gõ nhầm, bật Caps Lock, hoặc tài khoản tạo bằng Google nên chưa có mật khẩu.",
    fix: ["Kiểm tra Caps Lock và bộ gõ tiếng Việt (tắt khi gõ mật khẩu).", "Thử **Tiếp tục với Google**."],
    keywords: "sai mat khau dang nhap that bai",
  },
  {
    id: "google-khong-hien", group: "Đăng nhập", symptom: "Không thấy nút Google",
    cause: "Máy chủ chưa cấu hình đăng nhập Google, hoặc trình duyệt chặn cửa sổ Google.",
    fix: ["Dùng email + mật khẩu.", "Tắt chặn quảng cáo/cửa sổ bật lên cho trang FitBro rồi tải lại."],
    keywords: "google khong hien nut",
  },
  {
    id: "bi-dang-xuat", group: "Đăng nhập", symptom: "Tự nhiên bị đăng xuất",
    cause: "Phiên đăng nhập hết hạn sau 30 ngày, hoặc trình duyệt đã xoá dữ liệu trang/duyệt ẩn danh.",
    fix: ["Đăng nhập lại — dữ liệu vẫn còn nguyên trên máy chủ.", "Không dùng chế độ ẩn danh nếu muốn được nhớ đăng nhập."],
    keywords: "bi dang xuat het phien",
  },
  // Camera
  {
    id: "camera-khong-bat", group: "Camera", symptom: "Camera không bật / báo chưa cho phép",
    cause: "Bạn đã chặn quyền camera cho trang, hoặc trình duyệt không hỗ trợ.",
    fix: [
      "Chrome/Edge máy tính: bấm biểu tượng ổ khoá cạnh địa chỉ web → **Camera** → **Cho phép** → tải lại trang.",
      "Điện thoại Android (Chrome): ⋮ → **Cài đặt** → **Cài đặt trang web** → **Máy ảnh** → cho phép FitBro.",
      "iPhone (Safari): **Cài đặt** → **Safari** → **Camera** → **Hỏi** hoặc **Cho phép**.",
      "Thử nút **Kiểm tra camera** trong Cài đặt.",
    ],
    keywords: "camera khong bat quyen chan permission",
    link: { to: "/settings", label: "Mở Cài đặt" },
  },
  {
    id: "camera-dang-dung", group: "Camera", symptom: "Báo camera đang được dùng",
    cause: "Ứng dụng khác (Zoom, Meet, tab khác) đang giữ camera.",
    fix: ["Tắt ứng dụng/tab đang dùng camera.", "Bấm **Bật camera** lại."],
    keywords: "camera dang duoc su dung zoom meet",
  },
  {
    id: "camera-khong-nhan", group: "Camera", symptom: "Khung xương xám, báo \"Lùi ra xa để camera thấy đủ các khớp cần thiết\"",
    cause: "Camera chưa thấy đủ các khớp cần cho bài, hoặc thiếu sáng.",
    fix: ["Lùi ra xa (2–3 m) để thấy toàn thân.", "Bật thêm đèn, tránh đứng ngược sáng cửa sổ.", "Đặt máy đúng góc: nghiêng hay chính diện tuỳ bài (xem Camera AI → Đặt điện thoại)."],
    keywords: "khong nhan dien nguoi khung xuong xam",
  },
  {
    id: "dem-sai-rep", group: "Camera", symptom: "Đếm thiếu hoặc thừa rep",
    cause: "Biên độ chưa đủ sâu, máy bị rung, hoặc góc đặt máy chưa đúng.",
    fix: ["Xuống/lên hết biên độ mỗi rep.", "Cố định máy, không cầm tay.", "Sửa số rep trong ô trước khi bấm **Hoàn thành set**; bấm **Đếm lại** để bắt đầu lại."],
    keywords: "dem sai rep thieu rep thua rep",
  },
  {
    id: "camera-giat", group: "Camera", symptom: "Camera giật, máy nóng",
    cause: "AI nhận diện chạy trên máy nên tốn sức với máy yếu.",
    fix: ["Đóng bớt tab/ứng dụng khác.", "Cắm sạc khi tập lâu.", "Tắt Camera AI với bài không cần."],
    keywords: "giat lag cham nong may",
  },
  // Giọng nói
  {
    id: "khong-co-tieng", group: "Giọng nói", symptom: "Không nghe giọng PT",
    cause: "Máy đang tắt tiếng hoặc giọng PT đang tắt.",
    fix: ["Tăng âm lượng, tắt chế độ im lặng.", "Bật **Giọng PT** trong buổi tập hoặc trong Cài đặt.", "Bấm **Nghe thử giọng** trong Cài đặt."],
    keywords: "khong co tieng am thanh giong noi",
  },
  {
    id: "giong-khong-viet", group: "Giọng nói", symptom: "Giọng đọc không phải tiếng Việt, phát âm lạ",
    cause: "Trình duyệt/máy chưa có giọng tiếng Việt.",
    fix: ["Dùng Chrome hoặc Edge (Windows, Android thường có sẵn giọng tiếng Việt).", "Windows: **Cài đặt** → **Thời gian & ngôn ngữ** → **Giọng nói** → thêm giọng Tiếng Việt."],
    keywords: "giong doc tieng anh phat am",
  },
  {
    id: "micro-chat", group: "Giọng nói", symptom: "Micro trong chat không nghe",
    cause: "Trình duyệt không hỗ trợ nhập giọng nói hoặc chưa cho quyền micro.",
    fix: ["Dùng Chrome/Edge.", "Cho phép micro ở biểu tượng ổ khoá cạnh địa chỉ web."],
    keywords: "micro noi chat nhap giong noi",
  },
  // Buổi tập
  {
    id: "go-nham-set", group: "Buổi tập", symptom: "Gõ nhầm tạ/rep, kỷ lục bị sai",
    cause: "Set nhầm đã được ghi.",
    fix: ["Trong buổi: danh sách **Đã ghi ở bài này** → bút chì để sửa hoặc thùng rác để xoá.", "Buổi đã xong: vào **Lịch sử & PR** → xoá buổi ghi nhầm nếu cần."],
    keywords: "go nham set sai ky luc",
  },
  {
    id: "lo-thoat", group: "Buổi tập", symptom: "Lỡ thoát giữa buổi tập",
    cause: "Đóng tab, chuyển trang hoặc hết pin.",
    fix: ["Mở lại trang **Tập luyện** → bấm **Tiếp tục** ở thông báo buổi tập dở."],
    keywords: "thoat giua buoi mat buoi tap",
  },
  {
    id: "tu-ket-thuc", group: "Buổi tập", symptom: "Buổi tập ghi \"Tự kết thúc vì bỏ dở\"",
    cause: "Buổi không có set mới trong hơn 4 giờ nên FitBro tự đóng để báo cáo không bị sai.",
    fix: ["Các set đã ghi vẫn được lưu và tính vào thống kê.", "Bắt đầu buổi mới nếu muốn tập tiếp."],
    keywords: "tu ket thuc bo do",
  },
  {
    id: "dong-ho-lech", group: "Buổi tập", symptom: "Đồng hồ nghỉ đứng yên, màn hình tự tắt",
    cause: "Trình duyệt cũ không hỗ trợ giữ màn hình sáng.",
    fix: ["Cập nhật trình duyệt (Chrome/Edge/Safari mới).", "Tạm tăng thời gian tự khoá màn hình của điện thoại khi tập.", "Đồng hồ vẫn tính đúng khi bạn mở lại app."],
    keywords: "dong ho dung man hinh tat",
  },
  {
    id: "khong-thay-goi-y", group: "Buổi tập", symptom: "Không thấy gợi ý tăng tạ",
    cause: "Bạn chưa từng hoàn thành buổi có bài này, hoặc đang ở set thứ 2 trở đi.",
    fix: ["Gợi ý chỉ hiện ở set đầu tiên của bài và cần ít nhất 1 lần tập trước đó."],
    keywords: "khong co goi y tang ta",
  },
  // AI & HeadBro
  {
    id: "het-luot", group: "AI & HeadBro", symptom: "Báo \"đã dùng hết lượt\" AI hôm nay",
    cause: "Giới hạn mỗi ngày: 150 tin chat, 40 lượt phân tích ảnh/phiếu/gợi ý bài.",
    fix: ["Ghi bữa ăn bằng **Món Việt**, **Gần đây**, **Yêu thích** hoặc **Nhập tay** — không tốn lượt.", "Lượt mới mở vào ngày hôm sau."],
    keywords: "het luot gioi han 429",
  },
  {
    id: "ai-tinh-sai", group: "AI & HeadBro", symptom: "AI tính sai calo / đọc sai món",
    cause: "Ảnh mờ, khẩu phần khó ước lượng hoặc món lạ.",
    fix: ["Sửa số liệu ngay trong ô trước khi **Lưu bữa ăn**.", "Thêm mô tả cụ thể (vd \"cơm 1,5 bát\").", "Bữa đã lưu: mở bữa ăn → **Sửa**."],
    keywords: "ai sai calo doc sai mon",
  },
  {
    id: "ai-khong-tra-loi", group: "AI & HeadBro", symptom: "HeadBro không trả lời / báo lỗi kết nối",
    cause: "Mất mạng hoặc dịch vụ AI tạm thời quá tải.",
    fix: ["Kiểm tra mạng rồi bấm **Tạo lại**.", "Đợi 1–2 phút rồi thử lại.", "Các tính năng không cần AI (ghi tay, tập luyện) vẫn dùng bình thường."],
    keywords: "ai loi khong tra loi mat ket noi",
  },
  {
    id: "tra-loi-chua-ung", group: "AI & HeadBro", symptom: "Câu trả lời chưa đúng ý",
    cause: "Câu hỏi chưa đủ cụ thể.",
    fix: ["Bấm **Tạo lại**.", "Hoặc **Sửa câu hỏi**: thêm thời gian, dụng cụ, mục tiêu cụ thể."],
    keywords: "tra loi chua dung y",
  },
  // Dinh dưỡng
  {
    id: "ngay-mai", group: "Dinh dưỡng", symptom: "Không ghi được bữa ăn cho ngày mai",
    cause: "FitBro chỉ cho ghi bữa đã ăn (hôm nay hoặc ngày trước).",
    fix: ["Muốn lên kế hoạch trước: nhờ HeadBro \"Lên thực đơn món Việt cho ngày mai\"."],
    keywords: "ngay mai tuong lai khong ghi duoc",
  },
  {
    id: "calo-thay-doi", group: "Dinh dưỡng", symptom: "Mục tiêu calo mỗi ngày một khác",
    cause: "Tính năng calo ngày tập / ngày nghỉ (±150 kcal theo lịch tuần).",
    fix: ["Đó là bình thường. Muốn cố định: tắt **Calo theo ngày tập / nghỉ** trong Cài đặt."],
    keywords: "calo thay doi muc tieu khac nhau",
  },
  {
    id: "khong-co-mon", group: "Dinh dưỡng", symptom: "Món không có trong thư viện",
    cause: "Thư viện chỉ gồm các món Việt phổ biến.",
    fix: ["Dùng **Ảnh** hoặc **Mô tả** để AI tính.", "Hoặc **Nhập tay** theo nhãn dinh dưỡng trên bao bì."],
    keywords: "khong tim thay mon",
  },
  // InBody & mục tiêu
  {
    id: "quet-sai", group: "InBody & mục tiêu", symptom: "Quét phiếu InBody đọc sai số",
    cause: "Ảnh nghiêng, loá hoặc phiếu mẫu khác thường.",
    fix: ["Chụp thẳng, đủ sáng, không bóng đèn phản chiếu.", "Sửa lại các ô sai trước khi **Lưu**.", "Đã lưu: **Lịch sử đo** → bút chì để sửa."],
    keywords: "quet phieu sai so",
  },
  {
    id: "muc-tieu-khong-dat", group: "InBody & mục tiêu", symptom: "Mục tiêu không tự chuyển \"Đã đạt\"",
    cause: "Mục tiêu số buổi/tuần và mục tiêu \"Khác\" không tự đóng; hoặc chưa có số đo mới.",
    fix: ["Nhập chỉ số mới để cập nhật tiến độ.", "Bấm **Đánh dấu đã đạt** cho mục tiêu tự theo dõi."],
    keywords: "muc tieu khong dat",
  },
  {
    id: "can-nang-ho-so", group: "InBody & mục tiêu", symptom: "Cân nặng trong hồ sơ không đúng",
    cause: "Hồ sơ lấy theo lần cân mới nhất (theo ngày đo).",
    fix: ["Kiểm tra **Lịch sử đo**: sửa/xoá lần cân nhập nhầm ngày hoặc nhầm số."],
    keywords: "can nang ho so sai",
  },
  // Hiển thị & dữ liệu
  {
    id: "chua-cap-nhat", group: "Hiển thị & dữ liệu", symptom: "Số liệu chưa cập nhật",
    cause: "Trang đang hiện dữ liệu cũ trong vài giây.",
    fix: ["Chuyển trang rồi quay lại, hoặc tải lại trang (F5 / kéo xuống trên điện thoại)."],
    keywords: "chua cap nhat so lieu cu",
  },
  {
    id: "khong-nhac", group: "Hiển thị & dữ liệu", symptom: "Không nhận được nhắc nhở",
    cause: "Chưa cho quyền thông báo, hoặc đã đóng FitBro.",
    fix: ["Bật nhắc nhở trong Cài đặt và chọn **Cho phép** thông báo.", "Để FitBro mở ở một tab (có thể thu nhỏ)."],
    keywords: "khong co thong bao nhac nho",
  },
  {
    id: "may-khac", group: "Hiển thị & dữ liệu", symptom: "Không thấy dữ liệu trên máy khác",
    cause: "Đang đăng nhập tài khoản khác.",
    fix: ["Bấm ảnh đại diện để xem email đang đăng nhập; đăng xuất và đăng nhập đúng tài khoản."],
    keywords: "may khac mat du lieu tai khoan khac",
  },
  {
    id: "giao-dien-loi", group: "Hiển thị & dữ liệu", symptom: "Giao diện hiển thị lạ, nút không bấm được",
    cause: "Trình duyệt cũ hoặc bản app cũ còn lưu trong bộ nhớ đệm.",
    fix: ["Tải lại trang bằng Ctrl + Shift + R (máy tính).", "Cập nhật trình duyệt lên bản mới."],
    keywords: "giao dien loi hien thi la",
  },
];

/** Trang → chương hướng dẫn, cho nút "?" cạnh tiêu đề mỗi trang. */
export const HELP_FOR: Record<string, string> = {
  dashboard: "tong-quan",
  chat: "headbro",
  workouts: "tap-luyen",
  daily: "hom-nay",
  nutrition: "dinh-duong",
  inbody: "inbody",
  settings: "cai-dat",
  camera: "camera",
};
