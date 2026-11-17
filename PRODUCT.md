# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Hai nhóm người dùng Việt Nam:
- **Người mới tập gym** (sinh viên, người trẻ): mở app trên điện thoại ở phòng gym giữa các set, và buổi sáng để check-in.
- **Người tập lâu năm**: theo dõi PR, tải tạ, dinh dưỡng chi tiết, thường trên desktop.

Giao diện phải dễ hiểu cho người mới và vẫn đủ dày thông tin cho người tập lâu năm.

## Product Purpose
FitBro AI là trợ lý thể hình gom vào một app: lịch và buổi tập, dinh dưỡng, chỉ số cơ thể (InBody), check-in sẵn sàng hằng ngày và mục tiêu. Thành công nghĩa là người dùng tập đều, ăn đúng mục tiêu và tăng tiến đo được (PR, mức tạ).

## Positioning
HeadBro, "Trợ lý chính FitBro", điều phối các agent AI chuyên biệt. Lời khuyên dựa trên dữ liệu thật của chính người dùng (readiness, lịch sử tập, PR, dinh dưỡng), không phải lời khuyên chung chung.

## Operating Context
- Dùng giữa các set tập (một tay, nhìn nhanh), buổi sáng check-in, và khi ghi bữa ăn.
- Có tài khoản demo tự làm mới dữ liệu mỗi ngày để trình diễn.
- Có Camera AI cho một số bài tập.

## Capabilities and Constraints
- Stack: React 19 + Vite + Tailwind v4 frontend, FastAPI backend, Supabase Postgres, deploy trên Vercel.
- Toàn bộ giao diện bằng tiếng Việt.
- Các trang: Tổng quan, Trợ lý AI (chat), Tập luyện, Hôm nay, Dinh dưỡng, InBody, Hướng dẫn, Cài đặt.
- AI tools có hạn mức theo ngày.

## Brand Commitments
- Giữ tên FitBro / HeadBro và logo quả tạ hiện tại (favicon).
- Bắt buộc có cả giao diện sáng và tối.

## Evidence on Hand
- Dữ liệu demo (khoảng 12 tuần lịch sử tập) là dữ liệu tổng hợp, không phải người dùng thật.
- Không có testimonial, số người dùng hay benchmark. Không được bịa ra.

## Product Principles
1. Dữ liệu của người dùng đi trước, lời khuyên AI đi sau và luôn trích từ dữ liệu đó.
2. Nhìn một lần là biết hôm nay cần làm gì.
3. Người mới không bị ngợp; người tập lâu năm không thấy thiếu.
4. Thao tác trong phòng gym phải nhanh, chạm được bằng một tay.
