# Thiết kế giao diện: trang quản trị đơn in 3D

## Bối cảnh

- **Người dùng:** chỉ một người là Trung, chủ xưởng. Trung mở trang trên laptop, đôi khi trên điện thoại giữa lúc đang chạy máy in.
- **Việc chính:** nhìn một lần là biết hôm nay cần làm gì: đơn nào chưa có file, đơn nào chờ thanh toán, máy đang in những đơn nào. Sau đó đẩy đơn sang bước tiếp theo thật nhanh.
- **Tham khảo:** Kênh Người Bán của Shopee (thanh "Việc cần làm" đếm đơn theo trạng thái, menu bên trái, danh sách đơn có tab trạng thái) và dashboard affiliate (doanh thu theo thời gian). Chỉ lấy *cách tổ chức thông tin*, không lấy màu cam hay kiểu thẻ của họ.
- **Phải khớp với web chính:** dùng cùng bảng màu, font, cách bo góc, chế độ sáng/tối và logo. Mở trang quản trị phải thấy ngay đây là cùng một xưởng.

## Bảng màu

Dùng lại nguyên token trong `src/index.css`, không thêm màu mới:

| Tên | Hex (sáng / tối) | Dùng cho |
|---|---|---|
| Studio | `#F7F8F6` / `#101815` | nền trang |
| Paper | `#FFFFFF` / `#17211D` | bề mặt nổi: bảng, panel, khối 3D |
| Ink (Graphite) | `#1B2420` / `#E4EBE7` | chữ chính, nút chính |
| Slate | `#5B6661` / `#9EACA5` | chữ phụ |
| Solder | `#12704A` / `#4CC28B` | bước hiện tại, link, mục menu đang chọn |
| ENIG | `#C99A2E` / `#E0B85A` | chỉ dùng cho đồ hoạ: mép mạ vàng trên khối 3D, chấm báo "cần xử lý" |

Trạng thái *Đã huỷ* dùng `alert`. Trạng thái *Chưa có file* dùng `caution`.

## Chữ

- **Bricolage Grotesque** cho tiêu đề trang và các con số lớn trên khối 3D (opsz 96, đậm 700, giãn chữ −0,03em).
- **Be Vietnam Pro** cho bảng và form. Mọi con số đều dùng `tabular-nums`.
- Thang cỡ chữ lấy từ web chính: 14, 16, 18, 21, 24, 36, 48.
- Không dùng nhãn VIẾT HOA, không dùng dấu chấm giữa (·) để nối thông tin, không dùng font mono, không thêm "→" vào nút.

## Bố cục

```
máy tính
┌ menu 240 ────┐┌ nội dung (tối đa 1120, căn trái) ──────────────────────┐
│ ▣ Đức Trung   ││ Tổng quan                         [Tìm mã, tên, SĐT]   │
│   Quản trị    ││                                                         │
│               ││  ╱▔▔▔╲  ╱▔▔▔╲  ╱▔▔▔╲  ╱▔▔▔╲  ╱▔▔▔╲     ← dây chuyền 3D │
│ Tổng quan     ││  │ 3 │  │ 1 │  │ 2 │  │ 0 │  │ 12│                    │
│ Đơn hàng  ●4  ││  Đã nhận Đã TT  Đang in Giao   Hoàn tất   Đã huỷ 1     │
│ Màu nhựa      ││                                                         │
│               ││  Tạm tính 30 ngày │ Đơn 7 ngày │ Chưa có file │ Chờ TT   │
│               ││  ─────────────────────────────────────────────────────  │
│ ☾  Đăng xuất  ││  Cần xử lý (đơn chưa có file, đơn chờ thanh toán lâu)   │
└───────────────┘└─────────────────────────────────────────────────────────┘

điện thoại: menu trái chuyển thành thanh tab dưới đáy. Dây chuyền 3D cuộn ngang được.
```

- **Tổng quan** (trang mặc định mới):
  - Dây chuyền đơn: 5 khối isometric xếp theo thứ tự trạng thái, mỗi khối là một "tấm mạch" in con số đơn đang ở bước đó. Đây là "Việc cần làm" của Shopee, dựng thành hình khối giống cảnh 3D ở trang chủ.
  - Một hàng số liệu kiểu datasheet, giống dải thông số dưới hero của web chính.
  - Danh sách "Cần xử lý".
- **Đơn hàng:** các tab trạng thái có kèm số đếm, như Shopee. Danh sách đơn có chấm màu nhựa, trạng thái dạng viên thuốc, và badge "Chưa có file". Bấm một dòng thì mở trang chi tiết.
- **Chi tiết đơn:**
  - Cột trái: thông tin khách, thông số in, file và Drive.
  - Cột phải: dòng thời gian trạng thái (cùng kiểu với trang tra cứu) và bảng đổi trạng thái.
  - Đầu trang: một "mẫu nhựa" 3D nhỏ, là khối isometric tô đúng màu nhựa của đơn.
- **Màu nhựa:** mỗi màu là một mẫu nhựa isometric tô màu thật. Có ô chọn màu, công tắc ẩn/hiện, đổi thứ tự, và mẫu thêm màu mới.
- **Đăng nhập:** nền studio. Logo ở trên, khung đăng nhập ở giữa, bên trên là một khối mạch isometric nhỏ đứng trên bóng mềm.

## Nguyên tắc

1. **Chỉ có một điểm nhấn táo bạo:** dây chuyền đơn 3D ở trang Tổng quan. Khối được dựng bằng CSS 3D transform (`rotateX`/`rotateZ` kiểu isometric, có mặt trên, mặt bên, cạnh dày và bóng mềm từ nguồn sáng studio). Bước có đơn thì khối nhô cao hơn. Bước đang có việc thì mép khối viền vàng ENIG. Mọi thứ khác phẳng và yên tĩnh.
2. **Mẫu nhựa 3D chỉ là chi tiết phụ:** khối nhỏ tô màu thật, chỉ dùng ở những chỗ màu sắc mang thông tin (danh sách màu, chi tiết đơn).
3. **Bo góc theo cấp bậc như web chính:** panel 16px, nút và ô nhập 10px, viên thuốc bo tròn hẳn. Phân cấp bằng khoảng trống và đường kẻ Mist, không bọc mọi thứ trong thẻ có bóng giống nhau.
4. **Chuyển động:** chỉ có một khoảnh khắc khi tải trang Tổng quan, các khối mọc lên lần lượt. Ngoài ra chỉ có phản hồi khi Trung thao tác: đổi trạng thái thì khối tương ứng nhún nhẹ. Khi bật `prefers-reduced-motion` thì hiện sẵn trạng thái cuối.
5. **Có cả chế độ sáng và tối:** dùng chung cơ chế `data-theme` và cùng khoá `localStorage('theme')` với web chính, nên chọn sáng/tối ở một bên thì bên kia cũng theo.

## Dữ liệu mới cần có

`GET /api/stats` trong admin Worker, có kiểm tra phiên đăng nhập. Trả về:
- số đơn theo từng trạng thái;
- số đơn trong 7 ngày qua;
- tổng giá tạm tính của các đơn không bị huỷ trong 30 ngày qua;
- số đơn chưa có file;
- danh sách "cần xử lý", tối đa 8 đơn: đơn chưa có file trước, rồi tới đơn ở trạng thái "Đã nhận đơn" quá 24 giờ.

## Đối chiếu với các mặc định hay gặp

- **Bộ thẻ số liệu kiểu SaaS:** không dùng. Số liệu chính nằm trên khối 3D của dây chuyền. Số liệu phụ là một hàng datasheet có vạch ngăn, giống web chính.
- **Màu cam của Shopee:** không lấy. Màu nhấn vẫn là xanh solder.
- **Bảng dày đặc nhiều đường kẻ:** dùng dòng cao, đường kẻ Mist mảnh, cột số căn phải.
