# Database đơn hàng, tra cứu tiến độ và chọn màu — thiết kế

Ngày: 2026-11-24 · Chủ web: Nguyễn Đức Trung

## 1. Mục đích và lý do

Hiện tại mỗi đơn là một thư mục trên Google Drive (file STL + `order.json`) kèm tin Telegram/Gmail cho Trung. Không có danh sách đơn, không lọc, không có trạng thái. Trung muốn:

1. **Lưu lịch sử đơn vào một database nhỏ** để sau này dễ quản lý.
2. **Khách xem được đơn đang ở tiến độ nào**, và **nhận email khi trạng thái đổi**.
3. **Khách chọn màu khi thả file**, mô hình 3D hiện đúng màu. Trung tự thêm/sửa màu mà không đụng code.
4. Trang quản trị **bảo mật theo chuẩn thông thường** (như web đăng nhập trường học, Shopee): **không có mật khẩu nào ở front-end**.

## 2. Mục tiêu

- D1 (Cloudflare, miễn phí) là nơi lưu sự thật về đơn: thông tin khách, thông số in, màu, giá tạm tính, link Drive, trạng thái và lịch sử trạng thái.
- 5 trạng thái theo thứ tự: **Đã nhận đơn → Đã thanh toán → Đang in 3D → Đang giao hàng → Hoàn tất**, cộng trạng thái ngoài luồng **Đã huỷ**.
- Trung **xoá được đơn rác** trong trang quản trị.
- Trang tra cứu công khai: khách nhập **mã đơn + SĐT** để xem tiến độ. Không có tài khoản khách.
- Trang quản trị `/admin` (chỉ Trung): danh sách đơn, chi tiết đơn, đổi trạng thái (kèm ghi chú tuỳ chọn), quản lý màu.
- Khi Trung đổi trạng thái và đơn có email: gửi email cho khách gồm trạng thái mới, thời điểm, ghi chú (nếu có), link tới trang tra cứu.
- Chọn màu trong phần báo giá; mặc định 4 màu: **Đen, Trắng, Đỏ, Nâu**. Màu được lưu vào đơn.

## 3. Không làm (non-goals)

- Tài khoản/đăng nhập cho khách.
- Thanh toán online (trạng thái "Đã thanh toán" do Trung bấm tay).
- Màu làm thay đổi giá; giới hạn màu theo loại nhựa (để sau nếu cần).
- Chuyển các đơn cũ trên Drive vào D1 *(quyết định của Claude: đơn cũ ít, giữ nguyên trên Drive)*.
- Bỏ Telegram/Gmail báo đơn mới cho Trung — vẫn giữ.

## 4. Điều không được xảy ra (anti-goals)

- Mật khẩu, khoá bí mật hay quyền admin nằm trong code front-end hoặc repo.
- Người lạ dò được đơn của người khác (lộ tên, SĐT, email).
- Đơn bị mất vì một bước phụ (email, Telegram) lỗi.
- Bắt buộc khách nhập email làm khách bỏ đơn.

## 5. Ràng buộc

- Web đang là Cloudflare Worker phục vụ static assets (`wrangler.jsonc`, tên `trung-pcb-3d`), build bằng Vite. Thêm code server vào chính Worker này (`main` + binding D1), giữ `assets` và `not_found_handling: single-page-application`.
- **Gói Workers miễn phí giới hạn ~10 ms CPU mỗi request.** Không được để Worker parse/decode cả file STL (tới 35 MB, base64 ~47 MB). Xem §7.2.
- Gmail qua Apps Script (`MailApp`) với tài khoản cá nhân: ~100 email/ngày — đủ cho quy mô hiện tại.
- Không có tên miền riêng; chạy trên `*.workers.dev`. Bật Access một chạm cho `workers.dev` sẽ khoá **cả hostname**, còn bảo vệ theo đường dẫn thường cần tên miền riêng. Vì vậy trang quản trị là **một Worker riêng** (xem §7.6).
- Ô email trong form vẫn **không bắt buộc** (Trung chọn phương án B). Thêm dòng nhắc: "Nhập email để nhận thông báo tiến độ đơn".
- Mã đơn giữ định dạng `P3D-YYMMDD-XXXX` (`src/utils/orderCode.ts`); Apps Script đang kiểm tra regex này.

## 6. Các phương án đã cân nhắc

### 6.1 Nơi đặt backend

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Worker + D1 làm trung tâm, Apps Script làm phụ (lưu Drive, gửi Gmail)** ✅ | Giữ Drive & Gmail quen thuộc, miễn phí, không cần tên miền | Hai hệ thống phải nói chuyện với nhau qua khoá bí mật |
| B. Toàn bộ trên Cloudflare (R2 lưu file, Resend gửi mail) | Gọn một chỗ | Bắt buộc mua tên miền để gửi email cho khách; mất kho Drive |
| C. Apps Script vẫn nhận đơn rồi chép sang D1 | Ít sửa front-end | Hai nơi giữ dữ liệu, dễ lệch |

**Trung chọn A.** Lý do: không cần tên miền, giữ thói quen Drive/Gmail.

### 6.2 Đăng nhập quản trị

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Cloudflare Access trước `/admin*` và `/api/admin/*`** ✅ | Không có mật khẩu trong code; đăng nhập bằng Google hoặc mã OTP qua email; chống dò mật khẩu do Cloudflare lo; miễn phí ≤ 50 người | Phụ thuộc cấu hình trên dashboard Cloudflare |
| B. Tự viết (hash mật khẩu, cookie phiên, rate limit, OTP) | Tự chủ | Nhiều code bảo mật tự viết = nhiều chỗ có thể sai; phải lo quên mật khẩu |

**Trung chọn A.**

### 6.3 Tra cứu cho khách

Tra bằng **mã đơn + SĐT** (như tra vận đơn) thay vì tài khoản khách. Trung đồng ý. Lý do: khách in 1–2 lần không muốn đăng ký; không giữ mật khẩu khách thì không có gì để lộ.

## 7. Thiết kế

### 7.1 Kiến trúc

```
Trình duyệt ──► Worker (cùng domain với web)
                 ├─ /api/colors            công khai, đọc màu đang bật
                 ├─ /api/orders            công khai, tạo đơn (không chứa file)
                 ├─ /api/track             công khai, tra cứu mã đơn + SĐT
                 ├─ /api/admin/*           sau Cloudflare Access
                 ├─ /api/internal/*        chỉ Apps Script gọi, có HMAC
                 └─ static assets (SPA, gồm /admin và /tra-cuu)
                 │
                 ├──► D1
                 └──► Apps Script (HMAC): gửi email trạng thái cho khách
Trình duyệt ──► Apps Script: tải file STL kèm "vé" do Worker cấp → Drive
```

### 7.2 Luồng gửi đơn (quyết định của Claude, vì giới hạn CPU)

1. Trình duyệt `POST /api/orders` với payload hiện tại **trừ `fileBase64`** + `colorId`.
2. Worker: honeypot, Turnstile (nếu bật), kiểm tra dữ liệu & cắt độ dài như `validate_`/`clampFields_` hiện có, giới hạn tần suất theo SĐT (3 đơn/10 phút), kiểm tra mã đơn chưa tồn tại (cùng mã + cùng nội dung → trả ok như cũ; khác nội dung → báo lỗi như `Code.gs`). Ghi đơn vào D1 với trạng thái **Đã nhận đơn**, `file_status = 'pending'` (hoặc `'zalo'`).
2b. Ngay khi ghi D1, Worker báo Trung **một lần duy nhất**: gửi Telegram trực tiếp từ Worker (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` là secret của Worker) và gọi Apps Script `action: 'notifyOwner'` (HMAC) để gửi Gmail. Tin gồm nội dung như `formatMessage_` hiện tại + link trang admin của đơn (thay link Drive). Áp dụng cho mọi đơn, kể cả `zalo` và đơn tải file lỗi. Lỗi báo tin không làm hỏng đơn. *(Quyết định của Claude.)*
3. Worker trả `{ ok, orderCode, uploadTicket }`. Vé = HMAC-SHA256(`orderCode|fileSize|hết hạn`) bằng `SHARED_SECRET`, hạn ~15 phút.
4. Trình duyệt POST file (text/plain, như `fetchTransport` hiện tại) tới Apps Script kèm `orderCode`, `uploadTicket`. Apps Script kiểm tra vé → lưu Drive → gọi `POST /api/internal/orders/:code/file` (ký HMAC) để ghi `drive_url`, `file_status = 'saved'`. Không gửi thêm tin cho Trung; link Drive xem trong trang admin.
5. Nếu bước 4 lỗi, đơn vẫn có trong D1; khách thấy thông báo "gửi file qua Zalo kèm mã đơn" như hiện tại, admin thấy `file_status = 'pending'`.

Apps Script bỏ các phần đã chuyển sang Worker (rate limit, Turnstile, dedupe) và không còn nhận đơn nếu thiếu vé hợp lệ.

### 7.3 Dữ liệu (D1)

```
orders
  code TEXT PK            -- P3D-YYMMDD-XXXX
  created_at TEXT         -- ISO
  order_type TEXT         -- 'quote' | 'consult'
  consult_reasons TEXT    -- JSON
  customer_name, customer_phone (đã chuẩn hoá 0xxxxxxxxx), customer_email, customer_note
  settings TEXT           -- JSON PrintSettings
  dims TEXT, surface_area REAL, volume REAL, scale REAL
  estimate TEXT           -- JSON hoặc NULL
  color_id INTEGER, color_name TEXT, color_hex TEXT   -- chụp lại lúc đặt, để sửa màu sau không làm đổi đơn cũ
  file_name, file_size, file_delivery ('upload'|'zalo'), file_status ('pending'|'saved'|'zalo'), drive_url
  fingerprint TEXT        -- như fingerprint_() để nhận ra gửi lại y hệt
  status TEXT             -- received|paid|printing|shipping|done|cancelled
  status_updated_at TEXT

order_events
  id INTEGER PK, order_code TEXT, status TEXT, note TEXT, created_at TEXT,
  email_sent INTEGER      -- 0/1/NULL(không có email)

colors
  id INTEGER PK, name TEXT, hex TEXT, sort INTEGER, active INTEGER
  -- seed: Đen #1f1f1f, Trắng #f2f2f0, Đỏ #c62828, Nâu #6d4c41 (mã hex là quyết định của Claude, Trung sửa được)
```

Migration SQL nằm trong repo (`migrations/`), chạy bằng `wrangler d1 migrations apply`.

### 7.4 Trạng thái

- **Đã huỷ** (`cancelled`): dùng cho đơn thật khách không làm nữa. Đơn vẫn trong lịch sử, khách có email nhận email báo huỷ (kèm ghi chú lý do nếu Trung nhập), trang tra cứu hiện "Đơn đã huỷ" thay cho dòng tiến độ. Trung có thể mở lại đơn bằng cách chọn lại một trạng thái khác. (Trung chọn phương án C.)
- **Xoá đơn**: dùng cho đơn rác. Xoá hẳn khỏi D1 (đơn và `order_events`), có hộp xác nhận nhập lại mã đơn, không gửi email. Không xoá thư mục Drive (Trung tự xoá trên Drive nếu muốn). *(Quyết định của Claude về cách xác nhận và việc không đụng Drive.)*
- Thứ tự cố định 5 bước. Admin có thể chọn bất kỳ trạng thái nào (kể cả lùi lại khi bấm nhầm); mỗi lần đổi ghi một dòng `order_events`. *(Quyết định của Claude.)*
- Khi đổi: nếu đơn có email → Worker gọi Apps Script `action: 'notifyStatus'` (HMAC) để gửi Gmail. Lỗi gửi mail không chặn việc đổi trạng thái; ghi `email_sent = 0` và hiện cho admin.
- Email: tiêu đề `[In 3D Trung] Đơn P3D-… : Đang in 3D`; nội dung gồm trạng thái, thời điểm, ghi chú của Trung, link `https://<web>/tra-cuu?ma=P3D-…` (khách vẫn phải nhập SĐT). Ghi chú của Trung chèn dạng text thuần.

### 7.5 Trang tra cứu `/tra-cuu`

```
Tra cứu đơn   [Mã đơn______] [SĐT______] [Xem]
P3D-241124-AB12 · Nhựa PLA · Màu Đỏ · SL 2
 ✓ Đã nhận đơn      24/11 10:05
 ✓ Đã thanh toán    24/11 16:30   "Đã nhận chuyển khoản"
 ● Đang in 3D       25/11 14:20
 ○ Đang giao hàng
 ○ Hoàn tất
```

- `POST /api/track { code, phone }`. Sai mã hoặc sai SĐT → cùng một thông báo "Không tìm thấy đơn" (không tiết lộ mã có tồn tại).
- Giới hạn tần suất theo IP (ví dụ 10 lần/10 phút) bằng Workers Rate Limiting binding hoặc bảng đếm trong D1 — người xây chọn.
- Chỉ trả: mã, ngày đặt, loại nhựa, màu, số lượng, giá tạm tính, các mốc trạng thái + ghi chú. Không trả SĐT/email.
- Thêm link "Tra cứu đơn" ở Nav/Footer và trên màn hình gửi đơn thành công.

### 7.6 Trang quản trị (Worker riêng)

*(Quyết định của Claude, vì giới hạn `workers.dev` ở §5.)* Trang quản trị là Worker thứ hai, ví dụ `trung-3d-admin`, dùng **chung database D1**, có hostname `workers.dev` riêng. Bật Cloudflare Access một chạm cho toàn bộ hostname đó: policy chỉ cho email của Trung, đăng nhập bằng Google hoặc OTP email. Worker công khai không có bất kỳ API admin nào. Nếu sau này Trung mua tên miền thì có thể gộp về một Worker với Access theo đường dẫn; không bắt buộc.

Admin Worker **luôn tự kiểm tra** header `Cf-Access-Jwt-Assertion` trên mọi API: xác minh chữ ký theo JWKS của team, `aud` khớp `ACCESS_AUD`, chưa hết hạn, email nằm trong `ADMIN_EMAILS`. Thiếu/sai → 401. (Không tin vào việc Access đứng trước.) Ghi request đổi dữ liệu → chỉ chấp nhận `POST/PATCH/DELETE` cùng origin.

Chức năng:
- **Danh sách đơn**: lọc theo trạng thái, tìm theo mã/SĐT/tên, mới nhất trước, phân trang.
- **Chi tiết đơn**: toàn bộ thông tin, link Drive, cảnh báo `file_status = pending`, lịch sử trạng thái, nút đổi trạng thái (gồm "Huỷ đơn") + ô ghi chú tuỳ chọn, cho biết email đã gửi hay lỗi, nút "Xoá đơn rác" (xác nhận bằng cách nhập lại mã đơn).
- **Màu**: thêm, sửa tên/mã hex (ô chọn màu), bật/ẩn, đổi thứ tự. Không xoá cứng màu đã dùng (chỉ ẩn).

Admin Worker dùng chung repo; giao diện là một entry Vite riêng (dùng lại Tailwind/thành phần hiện có), không nằm trong bundle trang chủ. Thao tác đổi trạng thái gọi Apps Script `notifyStatus` từ admin Worker.

### 7.7 Chọn màu trong phần báo giá

- `OptionsPanel` thêm nhóm "Màu" (các ô tròn màu + tên), lấy từ `GET /api/colors`; nếu API lỗi thì dùng 4 màu mặc định trong code để vẫn đặt được đơn.
- `StlViewer` nhận màu đã chọn thay vì `materials[...].color`. Khi mô hình tràn bàn in, cảnh báo phải vẫn thấy rõ dù khách chọn màu Đỏ: đổi `OVERFLOW_COLOR` từ đỏ sang cam hổ phách (ví dụ `#f59e0b`) và giữ thông báo chữ hiện có. *(Quyết định của Claude.)*
- Màu chọn mặc định: màu đầu tiên trong danh sách.
- Payload đơn thêm `colorId`; Worker tra lại tên/hex từ D1 (không tin tên/hex do trình duyệt gửi), từ chối màu đang ẩn.
- Tin Telegram/Gmail báo Trung thêm dòng màu.

### 7.8 Bí mật & cấu hình

Worker secrets (`wrangler secret put`): `SHARED_SECRET`, `TURNSTILE_SECRET` (tuỳ chọn), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Vars: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ADMIN_EMAILS`, `APPS_SCRIPT_URL`, `PUBLIC_SITE_URL`. Apps Script Script Properties thêm `SHARED_SECRET`, `WORKER_URL`. Không bí mật nào nằm trong repo hay front-end. `contactConfig.appsScriptUrl` vẫn công khai (chỉ để tải file, cần vé hợp lệ).

### 7.9 Bản xem trước (preview) và triển khai

*(Quyết định của Claude.)*
- Bản preview cho nhánh/PR dùng **một database D1 riêng** (`…-preview`) và **không** có `APPS_SCRIPT_URL`/Telegram: không gửi email, không đụng Drive thật. Gửi file ở preview trả thông báo "bản thử, không lưu file".
- Trung tạo hai database D1 một lần theo hướng dẫn (lệnh `wrangler d1 create`), dán `database_id` vào `wrangler.jsonc`. Database ID không phải bí mật.
- Migration chạy tự động trong lệnh deploy (`wrangler d1 migrations apply --remote` trước `deploy`), migration chỉ thêm, không xoá cột, để deploy lỗi không làm mất dữ liệu.

### 7.10 Tài liệu

Cập nhật `README.md` và `docs/setup-apps-script.md`; thêm `docs/setup-cloudflare.md` hướng dẫn từng bước bằng tiếng Việt: tạo D1, chạy migration, đặt secret, bật Cloudflare Access cho `/admin`.

### 7.11 Kiểm thử

- Unit test logic Worker (validate, HMAC vé, kiểm tra JWT Access, tra cứu không lộ thông tin, rate limit) bằng Vitest; dùng `@cloudflare/vitest-pool-workers` hoặc mock D1 — người xây chọn.
- Giữ & cập nhật test hiện có (`OrderForm`, `submitOrder`, `orderPayload`, `apps-script/Code.test.ts`).
- Test component cho chọn màu, trang tra cứu, các màn hình admin chính.

## 8. Để người xây quyết định

- Cấu trúc thư mục Worker (`worker/` hay `src/server/`), router tự viết hay thư viện nhỏ (ví dụ Hono).
- Router phía client cho `/tra-cuu` và `/admin` (hiện SPA chưa có router).
- Phân trang, giao diện chi tiết admin, theo phong cách giao diện hiện có.

## 9. Bổ sung 2026-11-24: đăng nhập admin bằng mã qua email (thay Cloudflare Access)

**Lý do:** Cloudflare đòi phương thức thanh toán để bật Zero Trust Free, mà Trung không có thẻ. Trung chọn phương án B: đăng nhập bằng mã một lần gửi qua email. Phương án này thay §6.2 A và phần Access ở §7.6.

**Các phương án đã cân nhắc:**
- A. Mở thẻ ảo để bật Access: không phải sửa code. Trung không chọn.
- **B. Mã 6 số gửi qua Gmail (Trung chọn):** không có mật khẩu nào.
- C. Đăng nhập bằng mật khẩu: kém an toàn hơn B và phải xử lý chuyện quên mật khẩu. Loại.

**Thiết kế:**
- **Gửi mã** `POST /api/auth/request-code` (body rỗng):
  - Sinh mã 6 số bằng `crypto.getRandomValues`.
  - Lưu `HMAC(ADMIN_SESSION_SECRET, code)` và thời điểm hết hạn (10 phút) vào bảng D1 `admin_codes` (migration `0002`, chỉ thêm bảng mới).
  - Gửi tới địa chỉ đầu tiên trong `ADMIN_EMAILS`, qua Apps Script `notifyStatus` (dùng lại action gửi mail đã có, không phải sửa Apps Script).
  - Mỗi lần gửi mã mới thì huỷ mã cũ.
  - Giới hạn 3 lần gửi trong 10 phút.
  - Luôn trả cùng một câu "Đã gửi mã nếu email hợp lệ".
- **Kiểm tra mã** `POST /api/auth/verify {code}`:
  - Mỗi mã chỉ được thử tối đa 5 lần sai, sau đó mã bị huỷ. Giới hạn thêm 10 lần thử trong 10 phút theo IP.
  - So sánh theo thời gian hằng định. Mã đúng thì xoá ngay, nên chỉ dùng được một lần.
  - Thành công thì đặt cookie `admin_session` = `exp.HMAC(ADMIN_SESSION_SECRET, "session|"+email+"|"+exp)`, với các thuộc tính `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800` (7 ngày).
- **Đăng xuất** `POST /api/auth/logout`: xoá cookie. Muốn đăng xuất mọi nơi cùng lúc thì đổi secret `ADMIN_SESSION_SECRET`.
- **Kiểm tra phiên:** mọi `/api/*` khác của admin Worker đều kiểm tra cookie. Thiếu hoặc sai thì trả `401`. Vẫn giữ kiểm tra `Origin` cho các request không phải GET. Thiếu `ADMIN_EMAILS` hoặc `ADMIN_SESSION_SECRET` thì chặn hết (fail closed).
- **Bỏ phần Access:** xoá `worker/admin/accessJwt.ts` và các biến `ACCESS_*`.
- **Giao diện:**
  - Khi nhận `401`, hiện màn hình đăng nhập: nút "Gửi mã tới email", ô nhập mã 6 số, nút "Đăng nhập".
  - Nút đăng xuất gọi `/api/auth/logout`.
- **Email chứa mã:**
  - Tiêu đề: `[In 3D Trung] Mã đăng nhập quản trị: 123456`.
  - Nội dung: mã, thời hạn 10 phút, và câu "Nếu không phải bạn, bỏ qua email này."
- **Tài liệu:** bỏ bước bật Zero Trust. Thêm bước `wrangler secret put ADMIN_SESSION_SECRET -c wrangler.admin.jsonc`.

**Không làm:** nhiều tài khoản admin có quyền khác nhau, xác thực 2 lớp ngoài email.
