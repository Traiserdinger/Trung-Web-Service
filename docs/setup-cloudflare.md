# Cài đặt Cloudflare (cơ sở dữ liệu, trang admin, triển khai)

Từ bản này, đơn hàng được lưu trong cơ sở dữ liệu **Cloudflare D1** và Trung quản lý đơn ở một **trang admin riêng**, được bảo vệ bằng **đăng nhập bằng mã gửi qua email** (không có mật khẩu). Có hai Worker:

| Worker | Tên | Việc | Cấu hình |
|---|---|---|---|
| Công khai | `trung-pcb-3d` | Trang báo giá, nhận đơn, tra cứu đơn của khách | `wrangler.jsonc` |
| Admin | `trung-3d-admin` | Trang quản lý đơn, đổi trạng thái, sửa màu (chỉ Trung vào được) | `wrangler.admin.jsonc` |

Làm theo các bước dưới đây **một lần**, mất khoảng 45 phút. **Thứ tự rất quan trọng**: tạo D1 và dán id, đặt secret, deploy Worker công khai, deploy Worker admin, điền vars, cuối cùng cập nhật Script Properties của Apps Script rồi deploy lại Apps Script. Cài Apps Script trước theo [`setup-apps-script.md`](setup-apps-script.md) (bước 1 đến 3) để có URL Web app.

> **Apps Script phải được cập nhật và deploy lại trước khi đăng nhập admin**, vì email chứa mã đăng nhập được gửi đi qua Apps Script (bước 9). Chưa làm bước 9 thì sẽ không nhận được mã.

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

Hỏi xác nhận thì gõ `y`. Lệnh tạo bảng đơn hàng, 4 màu mặc định (Đen, Trắng, Đỏ, Nâu) và bảng phục vụ đăng nhập admin (migration `0002`, **bắt buộc có**). Các lần deploy sau, `npm run deploy` tự chạy lại bước này cho database thật nên không cần làm tay nữa.

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

**Worker admin** (thêm `-c wrangler.admin.jsonc`). Cần hai secret:

| Secret | Giá trị lấy ở đâu |
|---|---|
| `SHARED_SECRET` | **cùng giá trị** với Worker công khai |
| `ADMIN_SESSION_SECRET` | một chuỗi ngẫu nhiên **mới**, sinh bằng `openssl rand -hex 32`. Dùng để ký mã đăng nhập và phiên đăng nhập |

```powershell
npx wrangler secret put SHARED_SECRET -c wrangler.admin.jsonc
```
```powershell
npx wrangler secret put ADMIN_SESSION_SECRET -c wrangler.admin.jsonc
```

> **Đổi `ADMIN_SESSION_SECRET` là đăng xuất mọi nơi.** Nút Đăng xuất chỉ xoá đăng nhập trên trình duyệt đang dùng. Nếu mất điện thoại hoặc nghi có người khác vào được, hãy đặt lại secret này bằng một chuỗi mới (`openssl rand -hex 32`) rồi `wrangler secret put` lại: mọi phiên cũ mất hiệu lực ngay.

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

## 7. Đăng nhập trang admin

Trang admin không có mật khẩu. Mỗi lần đăng nhập, hệ thống gửi một **mã 6 số** tới email đầu tiên trong `ADMIN_EMAILS`:

1. Mở địa chỉ admin: https://trung-3d-admin.minhlaductrung.workers.dev
2. Bấm **Gửi mã tới email**.
3. Mở Gmail, tìm thư có tiêu đề `[In 3D Trung] Mã đăng nhập quản trị: ...`, lấy mã 6 số.
4. Nhập mã vào ô **Mã 6 số** rồi đăng nhập.

Cần biết:

- Mã chỉ có hiệu lực **10 phút** và dùng được **một lần**. Nhập sai 5 lần thì mã bị huỷ, phải bấm gửi mã mới.
- Có giới hạn chống lạm dụng: mỗi địa chỉ IP chỉ xin mã tối đa 3 lần trong 10 phút, và toàn hệ thống tối đa 20 mã mỗi ngày. Bị chặn thì đợi rồi thử lại.
- Đăng nhập xong, trình duyệt nhớ **7 ngày** rồi hỏi lại mã.
- Không thấy thư: kiểm tra mục Spam, và chắc chắn Apps Script đã cập nhật và deploy lại (bước 9).

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
| `ADMIN_EMAILS` | email nhận mã đăng nhập; mã luôn gửi tới email **đầu tiên** trong danh sách (nhiều email cách nhau bằng dấu phẩy). Đổi biến này thì mọi phiên cũ mất hiệu lực |
| `APPS_SCRIPT_URL` | cùng URL Apps Script như trên |
| `PUBLIC_SITE_URL` | cùng địa chỉ website khách như trên |

Bản preview (`previews`) cố ý để `APPS_SCRIPT_URL` trống để xem thử không gửi email hay Telegram thật.

**Kiểm tra bản preview có tách khỏi bản thật không (làm một lần, sau lần build preview đầu tiên).** Cấu hình `previews` chưa được thử trên Cloudflare thật, nên hãy tự xác nhận:

1. Mở địa chỉ preview (link do Cloudflare tạo cho nhánh khác `main`) và gửi thử một đơn. Màn hình xong phải có dòng "Đây là bản thử, không lưu file."
2. Xem các đơn mới nhất trong database **preview**:

   ```powershell
   npx wrangler d1 execute DB --remote --preview --command "SELECT code FROM orders ORDER BY created_at DESC LIMIT 3"
   ```

   Mã đơn vừa gửi phải có ở đây.
3. Chạy lại cùng lệnh nhưng **bỏ `--preview`** để xem database thật `trung-3d`:

   ```powershell
   npx wrangler d1 execute DB --remote --command "SELECT code FROM orders ORDER BY created_at DESC LIMIT 3"
   ```

   Mã đơn thử **không được** xuất hiện ở đây.
4. Kiểm tra Telegram và email: không được có tin nhắn hay email nào về đơn thử.

Nếu đơn thử lại nằm trong database thật, hoặc có Telegram/email gửi đi: **tạm thời đừng dùng preview**. Tắt preview trong Cloudflare (Settings của Worker, phần Previews), hoặc xoá dòng `d1_databases` trong khối `previews` của `wrangler.jsonc` rồi deploy lại, và xoá đơn thử trong trang admin. Sau đó nhờ người rành kỹ thuật xem lại khối `previews`.

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

1. **Admin có khoá chưa**: mở địa chỉ admin ở **cửa sổ ẩn danh**. Phải thấy màn hình đăng nhập (nút **Gửi mã tới email**), không thấy danh sách đơn. Ngoài ra, gọi `https://trung-3d-admin.minhlaductrung.workers.dev/api/orders` khi chưa đăng nhập phải nhận `401`. Nếu không đúng, kiểm tra `ADMIN_EMAILS` và `ADMIN_SESSION_SECRET` đã đặt chưa.
2. **Đăng nhập admin** theo bước 7: thấy danh sách đơn, có mục **Màu**.
3. **Gửi thử một đơn** ở website (nhập email của bạn, thả file STL nhỏ). Có mã đơn dạng `P3D-…`. Telegram phải nhận tin, Drive có thư mục `P3D-…` chứa file STL.
4. **Tra cứu đơn** đó bằng mã đơn và SĐT ở trang tra cứu: phải thấy trạng thái "Đã nhận đơn".
5. **Đổi trạng thái** đơn trong admin (ví dụ sang "Đang in 3D") và **gõ ghi chú tiếng Việt có dấu** (ví dụ `Đã in xong, đang kiểm tra bề mặt`). Email gửi tới khách phải có **tiêu đề và nội dung hiện đúng dấu tiếng Việt**. Việc này cũng xác nhận chữ ký HMAC giữa Worker và Apps Script hoạt động đúng với UTF-8 trên môi trường thật. Nếu không có email, kiểm tra `SHARED_SECRET` hai nơi giống hệt nhau và Apps Script đã deploy version mới.
6. Tra cứu lại đơn: trạng thái mới và ghi chú hiện ra.

## Sửa màu in

Vào trang admin → **Màu** để thêm, sửa, tắt màu (tên và mã màu). Không cần sửa code hay deploy lại. Chỉ **màu mẫu của từng loại nhựa** vẫn nằm ở `src/config/pricingConfig.ts`.

## Khi có sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| Admin không cho vào, mọi thao tác báo 401 | Chưa đặt `ADMIN_EMAILS` hoặc secret `ADMIN_SESSION_SECRET` (bước 4, 8) |
| Bấm gửi mã mà không có email | Apps Script chưa cập nhật hoặc chưa deploy lại (bước 9), hoặc thư nằm trong Spam |
| Báo "quá nhiều mã" | Đã xin mã quá giới hạn (3 lần/10 phút), đợi 10 phút rồi thử lại |
| Chưa áp dụng migration 0002 (lỗi khi gửi mã) | Chạy `npx wrangler d1 migrations apply DB --remote` và thêm `--preview` cho database preview (bước 3) |
| Gửi đơn được nhưng không có email/Telegram/file | `APPS_SCRIPT_URL` còn trống (chế độ preview), hoặc thiếu secret ở bước 4 |
| Email không gửi sau khi đổi trạng thái | `SHARED_SECRET` hai nơi khác nhau, hoặc chưa deploy lại Apps Script (bước 9) |
| `wrangler` báo sai `database_id` | Kiểm tra lại bước 2, id đúng trong cả ba chỗ |
