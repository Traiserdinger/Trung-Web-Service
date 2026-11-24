# Cài đặt Cloudflare (cơ sở dữ liệu, trang admin, triển khai)

Từ bản này, đơn hàng được lưu trong cơ sở dữ liệu **Cloudflare D1** và Trung quản lý đơn ở một **trang admin riêng**, được bảo vệ bằng **Cloudflare Access** (đăng nhập bằng email). Có hai Worker:

| Worker | Tên | Việc | Cấu hình |
|---|---|---|---|
| Công khai | `trung-pcb-3d` | Trang báo giá, nhận đơn, tra cứu đơn của khách | `wrangler.jsonc` |
| Admin | `trung-3d-admin` | Trang quản lý đơn, đổi trạng thái, sửa màu (chỉ Trung vào được) | `wrangler.admin.jsonc` |

Làm theo các bước dưới đây **một lần**, mất khoảng 45 phút. **Thứ tự rất quan trọng**: tạo D1 và dán id, đặt secret, deploy Worker công khai, deploy Worker admin, bật Access, điền vars, cuối cùng cập nhật Script Properties của Apps Script rồi deploy lại Apps Script. Cài Apps Script trước theo [`setup-apps-script.md`](setup-apps-script.md) (bước 1 đến 3) để có URL Web app.

> **Bí mật không bao giờ được dán vào repo hay vào code website.** Secret chỉ nhập bằng lệnh `wrangler secret put` (hoặc vào Script Properties của Apps Script). Các file `wrangler.jsonc` và `wrangler.admin.jsonc` chỉ chứa giá trị công khai (id cơ sở dữ liệu, địa chỉ website).

> **Khi `APPS_SCRIPT_URL` còn trống**, website chạy như **bản preview**: đơn vẫn được lưu vào D1 và xem được ở trang admin, nhưng **không có upload file STL, không gửi email, không nhắn Telegram**. Hãy điền biến này ở bước 8 để chạy thật.

Các lệnh dưới đây chạy trong thư mục dự án (PowerShell hoặc Terminal).

## 1. Đăng nhập Cloudflare

```powershell
npx wrangler login
```

Trình duyệt mở ra, chọn **Allow**. Chỉ làm một lần trên mỗi máy.

## 2. Tạo cơ sở dữ liệu D1

Tạo hai database: `trung-3d` (chạy thật) và `trung-3d-preview` (cho bản xem thử của nhánh khác).

```powershell
npx wrangler d1 create trung-3d
```
```powershell
npx wrangler d1 create trung-3d-preview
```

Mỗi lệnh in ra một `database_id` (dạng `xxxxxxxx-xxxx-…`). Dán vào các file sau, thay cho dãy `00000000-0000-0000-0000-000000000000`:

| File | Vị trí | id cần dán |
|---|---|---|
| `wrangler.jsonc` | `d1_databases` (khối chính) | id của `trung-3d` |
| `wrangler.jsonc` | `previews` → `d1_databases` → `database_id` | id của `trung-3d-preview` |
| `wrangler.jsonc` | `d1_databases` (khối chính) → `preview_database_id` | id của `trung-3d-preview` (**cùng id**, dán ở cả hai chỗ) |
| `wrangler.admin.jsonc` | `d1_databases` | id của `trung-3d` (cùng DB với Worker công khai) |

`database_id` không phải bí mật, được phép commit. Giữ nguyên `binding` là `DB`.

## 3. Tạo bảng trong cơ sở dữ liệu

```powershell
npx wrangler d1 migrations apply DB --remote
```

Hỏi xác nhận thì gõ `y`. Lệnh tạo bảng đơn hàng và 4 màu mặc định (Đen, Trắng, Đỏ, Nâu). Các lần deploy sau, `npm run deploy` tự chạy lại bước này cho database thật nên không cần làm tay nữa.

**Database preview cũng cần tạo bảng**, vì `npm run deploy` chỉ migrate database thật:

```powershell
npx wrangler d1 migrations apply DB --remote --preview
```

**Mỗi khi thêm một file mới trong thư mục `migrations/`, chạy lại lệnh này** cho database preview (database thật thì `npm run deploy` lo).

## 4. Đặt secret

Lệnh sẽ hỏi bạn nhập giá trị (không hiện trên màn hình). Tạo `SHARED_SECRET` bằng:

```bash
openssl rand -hex 32
```

(Máy Windows không có `openssl`: chạy lệnh này trong Git Bash, hoặc dùng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.)

**Worker công khai:**

| Secret | Giá trị lấy ở đâu |
|---|---|
| `SHARED_SECRET` | chuỗi vừa sinh ở trên. **Lưu lại**, còn dùng cho Worker admin ngay bên dưới và ở bước 9 |
| `TELEGRAM_BOT_TOKEN` | token của bot Telegram (từ @BotFather) |
| `TELEGRAM_CHAT_ID` | id cuộc trò chuyện nhận tin báo đơn |
| `TURNSTILE_SECRET` | secret key Cloudflare Turnstile. **Tuỳ chọn**, bỏ qua nếu không dùng |

```powershell
npx wrangler secret put SHARED_SECRET
```
```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
```
```powershell
npx wrangler secret put TELEGRAM_CHAT_ID
```
```powershell
npx wrangler secret put TURNSTILE_SECRET
```

**Worker admin** (thêm `-c wrangler.admin.jsonc`). Chỉ cần `SHARED_SECRET`, **cùng giá trị** với Worker công khai:

```powershell
npx wrangler secret put SHARED_SECRET -c wrangler.admin.jsonc
```

> **Lưu ý thứ tự:** lệnh `secret put` chỉ chạy được khi Worker đã tồn tại. Nếu báo Worker chưa tồn tại, hãy làm bước 5 (Worker công khai) và bước 6 (Worker admin) trước để có lần deploy đầu, rồi quay lại đặt secret và deploy lại.

## 5. Deploy Worker công khai

Trên dashboard Cloudflare, vào **Workers & Pages** → Worker `trung-pcb-3d` → **Settings** → **Build** (Workers Builds), đặt:

| Ô | Giá trị |
|---|---|
| Build command | `npm ci && npm run build` (giữ nguyên nếu đã có) |
| Deploy command | `npm run deploy` |

`npm run deploy` chạy migration D1 rồi deploy Worker. Push lên nhánh `main` là Cloudflare tự làm.

## 6. Deploy Worker admin

Tạo project Workers Builds thứ hai từ **cùng repo** này: **Workers & Pages** → **Create** → **Import a repository** → chọn repo.

| Ô | Giá trị |
|---|---|
| Tên Worker | `trung-3d-admin` |
| Build command | `npm ci` |
| Deploy command | `npm run deploy:admin` |

(Lệnh deploy tự build giao diện admin ra thư mục `dist-admin`.) Sau khi deploy xong, địa chỉ admin là `https://trung-3d-admin.<subdomain>.workers.dev`.

## 7. Bật Cloudflare Access cho trang admin

**Làm ngay sau khi Worker admin lên, trước khi dùng thật**, nếu không ai biết địa chỉ cũng vào được.

1. Vào Worker `trung-3d-admin` → **Settings** → **Domains & Routes** → dòng `workers.dev` → **Enable Cloudflare Access**.
2. Bấm **Manage Cloudflare Access** để sửa policy: mục **Include** chọn **Emails**, chỉ điền email của Trung.
3. Mục **Login methods** bật **Google** và **One-time PIN**.
4. Mở ứng dụng Access vừa tạo, copy hai giá trị: **Application Audience (AUD) tag** và **team domain** (dạng `tên-team.cloudflareaccess.com`).

## 8. Điền các biến (vars)

Điền vào hai file rồi commit và push (đây là giá trị công khai, không phải bí mật).

**`wrangler.jsonc` (Worker công khai), mục `vars`:**

| Biến | Giá trị |
|---|---|
| `PUBLIC_SITE_URL` | địa chỉ website khách, ví dụ `https://trung-pcb-3d.<subdomain>.workers.dev` |
| `ADMIN_SITE_URL` | địa chỉ admin ở bước 6 |
| `APPS_SCRIPT_URL` | Web app URL của Apps Script (`https://script.google.com/macros/s/…/exec`) |

**`wrangler.admin.jsonc` (Worker admin), mục `vars`:**

| Biến | Giá trị |
|---|---|
| `ACCESS_TEAM_DOMAIN` | team domain ở bước 7, ví dụ `tên-team.cloudflareaccess.com` |
| `ACCESS_AUD` | AUD tag ở bước 7 |
| `ADMIN_EMAILS` | email được phép vào admin; nhiều email cách nhau bằng dấu phẩy |
| `APPS_SCRIPT_URL` | cùng URL Apps Script như trên |
| `PUBLIC_SITE_URL` | cùng địa chỉ website khách như trên |

Bản preview (`previews`) cố ý để `APPS_SCRIPT_URL` trống để xem thử không gửi email hay Telegram thật.

Trong `src/config/contactConfig.ts`, `appsScriptUrl` cũng dán **cùng URL Apps Script**. Từ nay trình duyệt chỉ dùng nó để **tải file STL lên** (cần vé do Worker cấp). Đơn hàng thì gửi thẳng cho Worker và lưu trong D1.

Push lên `main` để cả hai Worker deploy lại với các biến mới.

## 9. Cập nhật Apps Script và deploy lại

Mở dự án Apps Script, vào **Project Settings** → **Script properties** và thêm hai dòng (xem thêm [`setup-apps-script.md`](setup-apps-script.md)):

| Property | Giá trị |
|---|---|
| `SHARED_SECRET` | **đúng** chuỗi đã đặt ở bước 4 |
| `WORKER_URL` | địa chỉ Worker công khai, **không** có dấu `/` ở cuối |

Sau đó **deploy lại**: **Deploy** → **Manage deployments** → biểu tượng bút chì → **Version: New version** → **Deploy**. Không tạo version mới thì Apps Script vẫn chạy cấu hình cũ.

## 10. Kiểm tra cuối

1. **Admin có khoá chưa**: mở địa chỉ admin ở **cửa sổ ẩn danh**. Phải bị chuyển sang trang đăng nhập của Cloudflare. Thấy trang admin ngay thì Access chưa bật đúng, quay lại bước 7.
2. **Đăng nhập admin** bằng email của Trung: thấy danh sách đơn, có mục **Màu**.
3. **Gửi thử một đơn** ở website (nhập email của bạn, thả file STL nhỏ). Có mã đơn dạng `P3D-…`. Telegram phải nhận tin, Drive có thư mục `P3D-…` chứa file STL.
4. **Tra cứu đơn** đó bằng mã đơn và SĐT ở trang tra cứu: phải thấy trạng thái "Đã nhận đơn".
5. **Đổi trạng thái** đơn trong admin (ví dụ sang "Đang in 3D") và **gõ ghi chú tiếng Việt có dấu** (ví dụ `Đã in xong, đang kiểm tra bề mặt`). Email gửi tới khách phải có **tiêu đề và nội dung hiện đúng dấu tiếng Việt**. Việc này cũng xác nhận chữ ký HMAC giữa Worker và Apps Script hoạt động đúng với UTF-8 trên môi trường thật. Nếu không có email, kiểm tra `SHARED_SECRET` hai nơi giống hệt nhau và Apps Script đã deploy version mới.
6. Tra cứu lại đơn: trạng thái mới và ghi chú hiện ra.

## Sửa màu in

Vào trang admin → **Màu** để thêm, sửa, tắt màu (tên và mã màu). Không cần sửa code hay deploy lại. Chỉ **màu mẫu của từng loại nhựa** vẫn nằm ở `src/config/pricingConfig.ts`.

## Khi có sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| Admin báo không được phép | Email đăng nhập không có trong `ADMIN_EMAILS`, hoặc `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` điền sai |
| Gửi đơn được nhưng không có email/Telegram/file | `APPS_SCRIPT_URL` còn trống (chế độ preview), hoặc thiếu secret ở bước 4 |
| Email không gửi sau khi đổi trạng thái | `SHARED_SECRET` hai nơi khác nhau, hoặc chưa deploy lại Apps Script (bước 9) |
| `wrangler` báo sai `database_id` | Kiểm tra lại bước 2, id đúng trong cả ba chỗ |
