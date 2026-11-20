# Báo giá in 3D – Nguyễn Đức Trung

Web tĩnh cho phép khách thả file `.stl`, xem mô hình 3D trên bàn in Bambu Lab A1 Mini, nhận **giá tạm tính** và **gửi đơn**. File và thông tin đơn được lưu vào Google Drive của Trung, kèm thông báo Telegram và email.

- Spec: [`docs/superpowers/specs/2026-11-20-quote3d-calculator-design.md`](docs/superpowers/specs/2026-11-20-quote3d-calculator-design.md)
- Cài Apps Script nhận đơn: [`docs/setup-apps-script.md`](docs/setup-apps-script.md)
- Hiệu chỉnh hệ số giá: [`docs/calibration.md`](docs/calibration.md)

## Chạy trên máy

Cần Node.js 24 LTS (từ 24.15) hoặc Node.js 26 trở lên, vì Vite 8, Vitest 5 và jsdom 31 không chạy trên bản cũ hơn. Cloudflare Pages đọc phiên bản từ file `.nvmrc`.

```powershell
npm install
npm run dev      # mở http://localhost:5173
npm test         # chạy toàn bộ test
npm run build    # build ra thư mục dist/
```

## Sửa giá và thông tin mà không đụng code giao diện

| File | Nội dung |
|---|---|
| `src/config/pricingConfig.ts` | Giá/gram từng loại nhựa, phí thời gian (30 phút đầu miễn phí, 1.850đ mỗi block 30 phút), giá sàn, `safetyMargin`, bảng tốc độ đùn `flowRate`, các hệ số slicer, khổ bàn in, giới hạn file |
| `src/config/contactConfig.ts` | Tên, SĐT/Zalo, email, GitHub, **URL Apps Script**, Turnstile site key |

Sửa xong thì commit và push lên GitHub. Cloudflare Pages sẽ tự build lại.

## Đưa web lên Cloudflare Pages (miễn phí)

1. Tạo một repo **trống** trên GitHub, ví dụ `in3d-web`, rồi push code lên:
   ```powershell
   git remote add origin https://github.com/<tài-khoản>/in3d-web.git
   ```
   ```powershell
   git push -u origin main
   ```
2. Vào [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**, rồi chọn repo vừa tạo.
3. Cấu hình build:
   - Framework preset: **Vite** (hoặc None)
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Bấm **Save and Deploy**. Web sẽ chạy ở địa chỉ `https://<tên-dự-án>.pages.dev`.
5. Mỗi lần push lên nhánh `main`, Cloudflare tự build và deploy lại.

> Nhớ dán URL Apps Script vào `contactConfig.appsScriptUrl` trước khi deploy, nếu không khách sẽ gặp lỗi "Chưa cấu hình nơi nhận đơn".

## Cấu trúc

```
src/config/        giá, hệ số, thông tin liên hệ
src/utils/         hàm thuần, có test: hình học mesh, ước tính slicer, tính giá, đơn hàng
src/workers/       Web Worker đọc STL
src/lib/           client của worker, gửi đơn
src/components/    giao diện (quote/ và layout/)
apps-script/       Code.gs: nhận đơn trên Google Apps Script
tests/fixtures/    sinh mesh mẫu cho test
```
