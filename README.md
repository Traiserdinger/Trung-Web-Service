# Báo giá in 3D – Nguyễn Đức Trung

Web tĩnh cho phép khách thả file `.stl`, xem mô hình 3D trên bàn in Bambu Lab A1 Mini, nhận **giá tạm tính** và **gửi đơn**. Đơn được lưu trong cơ sở dữ liệu Cloudflare D1 và Trung quản lý ở trang admin riêng (có đăng nhập). File STL lưu vào Google Drive của Trung, kèm thông báo Telegram và email.

- Spec: [`docs/superpowers/specs/2026-11-20-quote3d-calculator-design.md`](docs/superpowers/specs/2026-11-20-quote3d-calculator-design.md)
- Cài Cloudflare (D1, trang admin, đăng nhập bằng mã email, triển khai): [`docs/setup-cloudflare.md`](docs/setup-cloudflare.md)
- Cài Apps Script nhận đơn: [`docs/setup-apps-script.md`](docs/setup-apps-script.md)
- Hiệu chỉnh hệ số giá: [`docs/calibration.md`](docs/calibration.md)

## Chạy trên máy

Cần Node.js 24 LTS (từ 24.15) hoặc Node.js 26 trở lên, vì Vite 8, Vitest 5 và jsdom 31 không chạy trên bản cũ hơn. Cloudflare Pages đọc phiên bản từ file `.nvmrc`.

```powershell
npm install
npm run dev      # mở http://localhost:5173
npm test         # chạy toàn bộ test
npm run build    # build ra thư mục dist/ (site khách) và dist-admin/ (trang admin)
```

## Sửa giá và thông tin mà không đụng code giao diện

| File | Nội dung |
|---|---|
| `src/config/pricingConfig.ts` | Giá/gram từng loại nhựa, phí thời gian (30 phút đầu miễn phí, 1.850đ mỗi block 30 phút), giá sàn, `safetyMargin`, bảng tốc độ đùn `flowRate`, các hệ số slicer, khổ bàn in, giới hạn file |
| `src/config/contactConfig.ts` | Tên, SĐT/Zalo, email, GitHub, **URL Apps Script** (chỉ dùng để upload file STL), Turnstile site key |

**Màu in** không sửa trong code nữa: vào trang admin → **Màu** để thêm, sửa, tắt màu. Chỉ màu mẫu của từng loại nhựa vẫn nằm trong `pricingConfig.ts`.

Sửa xong thì commit và push lên GitHub. Cloudflare sẽ tự build lại.

## Đưa web lên Cloudflare

Website chạy trên **Cloudflare Workers** (Worker công khai `trung-pcb-3d` và Worker admin `trung-3d-admin`), mỗi lần push lên nhánh `main` thì tự build và deploy. Cách tạo cơ sở dữ liệu, đặt secret, đặt đăng nhập admin bằng mã gửi qua email và các bước theo thứ tự nằm trong [`docs/setup-cloudflare.md`](docs/setup-cloudflare.md).

> Khi `APPS_SCRIPT_URL` (Worker) còn trống, site chạy như bản preview: đơn vẫn lưu nhưng không upload file, không gửi email hay Telegram.

## Khách quên mã đơn

1. Khách mở lại `/tra-cuu` trên đúng máy đã gửi đơn → mục "Đơn đã gửi từ máy này".
2. Không có → khách nhắn Zalo, Trung tìm theo SĐT trong ô tìm kiếm của trang admin.
3. Ô SĐT luôn bắt buộc khi đặt đơn nên đơn nào cũng tìm được theo SĐT.

## Cấu trúc

```
src/config/        giá, hệ số, thông tin liên hệ
src/utils/         hàm thuần, có test: hình học mesh, ước tính slicer, tính giá, đơn hàng
src/workers/       Web Worker đọc STL
src/lib/           client của worker, gửi đơn
src/components/    giao diện (quote/ và layout/)
src/pages/         trang tra cứu đơn của khách
src/admin/         giao diện trang admin (build ra dist-admin/)
worker/public/     Worker công khai: API đơn hàng, tra cứu (wrangler.jsonc)
worker/admin/      Worker admin: API quản trị đăng nhập bằng mã gửi qua email (wrangler.admin.jsonc)
migrations/        migration cơ sở dữ liệu D1
apps-script/       Code.gs: lưu file STL vào Drive và gửi Gmail
tests/fixtures/    sinh mesh mẫu cho test
```
