# Thiết kế giao diện: trang portfolio và dịch vụ của Đức Trung

## Bối cảnh

- **Trang này về gì:** dịch vụ làm mẫu phần cứng. Thiết kế PCB (Altium/Allegro), firmware, gia công và hàn mạch, in 3D vỏ hộp khớp mạch.
- **Khách hàng:** sinh viên làm đồ án, nhóm nghiên cứu, startup đang làm mẫu, dân DIY.
- **Việc chính của trang:** cho khách thấy Trung làm được *cả mạch lẫn vỏ, và hai thứ khớp nhau*. Sau đó đưa khách tới (1) báo giá in 3D tức thì hoặc (2) nhắn Zalo để đặt thiết kế mạch.

## Bảng màu

| Tên | Hex | Dùng cho |
|---|---|---|
| Studio | `#F7F8F6` | nền trang, trắng hơi lạnh như phòng chụp sản phẩm |
| Paper | `#FFFFFF` | bề mặt nổi: ảnh, panel |
| Graphite | `#1B2420` | chữ chính, màu đen pha xanh |
| Slate | `#5B6661` | chữ phụ |
| Mist | `#E3E7E4` | viền, đường kẻ |
| Solder | `#12704A` | màu nhấn: màu mặt nạ hàn PCB. Dùng cho nút chính, link, trạng thái đang chọn. Tương phản 6,1:1 trên nền trắng |
| ENIG | `#C99A2E` | chỉ dùng cho đồ hoạ: đường kích thước CAD, pad mạ vàng. Không dùng cho chữ |

## Chữ

- **Bricolage Grotesque** (opsz 12–96, wght 400–800) cho tiêu đề. Ở cỡ lớn dùng opsz 96, đậm 700, giãn chữ −0,03em.
- **Be Vietnam Pro** (400/500/600/700) cho nội dung và giao diện. Cỡ 16/1,6. Số liệu dùng `tabular-nums`, không dùng font mono.
- Thang cỡ chữ (theo Bringhurst): 14 · 16 · 18 · 21 · 24 · 36 · 48 · 72, riêng hero dùng `clamp(44px, 7vw, 96px)`.
- Không dùng nhãn VIẾT HOA nhỏ trên tiêu đề. Không tách các mẩu thông tin bằng dấu chấm giữa (·). Không thêm "→" vào nút.

## Bố cục

Lưới 12 cột, rộng tối đa 1200px, mọi khối căn trái.

```
nav    Đức Trung                     Dự án  Gói dịch vụ  Báo giá in 3D   [Nhắn Zalo]
hero   H1 (5 cột) + mô tả + 2 nút     │  cảnh 3D (7 cột, tràn mép phải)
       bảng thông số dạng datasheet   │  [Tách lớp] kéo để xoay
dự án  PX4 (ảnh render + ảnh mạch thật, lớn) / Cubli + ESP-FC (hai cột, khác tỉ lệ)
gói    4 bậc thang tăng dần trái → phải, mỗi bậc có hình isometric tầng mạch
báo giá  khung 3D (có vùng thả file bên trong) │ tuỳ chọn + phiếu tạm tính
quy trình  4 bước nằm ngang (thật sự là một chuỗi tuần tự)
liên hệ  một câu lớn + Zalo / gọi / email; footer
```

## Nguyên tắc

1. **Chỉ có một điểm nhấn táo bạo:** cảnh 3D lắp ráp vỏ, PCB và nắp mờ trong hero. Mọi thứ khác yên tĩnh và có kỷ luật.
2. **Ngôn ngữ bản vẽ CAD chỉ dùng khi mang thông tin thật.** Đường kích thước và chú thích màu vàng nêu đúng một dữ kiện: khe hở, khổ in, vị trí. Không dùng làm trang trí.
3. **Ánh sáng studio trắng:** bề mặt trắng, bóng mềm sinh ra từ nguồn sáng. Phân cấp bằng kích thước và khoảng trống, không đóng mọi thứ vào hộp có bóng giống nhau. Bo góc khác nhau theo cấp bậc: ảnh 24px, panel 16px, nút điều khiển 10px, viên thuốc thì bo tròn hẳn.
4. **Dùng tư liệu thật:** ảnh render và ảnh mạch thật lấy từ GitHub của Trung (hotlink `raw.githubusercontent.com`).
5. **Chuyển động:** chỉ một khoảnh khắc lúc tải trang (vỏ lắp ráp). Mọi chuyển động khác đều do người dùng kích hoạt (tách lớp, xoay). Tôn trọng cài đặt `prefers-reduced-motion`: khi bật thì hiện sẵn trạng thái đã lắp, không tự xoay.

## Đối chiếu với các mặc định hay gặp

- Tông kem + serif + cam đất: không dùng. Chọn trắng lạnh, grotesque và xanh solder lấy từ chính chủ đề.
- Bộ thẻ kiểu SaaS: gói dịch vụ làm dạng bậc thang, dự án làm dạng một bài chính + hai bài phụ khác tỉ lệ. Không phải lưới thẻ giống hệt nhau.
- Nhãn VIẾT HOA, dấu chấm giữa, chữ mono: bỏ toàn bộ, kể cả trong phần báo giá cũ.
- Đánh số chỉ dùng ở Quy trình (một chuỗi thật) và gói (lũy tiến thật).
