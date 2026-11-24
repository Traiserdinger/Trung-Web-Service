# Đăng nhập admin bằng mã email — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Bỏ Cloudflare Access. Trang admin đăng nhập bằng mã 6 số gửi tới Gmail của Trung. Phiên đăng nhập lưu trong cookie HttpOnly có ký HMAC.

**Kiến trúc:**
- Admin Worker (`worker/admin`) có thêm các route `/api/auth/*`.
- Mã một lần được lưu dạng hash trong bảng D1 `admin_codes`.
- Email chứa mã gửi qua `callAppsScript(env, 'notifyStatus', { to, subject, text })` đã có sẵn.
- Mọi route `/api/*` còn lại kiểm tra cookie `admin_session`.
- UI admin hiện màn hình đăng nhập khi gặp lỗi 401.

**Công nghệ:** Cloudflare Workers + D1, Web Crypto, React. Test bằng Vitest (`worker/test/fakeD1.ts`, `worker/test/env.ts`).

**Spec:** `docs/superpowers/specs/2026-11-24-orders-db-tracking-colors-design.md` §9 (thay §6.2 A và phần Access ở §7.6).

## Ràng buộc chung

- Không có mật khẩu. Không có bí mật nào trong repo hay front-end. Thêm secret mới `ADMIN_SESSION_SECRET` (đặt bằng `wrangler secret put`).
- **Mã đăng nhập:**
  - 6 chữ số, sinh bằng `crypto.getRandomValues`.
  - Lưu `hmacHex(ADMIN_SESSION_SECRET, 'code|' + code)`, không lưu mã thật.
  - Hết hạn sau 600 s. Thử sai tối đa 5 lần mỗi mã, sau đó mã bị huỷ.
  - Đúng thì xoá ngay, nên mỗi mã chỉ dùng được một lần. Gửi mã mới thì huỷ mã cũ.
- **Giới hạn tần suất** (dùng `hit` ở `worker/shared/rateLimit.ts`):
  - Gửi mã: 3 lần / 600 s, key `'admin-code'`.
  - Kiểm tra mã: 10 lần / 600 s theo IP, key `'admin-verify:' + ip`. IP lấy từ header `CF-Connecting-IP`, không có thì dùng `'unknown'`.
- **Email chứa mã:** gửi tới địa chỉ **đầu tiên** trong `ADMIN_EMAILS`.
  - Tiêu đề: `[In 3D Trung] Mã đăng nhập quản trị: <code>`
  - Nội dung có ba dòng: mã, dòng `Mã có hiệu lực trong 10 phút.` và dòng `Nếu không phải bạn, bỏ qua email này.`
- **Response của `request-code`:** luôn trả `{ ok: true, message: 'Đã gửi mã nếu email hợp lệ' }`, kể cả khi gửi mail lỗi hoặc bị giới hạn. Riêng khi bị giới hạn thì trả mã `429` với `{ ok:false, error:'Bạn đã yêu cầu quá nhiều mã, thử lại sau 10 phút' }`.
- **Cookie phiên:**
  - Giá trị: `admin_session=<exp>.<hmacHex(ADMIN_SESSION_SECRET, 'session|' + email + '|' + exp)>`, với `exp` tính bằng giây và bằng `now + 604800`.
  - Thuộc tính: `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`.
  - Lúc xác minh, `email` là địa chỉ đầu tiên trong `ADMIN_EMAILS`. Nhờ vậy, đổi `ADMIN_EMAILS` hoặc `ADMIN_SESSION_SECRET` thì mọi phiên cũ đều mất hiệu lực.
- **Fail closed:** thiếu `ADMIN_EMAILS` hoặc `ADMIN_SESSION_SECRET` thì mọi `/api/*` trả `401`, kể cả `/api/auth/*`.
- **Kiểm tra Origin:** request không phải GET phải có `Origin === url.origin`, nếu không thì trả `403`. Quy tắc này áp dụng cả cho `/api/auth/*`.
- Toàn bộ chữ trên giao diện bằng tiếng Việt.
- Migration chỉ được thêm.

## Trọng tâm review

1. **Bấm "Gửi mã" hai lần liền:** mã thứ nhất phải hết hiệu lực, chỉ mã mới nhất dùng được. *(Task 1)*
2. **Nhập mã có khoảng trắng hoặc dấu cách giữa các số** (ví dụ dán `123 456`): bỏ hết ký tự không phải số trước khi so sánh. *(Task 1)*
3. **Cookie bị sửa, hết hạn, hoặc là cookie cũ sau khi đổi secret:** trả `401`, không trả `500`. *(Task 1)*
4. **Gửi mail lỗi** (Apps Script chưa cấu hình hoặc bị lỗi): UI vẫn hiện thông báo trung tính. Trung không bị kẹt ở trạng thái đang gửi. *(Task 1, Task 2)*
5. **Đang dùng thì phiên hết hạn:** bất kỳ lệnh nào trả `401` phải đưa về màn hình đăng nhập. Sau khi đăng nhập lại, Trung quay về đúng trang đang xem (hash route giữ nguyên). *(Task 2)*

---

### Task 1: Worker — mã một lần, phiên cookie, bỏ Access

**Files:**
- Create: `migrations/0002_admin_codes.sql`, `worker/admin/auth.ts`, `worker/admin/auth.test.ts`
- Modify: `worker/admin/index.ts`, `worker/admin/api.test.ts` (thay stub Access bằng cookie phiên thật), `worker/shared/env.ts` (bỏ `ACCESS_TEAM_DOMAIN` và `ACCESS_AUD`, thêm `ADMIN_SESSION_SECRET?: string`), `wrangler.admin.jsonc` (bỏ hai vars `ACCESS_*`)
- Delete: `worker/admin/accessJwt.ts`, `worker/admin/accessJwt.test.ts`

**Interfaces:**
- Consumes: `hmacHex` (`worker/shared/hmac.ts`), `hit` (`worker/shared/rateLimit.ts`), `callAppsScript` (`worker/shared/appsScript.ts`), `json` và `readJson` (`worker/shared/http.ts`).
- Produces:
  - Bảng D1 `admin_codes(id INTEGER PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)`. `expires_at` tính bằng giây.
  - `makeSessionCookie(secret: string, email: string, now = Date.now()): Promise<string>` trả nguyên header `Set-Cookie`.
  - `verifySession(secret: string, email: string, cookieHeader: string | null, now = Date.now()): Promise<boolean>`
  - `handleAuth(req: Request, env: Env, url: URL, now = Date.now()): Promise<Response | null>` xử lý `/api/auth/request-code`, `/api/auth/verify` và `/api/auth/logout`. Đường dẫn khác thì trả `null`.
  - `POST /api/auth/verify {code}`:
    - Đúng: `200 { ok: true }` kèm `Set-Cookie`.
    - Sai: `401 { ok:false, error:'Mã không đúng hoặc đã hết hạn' }`.
    - Bị giới hạn: `429 { ok:false, error:'Bạn thử quá nhiều lần, thử lại sau 10 phút' }`.
  - `POST /api/auth/logout`: trả `200 { ok:true }` kèm `Set-Cookie: admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`.
  - `GET /api/auth/me`: trả `200 { ok:true }` nếu phiên hợp lệ, ngược lại `401`. UI dùng route này để biết đã đăng nhập chưa.
  - Thứ tự xử lý trong `index.ts`:
    1. Request không thuộc `/api` thì trả về ASSETS.
    2. Kiểm tra fail closed.
    3. Kiểm tra Origin cho request không phải GET.
    4. `handleAuth` cho các route `request-code`, `verify` và `logout`.
    5. Mọi route khác, kể cả `/api/auth/me`, phải có `verifySession` hợp lệ, nếu không trả `401`.
    6. Chuyển cho `handleOrders`, rồi `handleColors`, cuối cùng trả `404`.

- [ ] **Step 1: Viết test thất bại `worker/admin/auth.test.ts`.** Dùng `createFakeD1` và mock `fetch` toàn cục để bắt lời gọi Apps Script. Dùng `env` có `ADMIN_EMAILS: 'a@x.com, b@y.com'`, `ADMIN_SESSION_SECRET: 's'` và `APPS_SCRIPT_URL` khác rỗng. Lấy mã thật từ `data.subject` trong phong bì đã gửi.
  - `request-code → Apps Script nhận notifyStatus tới 'a@x.com', subject '[In 3D Trung] Mã đăng nhập quản trị: <6 số>', response { ok:true, message:'Đã gửi mã nếu email hợp lệ' }, bảng chỉ còn 1 dòng`
  - `gửi mã 2 lần → mã thứ nhất bị từ chối 401, mã thứ hai đăng nhập được` *(Trọng tâm review 1)*
  - `verify mã đúng → 200, Set-Cookie chứa HttpOnly; Secure; SameSite=Strict; Max-Age=604800; dùng lại cùng mã → 401`
  - `verify '123 456' dạng có khoảng trắng của mã đúng → 200` *(Trọng tâm review 2)*
  - `5 lần sai → lần thứ 6 với mã đúng vẫn 401 (mã đã huỷ)`
  - `mã quá 600 s → 401`
  - `request-code lần thứ 4 trong 600 s → 429`
  - `verify lần thứ 11 cùng IP trong 600 s → 429`
  - `Apps Script lỗi (fetch reject) → request-code vẫn 200 cùng message` *(Trọng tâm review 4)*
  - `verifySession: cookie đúng → true; sửa 1 ký tự sig → false; exp quá hạn → false; secret khác → false; email khác → false; header rác 'admin_session=abc' → false, không ném lỗi` *(Trọng tâm review 3)*
  - `thiếu ADMIN_SESSION_SECRET → /api/auth/request-code 401`
  - `POST /api/auth/verify thiếu Origin → 403`
  - `logout → Set-Cookie Max-Age=0`
- [ ] **Step 2: Sửa `worker/admin/api.test.ts`.** Gỡ stub `verify` của Access. Thay bằng một helper tạo header `Cookie` từ `makeSessionCookie`. Giữ nguyên các test nghiệp vụ hiện có. Thêm hai test:
  - `không cookie → 401`
  - `cookie hợp lệ → GET /api/auth/me 200`
- [ ] **Step 3: Chạy** `npx vitest run worker/admin`. Kết quả mong đợi: FAIL.
- [ ] **Step 4: Implement** theo Interfaces. Xoá `accessJwt.*`. `createAdminHandler` không còn nhận `deps`.
- [ ] **Step 5: Chạy** `npx vitest run worker`, `npm run typecheck:worker` và `npm run lint`. Kết quả mong đợi: PASS, lint không có cảnh báo.
- [ ] **Step 6: Commit** `feat(admin-worker): email one-time-code login with signed session cookie`

---

### Task 2: UI admin — màn hình đăng nhập và đăng xuất

**Files:**
- Create: `src/admin/LoginPage.tsx`, `src/admin/LoginPage.test.tsx`
- Modify: `src/admin/adminApi.ts`, `src/admin/adminApi.test.ts`, `src/admin/AdminApp.tsx`

**Interfaces:**
- Consumes: các route `/api/auth/*` của Task 1.
- Produces:
  - Các hàm mới trong `adminApi.ts`:
    - `requestCode(): Promise<string>` trả `message` do server gửi về.
    - `verifyCode(code: string): Promise<void>`. Lỗi `401` hoặc `429` thì ném `Error(error)` với đúng chữ server trả về.
    - `logout(): Promise<void>`
    - `checkSession(): Promise<boolean>`, gọi `GET /api/auth/me`.
  - `call()` hiện có, khi nhận `401`, ném `SESSION_EXPIRED`. Đổi chữ của `SESSION_EXPIRED` thành `'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại'`.
  - `AdminApp`:
    - Lúc mở trang: gọi `checkSession()`. Nếu `false` thì hiện `LoginPage`.
    - Khi một trang con bắt được lỗi `SESSION_EXPIRED`: chuyển về `LoginPage` và giữ nguyên `location.hash`.
    - Đăng nhập thành công thì hiện lại trang theo hash đang có.
    - Nút "Đăng xuất" (thay link `/cdn-cgi/access/logout`) gọi `logout()` rồi hiện `LoginPage`.
  - `LoginPage`:
    - Tiêu đề "Đăng nhập quản trị".
    - Nút "Gửi mã tới email". Bấm xong thì hiện `message` từ server và ô nhập mã.
    - Ô nhập mã: `inputMode="numeric"`, `autoComplete="one-time-code"`, label "Mã 6 số".
    - Nút "Đăng nhập". Có lỗi thì hiện trong vùng `role="alert"`.
    - Các nút bị khoá trong lúc chờ server. Khi request xong, dù thành công hay lỗi, đều phải mở khoá lại.

- [ ] **Step 1: Viết test thất bại.** Mock `adminApi`.
  - `LoginPage: bấm 'Gửi mã tới email' → requestCode gọi 1 lần, hiện message và ô 'Mã 6 số'`
  - `nhập mã + 'Đăng nhập' → verifyCode('123456') → onLoggedIn được gọi`
  - `verifyCode ném 'Mã không đúng hoặc đã hết hạn' → hiện trong role=alert, nút bật lại`
  - `requestCode ném lỗi mạng → hiện lỗi, nút bật lại` *(Trọng tâm review 4)*
  - `AdminApp: checkSession false → hiện 'Đăng nhập quản trị'; true → hiện danh sách đơn`
  - `AdminApp: trang con gặp SESSION_EXPIRED → về LoginPage, location.hash giữ '#/orders/P3D-…'; đăng nhập lại → hiện chi tiết đơn đó` *(Trọng tâm review 5)*
  - `Đăng xuất → logout gọi, hiện LoginPage`
  - `adminApi: verifyCode POST /api/auth/verify body {code}; 401 → ném 'Mã không đúng hoặc đã hết hạn'`
- [ ] **Step 2: Chạy** `npx vitest run src/admin`. Kết quả mong đợi: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Chạy** `npm test`, `npm run lint` và `npm run build`. Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(admin): email code login screen and logout`

---

### Task 3: Tài liệu

**Files:**
- Modify: `docs/setup-cloudflare.md`, `README.md`

- [ ] **Step 1: Sửa `docs/setup-cloudflare.md`** (tiếng Việt, cùng giọng văn với phần đã có).
  - Bỏ bước bật Cloudflare Access, các vars `ACCESS_*`, các dòng troubleshooting về Access và câu "chuyển sang trang đăng nhập Cloudflare".
  - Thêm bước đặt secret bằng lệnh `npx wrangler secret put ADMIN_SESSION_SECRET -c wrangler.admin.jsonc`, giá trị sinh bằng `openssl rand -hex 32`. Ghi chú rằng đổi secret này sẽ đăng xuất mọi nơi.
  - Thêm phần mô tả cách đăng nhập: mở trang admin, bấm "Gửi mã tới email", xem Gmail, nhập mã.
  - Ghi rõ Apps Script phải được cập nhật trước, vì mail chứa mã đi qua Apps Script.
  - Bước kiểm tra cuối: mở trang admin ở cửa sổ ẩn danh phải thấy màn hình đăng nhập. Gọi `/api/orders` khi chưa đăng nhập phải nhận `401`.
- [ ] **Step 2: Sửa `README.md`.** Thay các chỗ nhắc "Cloudflare Access" bằng "đăng nhập bằng mã gửi qua email".
- [ ] **Step 3: Chạy** `npm run lint` và `grep -ri "access" docs/setup-cloudflare.md README.md`. Kết quả mong đợi: không còn chỗ nào nhắc Cloudflare Access.
- [ ] **Step 4: Commit** `docs: admin email-code login replaces Cloudflare Access`
