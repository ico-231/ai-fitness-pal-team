# Kế hoạch làm lại tab Hướng dẫn

Tab Hướng dẫn có hai việc: **giới thiệu FitBro làm được gì** và **chỉ từng bước cách dùng**. Lỗi và cách khắc phục nằm ở một mục riêng.

Người đọc là người dùng phổ thông, không rành công nghệ, có thể mới cài app hôm nay.

---

## 1. Nguyên tắc viết

- **Mỗi tính năng là một "thẻ", luôn theo 5 phần:**
  1. **Là gì:** 1–2 câu, nói lợi ích trước, cách làm sau.
  2. **Dùng khi nào:** tình huống thật, ví dụ "Sáng dậy thấy mệt, chưa biết có nên tập nặng không".
  3. **Cách dùng:** các bước đánh số. Mỗi bước nói rõ bấm vào đâu và tên nút đúng như trên màn hình.
  4. **Mẹo / Lưu ý:** tối đa 2–3 ý.
  5. **Nút "Mở [tên trang]":** đi thẳng tới đúng chỗ trong app.
- Câu ngắn, tiếng Việt đời thường. Tên nút trong app in đậm, đúng từng chữ, ví dụ **Hoàn thành set**.
- Không nói thuật ngữ kỹ thuật như agent, token hay API. Phần kỹ thuật dời xuống cuối trang (mục 6).
- Nội dung phải khớp với app hiện tại. Mỗi khi đổi tính năng thì sửa file nội dung (mục 7).

---

## 2. Bố cục trang

```
┌──────────────────────────────────────────────────────────┐
│ Hướng dẫn, dùng FitBro thế nào                           │
│ [ 🔍 Tìm: "sửa set", "calo", "camera"...             ]   │
├──────────────────────────────────────────────────────────┤
│ FitBro là gì? (giới thiệu 30 giây) + 6 ô tính năng nổi bật│
├──────────────────────────────────────────────────────────┤
│ Bắt đầu trong 5 bước   [■■■□□ 3/5]                        │
│ ✓ Hoàn thiện hồ sơ   ✓ Check-in   ✓ Ghi bữa ăn            │
│ ○ Tập buổi đầu [Làm ngay]   ○ Nhập cân nặng [Làm ngay]    │
├───────────────┬──────────────────────────────────────────┤
│ MỤC LỤC (dính)│ Chương 1. Trợ lý HeadBro                  │
│ 1 HeadBro     │   ▸ Hỏi HeadBro thế nào                   │
│ 2 Tổng quan   │   ▾ Ghi dữ liệu qua HeadBro               │
│ 3 Hôm nay     │      Là gì · Dùng khi nào · Các bước ·    │
│ 4 Tập luyện   │      Mẹo · [Mở Trợ lý AI]                 │
│ 5 Camera AI   │   ▸ Tạo lại / sửa câu hỏi                 │
│ 6 Dinh dưỡng  │ Chương 2. Tổng quan ...                   │
│ 7 InBody      │                                           │
│ 8 Cài đặt     │                                           │
│ ─────────     │                                           │
│ ⚠ Lỗi & khắc  │                                           │
│   phục        │                                           │
│ ⓘ Bên trong   │                                           │
│   FitBro      │                                           │
└───────────────┴──────────────────────────────────────────┘
```

- **Máy tính:** mục lục dính bên trái, cuộn tới đâu thì chương đó sáng lên. Nội dung bên phải.
- **Điện thoại:** mục lục thành dải chip cuộn ngang dưới ô tìm kiếm. Các thẻ mở/đóng.
- **Tìm kiếm:** lọc theo tiêu đề, nội dung và từ khoá ẩn. Ví dụ gõ "sai" hay "nhầm" vẫn ra bài "Sửa set gõ nhầm". Không có kết quả thì gợi ý mở mục Lỗi & khắc phục hoặc hỏi HeadBro.
- **Đường dẫn riêng cho từng thẻ,** ví dụ `/guide#sua-set`, để chia sẻ hoặc để các trang khác trỏ tới.
- **"Bắt đầu trong 5 bước"** đọc dữ liệu thật để đánh dấu ✓. Đủ 5/5 thì khối này thu nhỏ thành một dòng "Bạn đã nắm cơ bản 🎉".
- Phong cách kính mờ như các trang khác, có bản sáng và bản tối.

---

## 3. Phần giới thiệu "FitBro là gì?"

Hai câu giới thiệu:
> FitBro là huấn luyện viên cá nhân bằng AI: lên buổi tập, đếm rep bằng camera, tính calo từ ảnh món Việt và theo dõi cơ thể bạn mỗi ngày. Mọi lời khuyên dựa trên dữ liệu thật bạn ghi, không bịa số.

Sáu ô tính năng nổi bật (biểu tượng, 1 dòng mô tả, bấm để nhảy tới chương tương ứng):

| Ô | Mô tả 1 dòng |
|---|---|
| Trợ lý HeadBro | Hỏi gì cũng được, nhờ ghi bữa ăn, soạn buổi tập, đặt mục tiêu |
| Buổi tập có PT ảo | Đếm ngược, đồng hồ nghỉ, giọng nhắc, gợi ý tăng tạ |
| Camera AI | Đếm rep và chấm điểm form ngay trên máy, không gửi video đi |
| Quét ảnh món Việt | Chụp món ăn ra calo, đạm, tinh bột, béo |
| Điểm sẵn sàng | Check-in 30 giây biết hôm nay nên tập nặng hay nhẹ |
| InBody & mục tiêu | Chụp phiếu InBody, theo dõi mỡ/cơ, tự báo khi đạt mục tiêu |

---

## 4. Nội dung chi tiết theo chương

Mỗi gạch đầu dòng dưới đây là một thẻ, viết đủ 5 phần ở mục 1. Phần "các bước" được ghi sẵn để duyệt nội dung.

### Chương 0. Bắt đầu
1. **Tạo tài khoản và đăng nhập.** Đăng ký bằng email + mật khẩu (tối thiểu 6 ký tự) hoặc **Tiếp tục với Google**. App nhớ đăng nhập 30 ngày.
2. **Hoàn thiện hồ sơ (3 bước đầu tiên).**
   - Bước 1: tên, tuổi, giới tính, chiều cao, cân nặng.
   - Bước 2: mục tiêu (tăng cơ, giảm mỡ, giữ dáng, sức bền, sức khoẻ), trình độ, nơi tập (phòng gym / tại nhà / không dụng cụ), số buổi mỗi tuần, chấn thương.
   - Bước 3: xem mục tiêu dinh dưỡng mỗi ngày mà app tự tính.
   - Mẹo: ghi rõ chấn thương để HeadBro tránh những bài gây ảnh hưởng.
3. **Một ngày dùng FitBro điển hình.** Câu chuyện ngắn có mốc giờ:
   - Sáng: check-in.
   - Trưa: chụp ảnh bữa ăn.
   - Chiều: tập theo lịch.
   - Tối: xem Tổng quan, nghe tóm tắt.
4. **Đi lại trong app.**
   - Máy tính: thanh dọc bên trái có hai khối. Khối trên là các trang chính, khối dưới là Hướng dẫn, Cài đặt, sáng/tối, tài khoản.
   - Điện thoại: thanh dưới cùng.
   - Nút **Hỏi AI** nổi ở góc dùng được ở mọi trang.

### Chương 1. Trợ lý HeadBro
1. **HeadBro là ai.** Một trợ lý duy nhất. Phía sau có chuyên gia tập luyện và chuyên gia dinh dưỡng; HeadBro tự chuyển câu hỏi cho đúng người, bạn không cần chọn.
2. **Hỏi HeadBro thế nào.**
   - Có 2 cách: trang **Trợ lý AI**, hoặc nút **Hỏi AI** ở bất kỳ trang nào (HeadBro biết bạn đang ở trang nào).
   - Gõ câu hỏi rồi bấm Enter. Có thể bấm micro để nói, hoặc gửi ảnh (món ăn, phiếu InBody).
   - Câu hỏi mẫu, bấm là thử ngay: "Hôm nay mình còn thiếu bao nhiêu đạm?", "Tạo buổi tập tay 45 phút", "Lên thực đơn món Việt cả ngày".
3. **Nhờ HeadBro ghi dữ liệu.**
   - Nói "Trưa nay mình ăn 1 tô bún bò" thì HeadBro hiện thẻ kèm số liệu.
   - Bấm **Xác nhận** mới lưu; bấm Huỷ thì không lưu gì.
   - Làm được tương tự với cân nặng, mục tiêu, lịch tập tuần, buổi tập mới.
4. **Đọc câu trả lời.**
   - Thẻ bài tập: bấm để xem chi tiết hoặc **Tập ngay**.
   - Thẻ món ăn và nguồn tham khảo.
   - Nút **Đọc to** và **Sao chép**.
   - Câu hỏi gợi ý tiếp theo ở cuối câu trả lời.
5. **Tạo lại và sửa câu hỏi.**
   - Câu trả lời cuối có nút **Tạo lại**.
   - Rê chuột vào câu hỏi rồi bấm bút chì **Sửa câu hỏi**, sửa xong bấm Enter. Các tin sau câu đó được thay bằng câu trả lời mới.
6. **Lịch sử trò chuyện.**
   - Nút **Lịch sử** ở góc trên khung chat: tìm, mở lại, đổi tên, xoá.
   - **Cuộc trò chuyện mới** để bắt đầu chủ đề khác.
7. **Giới hạn và quyền riêng tư.**
   - Mỗi ngày: 150 tin chat và 40 lượt AI khác (ảnh bữa ăn, phiếu InBody, gợi ý bài).
   - HeadBro không nhận tên và email của bạn.
   - Câu hỏi về cấp cứu, khủng hoảng tâm lý hay rối loạn ăn uống được trả lời bằng hướng dẫn an toàn.

### Chương 2. Tổng quan
1. **Trang Tổng quan cho biết gì.** Lời chào, điểm sẵn sàng, các vòng hôm nay (calo, đạm, nước, buổi tập), bản đồ cơ, kỷ lục, mục tiêu.
2. **Bản đồ cơ: đọc thế nào.**
   - Chú giải 5 màu: xám = chưa tập, xanh dương = ít, xanh lá = vừa, cam = nhiều, đỏ = rất nhiều.
   - Một set tính 1 cho cơ chính, 0,5 cho cơ phụ. Set khởi động không tính.
   - Đổi khoảng thời gian: 7 ngày / Tháng / Quý / Năm.
   - Rê chuột vào cơ để xem số set.
3. **HeadBro nhắc bạn.** Các nhắc nhở tự động:
   - thiếu đạm, ăn quá hoặc thiếu calo
   - lâu chưa tập một nhóm cơ
   - tuần này tập thiếu buổi
   - sắp mất chuỗi ngày
   - cân nặng đi ngược mục tiêu
   - mục tiêu sắp hết hạn
   - tin vui khi có kỷ lục mới

   Mỗi nhắc nhở có nút làm ngay hoặc hỏi HeadBro.
4. **Báo cáo thống kê.**
   - Chọn kỳ 7 ngày, 30 ngày, quý hoặc năm.
   - Bấm từng ô (buổi tập, khối lượng, kỷ lục, cân nặng, calo, sẵn sàng) để xem biểu đồ và bảng chi tiết.
5. **Thao tác nhanh.** Hàng biểu tượng gồm: +nước, ghi cân nặng, ghi bữa ăn, tập ngay.
6. **Nghe tóm tắt và xuất PDF.**
   - Nút loa đọc tóm tắt ngày. Số liệu lấy từ dữ liệu thật, không qua AI.
   - Nút in → "Lưu dưới dạng PDF".

### Chương 3. Hôm nay (check-in, nước, chuỗi ngày)
1. **Check-in buổi sáng.**
   - 5 câu, mỗi câu chọn 1–5: giờ ngủ, chất lượng giấc ngủ, mệt mỏi, đau nhức cơ, căng thẳng. Có thêm ô ghi chú.
   - Kết quả là điểm sẵn sàng 0–100.
   - Làm lại: **Xoá check-in hôm nay** rồi check-in lại.
2. **Điểm sẵn sàng nghĩa là gì.**
   - Công thức: ngủ 25%, chất lượng ngủ 15%, mệt mỏi 25%, đau cơ 20%, căng thẳng 15%.
   - Ngưỡng: ≥80 tập nặng, 60–79 bình thường, 40–59 nên nhẹ đi, dưới 40 nên nghỉ hoặc phục hồi.
   - Điểm thấp thì buổi tập tự đề xuất **bản nhẹ** (xem Chương 4).
3. **Hôm nay nên tập gì?** Thẻ gộp lịch tập tuần với điểm sẵn sàng thành một lời khuyên, kèm nút **Bắt đầu tập** hoặc **Chuyển sang bài phục hồi**.
4. **Ghi nước uống.**
   - Nút +250 ml / +500 ml, và **Bớt 250 ml** khi bấm nhầm.
   - Mục tiêu nước tự tính theo cân nặng.
5. **Chuỗi ngày và lịch hoạt động.**
   - Chuỗi tăng khi trong ngày có check-in, tập, ghi bữa ăn hoặc uống nước.
   - Hôm nay chưa làm gì thì chuỗi chưa mất, chỉ mất khi hết ngày.
   - Lịch hoạt động tô màu từng ngày.
6. **Huy hiệu và cột mốc.** Có những huy hiệu nào và còn bao nhiêu nữa thì đạt.

### Chương 4. Tập luyện
1. **Chọn buổi tập.** Các tab của trang Tập luyện:
   - **Chương trình:** buổi có sẵn.
   - **Custom:** buổi bạn tự tạo.
   - **Lịch tuần.**
   - **Bản đồ cơ (AI gợi ý).**
   - **Thư viện bài tập:** hơn 1.300 bài có ảnh động.
   - **Lịch sử & PR.**
2. **Bắt đầu một buổi tập.** Bấm chương trình → xem danh sách bài → **Bắt đầu**.
3. **Tuỳ chỉnh trước khi tập.**
   - Bỏ tích bài muốn bỏ qua.
   - **Đổi:** thay bằng bài cùng nhóm cơ.
   - **Thêm bài liên quan**, **Xoá** bài.
   - Lưu lại: chương trình có sẵn thì thành buổi Custom mới, bản gốc giữ nguyên.
4. **Trong lúc tập: từng bước.**
   - Đếm ngược chuẩn bị: **+10 giây**, **Tạm dừng**, **Vào luôn**.
   - Nhập mức tạ và số rep bằng nút −/+, rồi bấm **Hoàn thành set**.
   - Đồng hồ nghỉ tự chạy: **−15s / +15s / Bỏ nghỉ**.
   - Bài tính giờ (plank…): đồng hồ đếm ngược, có nút **Xong sớm**.
   - Thanh tiến độ các bài ở trên cùng; nút **Bỏ qua bài**, **Kết thúc**.
5. **Sửa hoặc xoá set gõ nhầm.**
   - Danh sách **Đã ghi ở bài này**: bút chì để sửa, thùng rác để xoá.
   - Kỷ lục và khối lượng tự tính lại. Xoá một set thì app quay lại làm đúng set đó.
6. **Set khởi động.**
   - Tích ô **Set khởi động** trước set đầu tiên, rồi bấm **Ghi set khởi động**.
   - Set này không tính vào số set, khối lượng và kỷ lục; sau đó nghỉ ngắn.
7. **Bản nhẹ khi điểm sẵn sàng thấp.**
   - Mức "Trung bình": bớt 1 set mỗi bài, tạ gợi ý giảm 10%.
   - Mức "Cần phục hồi": còn nửa số set, giảm 20%.
   - Công tắc bật/tắt ở màn trước khi tập.
8. **Gợi ý tăng tạ (tăng tải lũy tiến).**
   - Lần trước đủ số rep mục tiêu ở mọi set thì tăng tạ: bài nhiều khớp +2,5 kg, bài một khớp +1 kg.
   - Chưa đủ thì giữ tạ, cố thêm 1 rep. Bài giữ (plank) thì thêm 5 giây.
9. **Kỷ lục cá nhân (PR).**
   - Có tạ: 1RM ước tính = tạ × (1 + rep/30), nên so được 100 kg × 5 với 90 kg × 8.
   - Không tạ: nhiều rep nhất. Bài giữ: lâu nhất.
   - Phá kỷ lục thì app báo ngay trong buổi.
10. **Giọng PT.** Đếm giờ, báo nghỉ, nhắc form. Tắt/bật ngay trong buổi (**Giọng PT**) hoặc trong Cài đặt (tốc độ đọc, thời gian chuẩn bị).
11. **Giữ màn hình sáng và đồng hồ chính xác.** Màn hình không tự tắt khi đang tập. Lỡ chuyển app hay khoá máy thì quay lại đồng hồ vẫn đúng.
12. **Tiếp tục buổi tập dở và tự kết thúc.**
    - Trang Tập luyện hiện **Tiếp tục** cho buổi chưa xong.
    - Bỏ dở hơn 4 giờ thì app tự kết thúc buổi, thời gian tính đến set cuối.
13. **Màn tổng kết.** Thời gian, số set, khối lượng, điểm form, kỷ lục mới, nhóm cơ đã tập; nút **HeadBro nhận xét**.
14. **Tự soạn buổi (Custom).** Trong Thư viện bấm **Thêm vào buổi tự soạn** → nút **Buổi tự soạn** trên thanh tab → đặt tên → **Lưu & tập ngay**.
15. **Lịch tập tuần.** Gắn mỗi ngày với một buổi tập hoặc để nghỉ, rồi **Lưu lịch**; hoặc nhờ HeadBro lên lịch. Lịch quyết định calo ngày tập/ngày nghỉ.
16. **Bản đồ cơ (AI gợi ý).** Bấm một nhóm cơ → HeadBro chọn 3–5 bài dựa trên số set 7 ngày, điểm sẵn sàng, đạm, trình độ, dụng cụ, chấn thương → **Tập ngay**.
17. **Thư viện bài tập.**
    - Tìm theo tên (tiếng Anh/Việt), lọc nhóm cơ, dụng cụ, **Hợp dụng cụ của tôi**, **Có Camera AI**.
    - Bấm một bài để xem ảnh động, cơ chính/phụ, cách tập, lần tập trước, kỷ lục, gợi ý hôm nay.
18. **Lịch sử và kỷ lục.** Xem lại buổi đã tập, xoá buổi tập (kỷ lục tính lại), bảng kỷ lục.

### Chương 5. Camera AI
1. **Camera AI làm được gì.**
   - Đếm rep và chấm điểm form 0–100.
   - Nhắc lỗi bằng chữ và giọng, khung xương xanh = đúng form, cam = có lỗi.
   - Video chỉ xử lý trên máy, không gửi đi đâu.
2. **Bài được hỗ trợ.** Squat, lunge, push-up, curl, shoulder press, deadlift, plank, jumping jack. Trong buổi tập, bài có hỗ trợ mang nhãn **Hỗ trợ Camera AI**.
3. **Đặt điện thoại hoặc laptop thế nào.** Với từng bài: đứng nghiêng hay chính diện, khoảng cách 2–3 m, thấy đủ khớp, đủ sáng. Có hình minh hoạ vị trí đặt máy.
4. **Dùng trong buổi tập.**
   - Tự bật với bài hỗ trợ (tắt được trong Cài đặt) hoặc bấm **Bật Camera AI**.
   - **Đếm lại**, **Tắt camera**. Số rep camera đếm tự điền vào ô rep.
5. **Dùng riêng (trang Camera).** Tập một set bất kỳ có chấm điểm rồi lưu vào lịch sử tập.
6. **Hiểu điểm form.** ≥80 tốt, 50–79 cần chỉnh, dưới 50 nên giảm tạ hoặc xem lại kỹ thuật. Có các lỗi thường gặp kèm ý nghĩa.

### Chương 6. Dinh dưỡng
1. **Ghi bữa ăn bằng 6 cách** (hộp **Ghi bữa ăn**):
   - **Yêu thích**
   - **Gần đây**
   - **Ảnh**: chụp, AI tính, bạn kiểm tra rồi **Lưu**
   - **Mô tả**: gõ 1 câu
   - **Món Việt**: thư viện, có chọn khẩu phần
   - **Nhập tay**
2. **Chụp ảnh món ăn cho chuẩn.** Chụp từ trên xuống, đủ sáng, thấy cả bát/đĩa, mỗi lần một bữa. Ghi thêm mô tả nếu có món khó nhận ra, ví dụ "cơm 1,5 bát".
3. **Đọc vòng calo và macro.** Calo còn lại hoặc vượt; đạm, tinh bột, béo theo %; lịch sử 14 ngày (bấm một ngày để xem lại).
4. **Calo ngày tập / ngày nghỉ.** Theo lịch tuần: ngày tập +150 kcal, ngày nghỉ −150 kcal (chỉ tinh bột). Nhãn hiện ngay dưới vòng calo; tắt trong Cài đặt.
5. **Sửa, xoá, ăn lại một bữa.** Bấm bữa ăn → **Sửa** / **Xoá** / **Ăn lại hôm nay** / **Lưu yêu thích** / **Hỏi HeadBro**.
6. **Chép bữa hôm qua.** Nút **Chép bữa hôm qua** khi hôm nay giống hôm qua. Xem ngày cũ thì nút chép từ ngày trước đó.
7. **Món yêu thích.** Lưu từ chi tiết bữa ăn; ghi lại ở tab **Yêu thích**; bấm × để bỏ.
8. **Thư viện món Việt.** Tìm món, lọc **Clean eating**, xem chi tiết dinh dưỡng và mẹo ăn sạch, **Ghi nhanh**.
9. **Mục tiêu dinh dưỡng đến từ đâu.** Tính theo công thức Mifflin-St Jeor từ hồ sơ; muốn tự đặt thì vào Cài đặt.

### Chương 7. InBody & mục tiêu
1. **Nhập chỉ số cơ thể.** **Nhập chỉ số** → điền ô bất kỳ (cân nặng, % mỡ, cơ xương, mỡ nội tạng, BMR, vòng eo, ngực, tay, đùi…) → **Lưu**.
2. **Quét phiếu InBody.** **Quét phiếu InBody** → chụp phiếu → AI điền sẵn → kiểm tra lại rồi lưu.
3. **Ý nghĩa từng chỉ số.** Bấm vào ô chỉ số để xem "là gì" và "liên quan gì tới tập luyện". Thay đổi so với lần đo đầu: xanh = tốt, đỏ = ngược hướng.
4. **Biểu đồ theo thời gian.** Cân nặng / Cơ & mỡ / Số đo.
5. **Mất cân đối trái/phải.** Cần khối nạc từng phần trên phiếu InBody. Mức lệch và lời khuyên tập một bên.
6. **Sửa hoặc xoá lần đo.** Bút chì / thùng rác ở **Lịch sử đo**. Cân nặng hồ sơ và calo mục tiêu tự cập nhật theo lần cân mới nhất.
7. **Đặt mục tiêu.**
   - **Tự nhập** (tên, chỉ số theo dõi, giá trị, hạn chót, kế hoạch) hoặc **Đặt cùng HeadBro**: HeadBro hỏi từng bước.
   - Đạt 100% thì tự chuyển **Đã đạt** và có lời chúc mừng. Sắp hết hạn thì được nhắc ở Tổng quan.

### Chương 8. Cài đặt & dữ liệu
1. **Hồ sơ cá nhân.** Sửa thông tin thì mục tiêu dinh dưỡng tự tính lại. Có tuỳ chọn tự đặt mục tiêu.
2. **Giọng PT và buổi tập.** Bật/tắt giọng, tốc độ đọc, thời gian chuẩn bị, tự bật Camera AI, **Nghe thử giọng**, **Kiểm tra camera**.
3. **Giao diện và nhắc nhở.**
   - Chủ đề Sáng / Tối / Theo máy.
   - Nhắc check-in, giờ tập, uống nước. Chỉ hoạt động khi app đang mở trong trình duyệt.
4. **Calo theo ngày tập / nghỉ:** công tắc bật/tắt.
5. **Đổi hoặc đặt mật khẩu.** Tài khoản Google chưa có mật khẩu thì là "Đặt mật khẩu".
6. **Xuất dữ liệu, xoá sạch, xoá tài khoản.**
   - Xuất ra file JSON.
   - **Xoá sạch dữ liệu** phải gõ "XOA" để xác nhận.
   - **Xoá tài khoản** là vĩnh viễn. Nói rõ cái gì mất, cái gì không lấy lại được.
7. **Nhật ký AI.** Xem HeadBro đã xử lý từng câu hỏi thế nào. Dành cho người tò mò; có link sang mục 6.

---

## 5. Mục riêng: Lỗi & khắc phục

Mỗi lỗi viết theo mẫu **Triệu chứng → Nguyên nhân thường gặp → Cách xử lý từng bước**, nhóm theo chủ đề, có ô tìm kiếm riêng.

| Nhóm | Các lỗi |
|---|---|
| Đăng nhập | Quên mật khẩu (hiện chưa có tự đặt lại → hướng dẫn liên hệ quản trị hoặc dùng Google); "Email đã tồn tại"; Google không hiện nút; bị đăng xuất sau 30 ngày |
| Camera | Không bật được (chưa cho quyền: cách bật lại trên Chrome/Edge/Safari, điện thoại và máy tính); app khác đang dùng camera; không nhận ra người (lùi xa, đủ sáng, đủ khớp); đếm thiếu hoặc thừa rep; điểm form thấp bất thường |
| Giọng nói | Không có tiếng (máy tắt tiếng, chưa bật Giọng PT); giọng không phải tiếng Việt (dùng Chrome/Edge, cài giọng tiếng Việt); micro chat không nghe |
| Buổi tập | Gõ nhầm tạ/rep (→ Sửa set); lỡ thoát giữa buổi (→ Tiếp tục); buổi "Tự kết thúc vì bỏ dở"; đồng hồ nghỉ bị lệch; kỷ lục sai do set nhầm |
| AI & HeadBro | "Hết lượt AI hôm nay" (giới hạn, nhập tay vẫn được); AI tính calo sai (→ sửa số trước khi lưu); AI không trả lời hoặc báo lỗi kết nối; câu trả lời chưa ưng (→ Tạo lại / Sửa câu hỏi) |
| Dinh dưỡng | Không ghi được cho ngày mai (chặn ngày tương lai); calo mục tiêu thay đổi theo ngày (calo ngày tập/nghỉ); món không có trong thư viện |
| InBody & mục tiêu | Quét phiếu đọc sai số (kiểm tra trước khi lưu, chụp thẳng và rõ); mục tiêu không tự đạt (mục tiêu số buổi/tuần và mục tiêu "Khác" phải tự đánh dấu) |
| Hiển thị & dữ liệu | Số liệu chưa cập nhật (tải lại trang); nhắc nhở không hiện (cần mở app, cấp quyền thông báo); dữ liệu ở máy khác (đăng nhập cùng tài khoản) |

Cuối mục có nút **Vẫn chưa được? Hỏi HeadBro**, mở trợ lý kèm câu "Mình gặp lỗi: …".

---

## 6. Phần cuối: "Bên trong FitBro" (thu gọn sẵn)

Dành cho người tò mò hoặc khi thuyết trình. Giữ phần giải thích hiện có, viết lại cho dễ hiểu:
- Lớp an toàn kiểm tra tin nhắn trước.
- Bộ định tuyến chuyển câu hỏi cho chuyên gia tập luyện hoặc dinh dưỡng.
- Chuyên gia gọi công cụ để đọc dữ liệu thật rồi mới trả lời.
- Ghi dữ liệu thì cần bạn bấm Xác nhận.
- Danh sách công cụ của từng chuyên gia.

Kèm link sang trang Nhật ký AI.

---

## 7. Triển khai

- **Nội dung để riêng** trong `src/content/guide.ts`, dạng dữ liệu: chương → thẻ (tiêu đề, giới thiệu, dùng khi nào, các bước, mẹo, lưu ý, từ khoá, đường dẫn trang); lỗi → (triệu chứng, nguyên nhân, cách xử lý). Sửa chữ không cần đụng giao diện.
- **Giao diện** viết lại ở `src/pages/Guide.tsx`: ô tìm kiếm, phần giới thiệu, "Bắt đầu trong 5 bước", mục lục dính, thẻ mở/đóng, mục Lỗi & khắc phục, phần kỹ thuật thu gọn.
- **"Bắt đầu trong 5 bước"** dùng API sẵn có (hồ sơ, check-in, bữa ăn, buổi tập, số đo). Không cần backend mới.
- **Câu hỏi mẫu** bấm là mở trợ lý với câu đó (dùng `ai.open` có sẵn).
- **Kiểm tra:**
  - build, xem trên điện thoại/máy tính, bản sáng/tối
  - thử tìm kiếm (có dấu, không dấu)
  - bấm thử mọi nút "Mở trang" và câu hỏi mẫu
  - mở đường dẫn `#ten-the` thì cuộn đúng chỗ
  - đối chiếu từng tên nút trong bài với app thật

**Quy mô:** khoảng 70 thẻ hướng dẫn và 30 lỗi.

---

## 8. Cần bạn chọn

1. **Nút "?" trên từng trang:** thêm nút nhỏ cạnh tiêu đề mỗi trang (Tập luyện, Dinh dưỡng…), bấm là mở đúng chương hướng dẫn?
   - Đề xuất: **có**. Nút nhỏ, không chiếm chỗ.
2. **Minh hoạ:**
   - (a) biểu tượng + sơ đồ đơn giản tự vẽ (vị trí đặt camera, chú giải màu bản đồ cơ, các bước). Nhẹ, không cũ đi khi giao diện đổi.
   - (b) thêm ảnh chụp màn hình thật cho các thao tác chính. Trực quan hơn nhưng nặng và phải chụp lại khi giao diện đổi.
   - Đề xuất: **(a)**, chỉ thêm ảnh thật cho khoảng 5 thao tác khó nhất nếu bạn muốn.
3. **Không dấu:** tìm kiếm có cần hiểu tiếng Việt gõ không dấu ("sua set") không? Đề xuất: **có**.
