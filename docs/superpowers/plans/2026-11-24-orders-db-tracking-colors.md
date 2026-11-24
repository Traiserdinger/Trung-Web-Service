# Database đơn hàng, tra cứu tiến độ, chọn màu — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Lưu đơn vào Cloudflare D1. Khách tra cứu tiến độ bằng mã đơn + SĐT và nhận email khi trạng thái đổi. Khách chọn màu khi báo giá. Trung quản lý đơn và màu trong trang admin được bảo vệ bằng Cloudflare Access.

**Kiến trúc:**
- Hai Worker dùng chung một database D1 (binding `DB`):
  - Worker công khai `trung-pcb-3d`: phục vụ SPA và `/api/*`.
  - Worker admin `trung-3d-admin`: phục vụ UI admin và `/api/*` admin. Toàn bộ hostname nằm sau Access.
- File STL không đi qua Worker. Trình duyệt tải file thẳng lên Apps Script, kèm vé HMAC do Worker cấp.
- Worker và Apps Script nói chuyện với nhau bằng phong bì JSON có ký HMAC-SHA256 (`SHARED_SECRET`).

**Công nghệ:**
- Cloudflare Workers + D1, quản lý bằng `wrangler`.
- Web Crypto: HMAC và xác minh JWT RS256.
- Vite + React + TS + Tailwind v4 (đang dùng).
- Vitest. Test Worker chạy trên `node:sqlite`, giả lập D1.
- Google Apps Script.

**Spec:** `docs/superpowers/specs/2026-11-24-orders-db-tracking-colors-design.md`. Đọc spec trước.

## Ràng buộc chung

- Không có bí mật nào trong front-end hoặc repo. Các secret của Worker là `SHARED_SECRET`, `TURNSTILE_SECRET` (tuỳ chọn), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Script Properties của Apps Script thêm `SHARED_SECRET`, `WORKER_URL`.
- Vars của Worker công khai: `APPS_SCRIPT_URL`, `PUBLIC_SITE_URL`, `ADMIN_SITE_URL`. Vars của Worker admin: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ADMIN_EMAILS` (danh sách phân tách bằng dấu phẩy), `APPS_SCRIPT_URL`, `PUBLIC_SITE_URL`.
- Nếu `APPS_SCRIPT_URL` rỗng thì đây là bản preview: không gửi Telegram, Gmail, Drive. `uploadTicket` trả về `null`.
- Thứ tự trạng thái là `received` → `paid` → `printing` → `shipping` → `done`, cộng thêm `cancelled`. Nhãn tương ứng: "Đã nhận đơn", "Đã thanh toán", "Đang in 3D", "Đang giao hàng", "Hoàn tất", "Đã huỷ".
- Mã đơn giữ định dạng `/^P3D-\d{6}-[A-Z2-9]{4}$/`.
- Giới hạn độ dài trường: `name 120`, `phone 40`, `email 160`, `note 1500`, `fileName 160`, ghi chú admin `500`. File tối đa 35 MB.
- Rate limit: tạo đơn 3 lần / 600 s theo SĐT. Tra cứu 10 lần / 600 s theo IP (`CF-Connecting-IP`).
- Vé upload có hạn 900 s. Phong bì HMAC bị từ chối nếu `|now − ts| > 300 s`.
- Màu seed: `1 Đen #1f1f1f`, `2 Trắng #f2f2f0`, `3 Đỏ #c62828`, `4 Nâu #6d4c41`. `OVERFLOW_COLOR = '#f59e0b'`.
- Ô email trong form vẫn không bắt buộc. Gợi ý cho ô này: `không bắt buộc · để nhận email báo tiến độ`.
- Toàn bộ chữ trên giao diện và trong email bằng tiếng Việt. Ghi chú của khách và của Trung luôn hiển thị dạng text: không `dangerouslySetInnerHTML`, email là text thuần.
- Migration chỉ được thêm, không xoá hoặc đổi tên cột.

## Trọng tâm review

1. **Khách gửi lại cùng mã sau khi tải file lỗi.** Đơn đang có `file_status='pending'`. Cùng fingerprint → trả `ok` kèm vé **mới**, không báo Trung lần nữa, không tính thêm rate limit. *(Task 3)*
2. **Khách tra cứu với SĐT viết kiểu khác** (`+84 913.014.605` thay cho `0913014605`). Phải chuẩn hoá trước khi so sánh, và vẫn tìm thấy đơn. *(Task 4)*
3. **Apps Script nhận cùng một upload hai lần** (mạng gửi lặp). Không được tạo hai thư mục Drive. Callback về Worker phải idempotent. *(Task 5)*
4. **Trung sửa mã hex hoặc ẩn một màu sau khi đã có đơn dùng màu đó.** Đơn cũ vẫn hiện màu cũ (đã chụp lại lúc đặt). Đơn mới chọn màu đã ẩn bị từ chối. *(Task 3, Task 9)*
5. **Ghi chú có xuống dòng hoặc chứa thẻ HTML** trong email trạng thái và trang tra cứu. Phải hiện nguyên văn, không chèn HTML. Trong tin Telegram, các dòng hệ thống không bị giả mạo được. *(Task 3, Task 8)*

---

## Cấu trúc file

```
migrations/0001_init.sql            schema + seed màu
worker/shared/env.ts                kiểu Env chung
worker/shared/http.ts               json(), readJson(), route matching nhỏ
worker/shared/hmac.ts               hmacHex, signEnvelope, verifyEnvelope, makeTicket, verifyTicket
worker/shared/rateLimit.ts          hit(db, key, limit, windowSec)
worker/shared/orderRepo.ts          truy vấn D1 cho orders/order_events/colors
worker/shared/ownerMessage.ts       soạn tin báo đơn mới (port formatMessage_)
worker/shared/appsScript.ts         callAppsScript(env, action, data)
worker/public/index.ts              Worker công khai: /api/colors, /api/orders, /api/track, /api/internal/*
worker/admin/index.ts               Worker admin: kiểm tra Access + /api/*
worker/admin/accessJwt.ts           verifyAccessJwt
worker/test/fakeD1.ts               D1 giả lập trên node:sqlite, chạy migrations
src/shared/orderStatus.ts           STATUSES, STATUS_LABEL, kiểu OrderStatus (dùng chung front/worker)
src/config/colorConfig.ts           DEFAULT_COLORS (dự phòng khi API lỗi)
src/lib/colors.ts                   fetchColors()
src/lib/api.ts                      createOrder(), uploadFile(), trackOrder()
src/pages/TrackPage.tsx             /tra-cuu
src/admin/*                         UI admin
admin/index.html                    entry Vite cho admin
vite.admin.config.ts
wrangler.jsonc (sửa), wrangler.admin.jsonc (mới), tsconfig.worker.json (mới)
docs/setup-cloudflare.md (mới)
```

---

### Task 1: Hạ tầng Worker, schema D1, test harness, `GET /api/colors`

**Files:**
- Create: `migrations/0001_init.sql`, `worker/shared/env.ts`, `worker/shared/http.ts`, `worker/test/fakeD1.ts`, `worker/public/index.ts`, `worker/public/colors.test.ts`, `src/shared/orderStatus.ts`, `tsconfig.worker.json`
- Modify: `wrangler.jsonc`, `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore` (thêm `dist-admin`)

**Interfaces:**
- Produces:
  - `interface Env { DB: D1Database; ASSETS: Fetcher; SHARED_SECRET: string; APPS_SCRIPT_URL?: string; PUBLIC_SITE_URL: string; ADMIN_SITE_URL?: string; TURNSTILE_SECRET?: string; TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string; ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string; ADMIN_EMAILS?: string }`
  - `json(body: unknown, status = 200): Response`, `readJson<T>(req: Request, maxBytes = 64_000): Promise<T | null>`
  - `createFakeD1(): D1Database`: một DB trong bộ nhớ, đã chạy mọi file `migrations/*.sql`. Hỗ trợ `prepare().bind().first/all/run` và `batch`.
  - `const STATUSES = ['received','paid','printing','shipping','done','cancelled'] as const`, `type OrderStatus`, `STATUS_LABEL: Record<OrderStatus,string>`, `PROGRESS: OrderStatus[]` (5 bước, không có `cancelled`)
  - Default export của `worker/public/index.ts` là `{ fetch(req, env, ctx) }`. Request không thuộc `/api/*` thì trả về `env.ASSETS.fetch(req)`.

- [ ] **Step 1: Cài dev deps:** `npm i -D wrangler @cloudflare/workers-types`. Tạo `tsconfig.worker.json`: `types: ["@cloudflare/workers-types"]`, `include: ["worker", "src/shared", "src/utils", "src/config"]`, `lib: ["ES2023"]`. Thêm vào `references` của `tsconfig.json`.
- [ ] **Step 2: Viết `migrations/0001_init.sql`.**
  - Các bảng `orders`, `order_events`, `colors` lấy đúng theo spec §7.3.
  - Thêm bảng `rate_hits(key TEXT NOT NULL, at INTEGER NOT NULL)` cùng index `(key, at)`.
  - Thêm `CHECK (status IN (...6 giá trị...))`.
  - Index cho `orders(created_at)`, `orders(customer_phone)`, `order_events(order_code)`.
  - Seed 4 màu theo Ràng buộc chung, `sort` từ 1 đến 4, `active = 1`.
- [ ] **Step 3: Sửa `vite.config.ts`.** `test.include` thêm `worker/**/*.test.ts`. Các file test worker mở đầu bằng `// @vitest-environment node`.
- [ ] **Step 4: Viết test thất bại `worker/public/colors.test.ts`.**

```ts
it('GET /api/colors trả màu đang bật theo sort', async () => {
  const env = makeEnv() // { DB: createFakeD1(), ASSETS: fakeAssets, SHARED_SECRET: 's', PUBLIC_SITE_URL: 'https://site' }
  await env.DB.prepare('UPDATE colors SET active=0 WHERE id=4').run()
  const res = await worker.fetch(new Request('https://site/api/colors'), env, ctx)
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true, colors: [
    { id: 1, name: 'Đen', hex: '#1f1f1f' }, { id: 2, name: 'Trắng', hex: '#f2f2f0' }, { id: 3, name: 'Đỏ', hex: '#c62828' },
  ] })
})
it('đường không phải /api đi về ASSETS', ...) // fakeAssets.fetch được gọi
it('/api/khong-co trả 404 JSON { ok:false }', ...)
```

- [ ] **Step 5: Chạy** `npx vitest run worker/public/colors.test.ts`. Kết quả mong đợi: FAIL.
- [ ] **Step 6: Implement** `createFakeD1` (bọc `DatabaseSync`; `first()` trả về dòng đầu tiên hoặc `null`; `all()` trả về `{ results }`; `run()` trả về `{ meta: { changes } }`), `json`, `readJson`, và router trong `worker/public/index.ts`.
- [ ] **Step 7: Sửa `wrangler.jsonc`.**
  - Thêm `"main": "worker/public/index.ts"`, `"assets": { ..., "binding": "ASSETS", "run_worker_first": ["/api/*"] }`.
  - Thêm `"d1_databases": [{ "binding": "DB", "database_name": "trung-3d", "database_id": "<dán sau>", "migrations_dir": "migrations" }]` và `vars` (`PUBLIC_SITE_URL`, `ADMIN_SITE_URL`, `APPS_SCRIPT_URL`).
  - Trong `previews`, ghi đè `d1_databases` sang DB `trung-3d-preview` và đặt `APPS_SCRIPT_URL: ""`. Nếu schema của wrangler không nhận khối này thì dùng `env.preview`, và ghi rõ trong `docs/setup-cloudflare.md`.
- [ ] **Step 8: Thêm scripts** vào `package.json`: `"deploy": "wrangler d1 migrations apply DB --remote && wrangler deploy"`, `"typecheck:worker": "tsc -p tsconfig.worker.json --noEmit"`.
- [ ] **Step 9: Chạy** `npm test`, `npm run typecheck:worker`, `npx wrangler deploy --dry-run`. Kết quả mong đợi: tất cả PASS, dry-run không báo lỗi cấu hình.
- [ ] **Step 10: Commit** `feat(worker): D1 schema, public worker skeleton, /api/colors`

---

### Task 2: HMAC, vé upload, rate limit

**Files:**
- Create: `worker/shared/hmac.ts`, `worker/shared/hmac.test.ts`, `worker/shared/rateLimit.ts`, `worker/shared/rateLimit.test.ts`

**Interfaces:**
- Produces:
  - `hmacHex(secret: string, msg: string): Promise<string>`. Trả về hex chữ thường.
  - `signEnvelope<T>(secret, action: string, data: T, now = Date.now()): Promise<{ action, ts: number, data: T, sig: string }>`. Ở đây `sig = hmacHex(secret, `${action}|${ts}|${JSON.stringify(data)}`)` và `ts` tính bằng giây.
  - `verifyEnvelope(secret, env: unknown, now = Date.now()): Promise<{ action: string; data: unknown } | null>`. So sánh hằng thời gian, cửa sổ ±300 s.
  - `makeTicket(secret, code: string, fileSize: number, now = Date.now()): Promise<string>`. Định dạng `${exp}.${hmacHex(secret, `${code}|${fileSize}|${exp}`)}`, với `exp = ts + 900`.
  - `verifyTicket(secret, ticket: string, code, fileSize, now = Date.now()): Promise<boolean>`
  - `hit(db: D1Database, key: string, limit: number, windowSec: number, now = Date.now()): Promise<boolean>`. Trả `true` nếu **được phép**, sau đó ghi nhận lượt. Xoá các dòng của `key` đã quá cửa sổ.
  - `unhit(db, key): Promise<void>`. Xoá lượt mới nhất của `key`, dùng để hoàn lại lượt khi lưu đơn thất bại.

- [ ] **Step 1: Viết test thất bại.**
  - `hmacHex('k','m')` bằng HMAC-SHA256 tính bằng `node:crypto` (lấy giá trị tham chiếu từ `createHmac`).
  - Envelope giữ nguyên (round-trip) qua sign rồi verify. Đổi `data` thì verify trả `null`. `ts` lệch 301 s thì trả `null`.
  - Vé: hợp lệ ở thời điểm `now`. Sai ở `now + 901 s`. Sai nếu đổi `fileSize` hoặc `code`.
  - `hit`: 3 lần đầu trả `true`, lần thứ 4 `false`, đến `now + 601 s` lại `true`. `unhit` sau lần thứ 3 thì lần tiếp theo trả `true`.
- [ ] **Step 2: Chạy** `npx vitest run worker/shared`. Kết quả mong đợi: FAIL.
- [ ] **Step 3: Implement** bằng `crypto.subtle.importKey('raw', …, { name: 'HMAC', hash: 'SHA-256' })`.
- [ ] **Step 4: Chạy lại.** Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(worker): HMAC envelopes, upload tickets, D1 rate limit`

---

### Task 3: `POST /api/orders`: tạo đơn và báo Trung

**Files:**
- Create: `worker/shared/orderRepo.ts`, `worker/shared/ownerMessage.ts`, `worker/shared/ownerMessage.test.ts`, `worker/shared/appsScript.ts`, `worker/public/orders.ts`, `worker/public/orders.test.ts`
- Modify: `worker/public/index.ts`, `src/utils/orderPayload.ts` (tách kiểu `OrderMeta`)

**Interfaces:**
- Consumes: Task 1 (`Env`, `json`, `readJson`, `createFakeD1`), Task 2 (`makeTicket`, `hit`, `unhit`, `signEnvelope`). Dùng `normalizeVnPhone` lấy từ `src/utils/orderPayload.ts`.
- Produces:
  - `type OrderMeta = Omit<OrderPayload, 'fileBase64'> & { colorId: number }`, nằm trong `src/utils/orderPayload.ts`.
  - Kiểu dữ liệu của endpoint:
    - Body request: `POST /api/orders` nhận `OrderMeta`.
    - Response thành công: `{ ok: true, orderCode: string, uploadTicket: string | null, trackUrl: string }`.
    - Response lỗi: `{ ok: false, error: string }`.
  - Các hàm trong `orderRepo`:
    - `getColor(db, id): Promise<{ id: number; name: string; hex: string; active: number } | null>`
    - `listActiveColors(db)`
    - `getOrder(db, code): Promise<OrderRow | null>`
    - `insertOrder(db, row: OrderRow): Promise<void>`. Hàm này ghi cả dòng `order_events` (`received`, `note = null`, `email_sent = null`) trong một `batch`.
    - `setFileSaved(db, code, driveUrl): Promise<boolean>`
    - `listEvents(db, code)`
  - `OrderRow`: các cột của bảng `orders`, viết theo camelCase. Các cột JSON giữ ở dạng string.
  - `formatOwnerMessage(o: OrderRow, adminUrl: string): string`. Port từ `formatMessage_` trong `apps-script/Code.gs:233-282`. Khác với bản gốc ở hai chỗ: dòng `Drive:` đổi thành `Admin: ${adminUrl}`, và thêm dòng `Màu: ${colorName}` ngay sau dòng nhựa. Giữ nguyên quy tắc `oneLine_`, thụt lề ghi chú và cắt ở 4000 ký tự.
  - `callAppsScript(env, action: 'notifyOwner' | 'notifyStatus', data): Promise<boolean>`. Không gọi gì và trả `false` nếu `APPS_SCRIPT_URL` rỗng. POST `text/plain` với body là phong bì đã ký, `redirect: 'follow'`. Trả `true` khi kết quả JSON có `ok === true`.

Luồng trong `handleCreateOrder(req, env, ctx)`:
1. Đọc JSON, tối đa 64 KB.
2. Nếu `honeypot` có giá trị: trả `{ ok: true, orderCode, uploadTicket: null }` và không ghi gì.
3. Validate giống `validate_` trong Code.gs, cộng thêm ba điều kiện: `colorId` là số nguyên, `fileSize ≤ 35 MB` khi `fileDelivery = 'upload'`, `orderType ∈ {quote, consult}`. Sau đó cắt độ dài các trường theo Ràng buộc chung.
4. Chuẩn hoá SĐT. Nếu `null` thì trả lỗi `'Số Zalo/SĐT không hợp lệ'`.
5. Lấy màu. Nếu màu không có hoặc đang ẩn thì trả lỗi `'Màu đã chọn không còn, vui lòng chọn lại'`.
6. Tính `fingerprint = JSON.stringify([settings, customer, fileName, fileSize, scale, fileDelivery, colorId])`.
7. Nếu đã có đơn cùng mã:
   - Cùng fingerprint: trả `ok`. Nếu `fileStatus = 'pending'` thì kèm vé mới. Không báo Trung lần nữa, không tính rate limit.
   - Khác fingerprint: trả nguyên văn câu lỗi trong `Code.gs:66-70`.
8. Nếu `TURNSTILE_SECRET` có giá trị: gọi siteverify. Thất bại thì trả `'Xác minh chống spam thất bại'`.
9. Gọi `hit(db, 'order:'+phone, 3, 600)`. Nếu trả `false` thì trả `'Bạn đã gửi quá nhiều đơn, vui lòng thử lại sau 10 phút'`.
10. `insertOrder`, với `status = 'received'` và `fileStatus` là `'zalo'` hoặc `'pending'`. Nếu bước này lỗi thì gọi `unhit` rồi trả `'Máy chủ gặp lỗi, vui lòng gửi qua Zalo kèm mã đơn'`.
11. `ctx.waitUntil(...)`: gửi Telegram trực tiếp (nếu có token và chat id) và `callAppsScript(env, 'notifyOwner', { subject: '[Đơn in 3D] '+code, text })`, cả hai bọc try/catch.
12. Trả `uploadTicket`. Giá trị là `null` khi `fileDelivery = 'zalo'` hoặc khi không có `APPS_SCRIPT_URL`. `trackUrl` là `${PUBLIC_SITE_URL}/tra-cuu?ma=${code}`.

- [ ] **Step 1: Viết test thất bại `ownerMessage.test.ts`.**
  - Dòng đầu là `🟢 ĐƠN IN 3D P3D-…`, dòng thứ hai là `Admin: https://admin/#/orders/P3D-…`.
  - Có dòng `Màu: Đỏ`.
  - Ghi chú `"a\nDrive: giả"` phải ra `"Ghi chú:\n  a\n  Drive: giả"`.
  - Chuỗi dài hơn 4000 ký tự bị cắt và kết thúc bằng `…`.
- [ ] **Step 2: Viết test thất bại `orders.test.ts`.** Dùng `createFakeD1`, mock `fetch` toàn cục để ghi lại các lời gọi Telegram và Apps Script, và một `ctx.waitUntil` gom promise để test có thể chờ.
  - `tạo đơn hợp lệ → 200, ghi orders + 1 order_events 'received', color_name 'Đỏ' khi colorId 3, uploadTicket verifyTicket được`
  - `SĐT '+84 913.014.605' được lưu '0913014605'`
  - `màu đang ẩn → ok:false 'Màu đã chọn không còn, vui lòng chọn lại'`
  - `gửi lại y hệt khi pending → ok, vé mới, không thêm tin Telegram, không tính rate limit` *(Trọng tâm review 1)*
  - `gửi lại cùng mã khác nội dung → ok:false chứa 'đã được gửi với nội dung khác'`
  - `đơn thứ 4 trong 10 phút cùng SĐT → lỗi quá nhiều đơn`
  - `honeypot → ok, không có dòng nào trong orders`
  - `fileDelivery 'zalo' → uploadTicket null, file_status 'zalo', vẫn báo Trung`
  - `APPS_SCRIPT_URL rỗng → uploadTicket null, không gọi Apps Script`
  - `Telegram lỗi (fetch reject) → vẫn 200 ok`
  - `đổi hex màu 3 sau khi đặt → getOrder vẫn trả color_hex '#c62828'` *(Trọng tâm review 4)*
- [ ] **Step 3: Chạy** `npx vitest run worker`. Kết quả mong đợi: FAIL.
- [ ] **Step 4: Implement** theo luồng ở trên.
- [ ] **Step 5: Chạy lại.** Kết quả mong đợi: PASS. Sau đó chạy `npm run typecheck:worker`.
- [ ] **Step 6: Commit** `feat(worker): create orders in D1 with owner notification`

---

### Task 4: `POST /api/track` và callback `POST /api/internal/file`

**Files:**
- Create: `worker/public/track.ts`, `worker/public/track.test.ts`, `worker/public/internal.ts`, `worker/public/internal.test.ts`
- Modify: `worker/public/index.ts`

**Interfaces:**
- Consumes: `getOrder`, `listEvents`, `setFileSaved`, `hit`, `verifyEnvelope`, `normalizeVnPhone`.
- Produces:
  - `POST /api/track`
    - Request: `{ code: string, phone: string }`.
    - Response khi tìm thấy: `{ ok: true, order: TrackView }`.
    - Response khi không tìm thấy: `{ ok: false, error: 'Không tìm thấy đơn. Kiểm tra lại mã đơn và SĐT.' }`. Response này **giống hệt nhau** dù mã sai hay SĐT sai.
    - Khi bị rate limit: `429` với `{ ok:false, error:'Bạn tra cứu quá nhiều lần, thử lại sau 10 phút' }`.
  - `interface TrackView { code: string; createdAt: string; material: string; colorName: string; colorHex: string; quantity: number; estimateTotal: number | null; status: OrderStatus; events: { status: OrderStatus; note: string | null; at: string }[] }`. Kiểu này export từ `src/shared/orderStatus.ts` để front-end dùng chung.
  - `POST /api/internal/file`: body là phong bì có `action: 'fileSaved'` và `data: { orderCode, driveUrl }`. Chữ ký sai trả `401`. Nếu ổn thì gọi `setFileSaved`, trả `{ ok: true }`. Gọi lần hai vẫn `ok` (idempotent).

- [ ] **Step 1: Viết test thất bại.**
  - `track đúng mã + SĐT '+84 913 014 605' → ok, có events, không có trường phone/email/name trong JSON` *(Trọng tâm review 2)*
  - `sai SĐT và sai mã → cùng status và cùng body`
  - `lượt thứ 11 từ cùng CF-Connecting-IP → 429`
  - `internal file: chữ ký đúng → file_status 'saved', drive_url lưu; gọi lại lần 2 → ok`
  - `internal file: sig sai → 401, không đổi DB`
- [ ] **Step 2: Chạy.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Implement.** Nếu body thiếu trường hoặc mã sai định dạng thì vẫn trả đúng thông báo "không tìm thấy".
- [ ] **Step 4: Chạy lại.** Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(worker): order tracking and Drive file callback`

---

### Task 5: Apps Script: chỉ nhận upload có vé, gửi mail theo phong bì

**Files:**
- Modify: `apps-script/Code.gs`, `apps-script/Code.test.ts`, `docs/setup-apps-script.md`

**Interfaces:**
- Consumes: định dạng vé và phong bì của Task 2. Ở phía Apps Script, tính lại HMAC bằng `Utilities.computeHmacSha256Signature(msg, secret)` rồi chuyển sang hex chữ thường.
- Produces: `doPost` phân nhánh theo body.
  - Có trường `action`: đây là phong bì từ Worker.
    - `verifyEnvelope_` thất bại: trả `{ ok:false, error:'unauthorized' }`.
    - `notifyOwner` với `data { subject, text }`: gửi `MailApp.sendEmail(OWNER_EMAIL, subject, text)`.
    - `notifyStatus` với `data { to, subject, text }`: gửi `MailApp.sendEmail(to, subject, text)`.
  - Không có `action`: đây là upload. Body là `{ orderCode, uploadTicket, fileName, fileSize, fileBase64 }`.
    - Vé sai hoặc hết hạn: trả `'Phiên gửi file đã hết hạn, vui lòng gửi lại đơn'`.
    - `fileBase64` dài quá giới hạn: trả lỗi 35 MB như cũ.
    - Lấy hoặc tạo thư mục mang tên `orderCode`. Nếu thư mục đã tồn tại và đã có file cùng tên thì không tạo thêm file (Trọng tâm review 3).
    - `UrlFetchApp.fetch(WORKER_URL + '/api/internal/file', signed envelope 'fileSaved')`. Lỗi ở bước này chỉ ghi log, không làm hỏng upload.
    - Trả `{ ok: true, orderCode }`.
  - Xoá các hàm không còn dùng: `rateLimited_`, `countRate_`, `verifyTurnstile_`, `fingerprint_`, `formatMessage_`, `sendTelegram_`, cùng các helper chỉ chúng dùng. Không ghi `order.json` nữa (dữ liệu đơn đã nằm ở D1).

- [ ] **Step 1: Viết lại `Code.test.ts`.**
  - Giữ cách harness dùng `vm`. Thêm `computeHmacSha256Signature` giả lập (gọi `node:crypto`, trả mảng byte có dấu như Apps Script), `getFilesByName` và `getFoldersByName().next()`.
  - Để tạo vé và phong bì trong test, dùng chính `makeTicket` và `signEnvelope` từ `worker/shared/hmac.ts`. Như vậy hai bên chắc chắn tương thích với nhau.
  - Các test:
    - `upload vé đúng → 1 folder, fetch tới WORKER_URL/api/internal/file với envelope verify được`
    - `upload vé sai → ok:false, không folder`
    - `upload hai lần cùng vé → vẫn 1 folder, 1 file` *(Trọng tâm review 3)*
    - `notifyStatus envelope đúng → MailApp gửi tới data.to`
    - `envelope ts cũ 301 s → unauthorized, không gửi mail`
    - `Drive lỗi → ok:false 'Không lưu được file, vui lòng gửi qua Zalo kèm mã đơn'`
- [ ] **Step 2: Chạy** `npx vitest run apps-script`. Kết quả mong đợi: FAIL.
- [ ] **Step 3: Implement** trong `Code.gs`. Viết bằng ES5 như hiện tại (`var`, không dùng arrow function).
- [ ] **Step 4: Chạy lại.** Kết quả mong đợi: PASS.
- [ ] **Step 5: Cập nhật `docs/setup-apps-script.md`.**
  - Thêm Script Properties `SHARED_SECRET` (cùng giá trị với secret của Worker) và `WORKER_URL`.
  - Bỏ `TELEGRAM_*` và `TURNSTILE_SECRET`, vì hai thứ này đã chuyển sang Worker.
  - Nhắc rằng sau khi sửa code phải deploy lại bằng **New version**.
- [ ] **Step 6: Commit** `feat(apps-script): ticket-gated uploads and signed mail actions`

---

### Task 6: Chọn màu trong phần báo giá

**Files:**
- Create: `src/config/colorConfig.ts`, `src/lib/colors.ts`, `src/lib/colors.test.ts`
- Modify: `src/components/quote/OptionsPanel.tsx`, `src/components/quote/OptionsPanel.test.tsx`, `src/components/quote/Quote3DCalculator.tsx`, `src/components/quote/Quote3DCalculator.test.tsx`, `src/components/quote/StlViewer.tsx:31`

**Interfaces:**
- Produces:
  - `interface ColorOption { id: number; name: string; hex: string }`
  - `DEFAULT_COLORS: ColorOption[]` (4 màu seed)
  - `fetchColors(fetchFn = fetch): Promise<ColorOption[]>`. Gọi `GET /api/colors`. Nếu lỗi, `ok` không đúng hoặc danh sách rỗng thì trả `DEFAULT_COLORS`.
  - `OptionsPanel` có thêm props `colors: ColorOption[]`, `colorId: number`, `onColorChange(id: number): void`.
  - `Quote3DCalculator` giữ state `colorId`, mặc định là `colors[0].id`. Sau khi tải xong, nếu `colorId` hiện tại không còn trong danh sách thì quay về `colors[0]`. Truyền `color={selected.hex}` cho `StlViewer` và truyền `color={selected}` cho `OrderForm` (Task 7).

- [ ] **Step 1: Viết test thất bại.**
  - `fetchColors: API trả 3 màu → 3 màu; fetch reject → DEFAULT_COLORS; trả [] → DEFAULT_COLORS`
  - `OptionsPanel: nhóm "Màu" hiện 4 nút có aria-pressed, bấm "Nâu" → onColorChange(4); disabled khoá các nút màu`
  - `Quote3DCalculator: mặc định chọn màu đầu tiên` (mock `fetchColors`)
- [ ] **Step 2: Chạy.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Implement.**
  - Nhóm "Màu" đặt ngay sau nhóm "Nhựa". Dùng lại kiểu nút tròn đang có, với `style={{ background: hex }}`. Màu sáng có viền `ring-1 ring-mist`.
  - Đổi `OVERFLOW_COLOR` trong `StlViewer.tsx` sang `'#f59e0b'`.
- [ ] **Step 4: Chạy** `npm test`. Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(quote): color picker driving the 3D preview`

---

### Task 7: Gửi đơn hai bước trên front-end

**Files:**
- Create: `src/lib/api.ts`, `src/lib/api.test.ts`
- Modify: `src/lib/submitOrder.ts`, `src/lib/submitOrder.test.ts`, `src/utils/orderPayload.ts`, `src/utils/orderPayload.test.ts`, `src/components/quote/OrderForm.tsx`, `src/components/quote/OrderForm.test.tsx`, `src/config/contactConfig.ts` (chỉ comment)

**Interfaces:**
- Consumes:
  - Response của `POST /api/orders` (Task 3).
  - Upload của Apps Script (Task 5).
  - `ColorOption` (Task 6).
- Produces:
  - `createOrder(meta: OrderMeta, fetchFn = fetch): Promise<{ orderCode: string; uploadTicket: string | null; trackUrl: string }>`
    - Gọi `POST /api/orders` cùng origin với `Content-Type: application/json`.
    - Nếu `ok: false` thì ném `OrderSubmitError(error)`. Nếu lỗi mạng thì ném `OrderSubmitError('Không gửi được, kiểm tra mạng và thử lại')`.
  - `submitOrder(p: OrderPayload & { colorId: number }, opts: { url: string; transport?: Transport; fetchFn? }): Promise<{ orderCode: string; trackUrl: string; fileUploaded: boolean }>`. Hai bước:
    1. `createOrder`.
    2. Nếu `uploadTicket` có giá trị: dùng `transport` (vẫn là text/plain tới Apps Script) gửi `{ orderCode, uploadTicket, fileName, fileSize, fileBase64 }`.
    - Lỗi ở bước 2 **không ném lỗi**. Thay vào đó trả `fileUploaded: false`.
    - Nếu `uploadTicket` là `null` và `fileDelivery = 'upload'` (bản preview): trả `fileUploaded: false`.
  - `buildOrderPayload` nhận thêm `colorId`.
- `OrderForm`:
  - Nhận prop `color: ColorOption`. Hiện dòng "Màu: Đỏ" trong phần tóm tắt ở đầu form.
  - Gợi ý ô email đổi thành `không bắt buộc · để nhận email báo tiến độ`.
  - Màn hình gửi xong thêm link "Theo dõi tiến độ đơn" trỏ tới `trackUrl`.
  - Nếu `fileUploaded === false` và `fileDelivery = 'upload'`, hiện câu: `Đơn đã được ghi nhận nhưng file chưa gửi được. Gửi file qua Zalo kèm mã này nhé.`

- [ ] **Step 1: Viết test thất bại.**
  - `api.test`: `createOrder` POST đúng URL `/api/orders` với JSON. `ok:false` thì ném lỗi với đúng thông điệp.
  - `submitOrder.test`:
    - `có vé → transport được gọi với uploadTicket, không có customer trong body upload`
    - `transport reject → fileUploaded false, không ném`
    - `vé null → transport không được gọi`
  - `OrderForm.test`:
    - `màn hình xong có link href '/tra-cuu?ma=P3D-…'`
    - `fileUploaded false → hiện câu gửi file qua Zalo`
    - `payload có colorId của màu đang chọn`
    - Cập nhật các test hiện có cho chữ ký mới của `submit`.
- [ ] **Step 2: Chạy.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Chạy** `npm test`. Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(quote): two-step order submit via worker and Apps Script upload`

---

### Task 8: Trang tra cứu `/tra-cuu`

**Files:**
- Create: `src/pages/TrackPage.tsx`, `src/pages/TrackPage.test.tsx`
- Modify: `src/main.tsx`, `src/lib/api.ts` (thêm `trackOrder`), `src/components/site/Nav.tsx`, `src/components/layout/SiteFooter.tsx`

**Interfaces:**
- Consumes: `TrackView`, `STATUS_LABEL` và `PROGRESS` từ `src/shared/orderStatus.ts`.
- Produces:
  - `trackOrder(code, phone, fetchFn = fetch): Promise<{ ok: true; order: TrackView } | { ok: false; error: string }>`
  - `main.tsx`: nếu `location.pathname` bắt đầu bằng `/tra-cuu` thì render `TrackPage` (lazy), còn lại render `App`.
  - Nav có thêm mục `{ href: '/tra-cuu', label: 'Tra cứu đơn' }`. Footer có link tương tự.

Bố cục theo spec §7.5:
- Hai ô nhập. Ô mã đơn được điền sẵn từ `?ma=`.
- Mốc thời gian định dạng `dd/MM HH:mm`, giờ Việt Nam (`Asia/Ho_Chi_Minh`).
- Các bước đã qua có dấu ✓, bước hiện tại có ●, bước chưa tới có ○.
- Nếu `status = 'cancelled'`: thay danh sách bước bằng khung "Đơn đã huỷ", kèm ghi chú và thời điểm huỷ.
- Lấy ghi chú cho mỗi bước từ event **mới nhất** của bước đó.

- [ ] **Step 1: Viết test thất bại.**
  - `?ma=P3D-241124-AB12 → ô mã đơn đã điền`
  - `kết quả printing → 'Đã nhận đơn' và 'Đã thanh toán' có ✓, 'Đang in 3D' là bước hiện tại (aria-current="step"), 'Hoàn tất' chưa tới`
  - `ghi chú '<b>x</b>\ny' hiện đúng chữ đó, không có phần tử <b>` *(Trọng tâm review 5)*
  - `cancelled → hiện 'Đơn đã huỷ', không có danh sách 5 bước`
  - `ok:false → hiện thông báo lỗi trong role="alert"`
- [ ] **Step 2: Chạy.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Implement.** Dùng lại Nav, Footer và các token màu sẵn có.
- [ ] **Step 4: Chạy** `npm test` và `npm run build`. Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(site): order tracking page`

---

### Task 9: Worker admin: xác minh Access và API

**Files:**
- Create: `worker/admin/accessJwt.ts`, `worker/admin/accessJwt.test.ts`, `worker/admin/index.ts`, `worker/admin/api.test.ts`, `wrangler.admin.jsonc`
- Modify: `worker/shared/orderRepo.ts`, `package.json`

**Interfaces:**
- Consumes: `orderRepo`, `callAppsScript`, `STATUSES`, `STATUS_LABEL`.
- Produces:
  - `verifyAccessJwt(token: string, opts: { teamDomain: string; aud: string; now?: number; fetchJwks?: (url: string) => Promise<{ keys: JsonWebKey[] }> }): Promise<{ email: string } | null>`
    - Chỉ chấp nhận `alg` RS256. Chọn khoá theo `kid` từ `https://${teamDomain}/cdn-cgi/access/certs`, cache trong module 10 phút.
    - Kiểm tra `aud` (chuỗi hoặc mảng chứa `ACCESS_AUD`), `exp > now`, và `iss === 'https://' + teamDomain`.
  - Mọi `/api/*` của admin Worker:
    - Lấy JWT từ header `Cf-Access-Jwt-Assertion`. Thiếu, sai, hoặc email không có trong `ADMIN_EMAILS` (so sánh không phân biệt hoa thường) thì trả `401 { ok:false }`.
    - Với request không phải GET: header `Origin` phải bằng origin của request, nếu không thì trả `403`.
  - Các route:
    - `GET /api/orders?status=&q=&page=`:
      - Trả `{ ok, orders: OrderListItem[], total, page, pageSize: 30 }`, sắp theo `created_at DESC`.
      - `q` khớp `code LIKE`, `customer_phone LIKE` (đã chuẩn hoá nếu được), hoặc `customer_name LIKE`.
    - `GET /api/orders/:code`: trả `{ ok, order: OrderRow, events }`. Không có thì `404`.
    - `POST /api/orders/:code/status` với body `{ status: OrderStatus, note?: string }`:
      - Validate `status ∈ STATUSES`. Cắt `note` ở 500 ký tự.
      - Cập nhật `status`, `status_updated_at` và thêm một event.
      - Nếu đơn có email: gọi `callAppsScript('notifyStatus', { to, subject, text })`.
        - `subject = \`[In 3D Trung] Đơn ${code}: ${STATUS_LABEL[status]}\``.
        - `text` là text thuần, gồm: lời chào theo tên, trạng thái mới, thời điểm (giờ VN), ghi chú nếu có, link `${PUBLIC_SITE_URL}/tra-cuu?ma=${code}`, và dòng "Liên hệ Zalo 0913014605".
      - Ghi `email_sent`: `1` nếu gửi được, `0` nếu lỗi, `NULL` nếu đơn không có email.
      - Trả `{ ok, event }`.
    - `DELETE /api/orders/:code` với body `{ confirm: string }`. `confirm !== code` thì trả `400`. Nếu khớp thì xoá đơn và các event của nó, không gửi mail.
    - `GET /api/colors`: trả tất cả màu, kể cả màu đang ẩn.
    - `POST /api/colors` với body `{ name, hex }`. `hex` phải khớp `/^#[0-9a-f]{6}$/i`, `name` từ 1 đến 30 ký tự. Màu mới có `sort = max + 1`, `active = 1`.
    - `PATCH /api/colors/:id` với body `{ name?, hex?, active?, sort? }`.
    - Không có route nào xoá màu.
  - Phần không thuộc `/api` thì trả về `env.ASSETS` (UI admin, Task 10).
  - `wrangler.admin.jsonc`:
    - `name: trung-3d-admin`, `main: worker/admin/index.ts`.
    - `assets: { directory: ./dist-admin, binding: ASSETS, not_found_handling: single-page-application, run_worker_first: ["/api/*"] }`.
    - Cùng khối `d1_databases` với Worker công khai, kèm `vars`.
  - Script `"deploy:admin": "vite build --config vite.admin.config.ts && wrangler deploy -c wrangler.admin.jsonc"`.

- [ ] **Step 1: Viết test thất bại `accessJwt.test.ts`.** Trong test, tạo cặp khoá RSA bằng `crypto.subtle.generateKey` và ký JWT trong test.
  - Token hợp lệ thì trả `{ email }`.
  - Các trường hợp phải trả `null`: sai `aud`, hết hạn, sai `iss`, chữ ký bị sửa, `alg: none`, `kid` không có trong JWKS.
- [ ] **Step 2: Viết test thất bại `api.test.ts`.** Stub `verifyAccessJwt` qua tham số inject trong `createAdminHandler(deps)`.
  - `không có header → 401`
  - `email không thuộc ADMIN_EMAILS → 401`
  - `POST status thiếu Origin khớp → 403`
  - `đổi sang printing có email → event mới, Apps Script nhận notifyStatus với subject '[In 3D Trung] Đơn P3D-…: Đang in 3D', email_sent 1`
  - `Apps Script lỗi → vẫn ok, email_sent 0`
  - `đơn không email → không gọi Apps Script, email_sent null`
  - `cancelled rồi về paid → 2 event, status paid`
  - `status 'xyz' → 400`
  - `DELETE confirm sai → 400 và đơn còn; đúng → đơn và events mất`
  - `PATCH màu 3 hex '#ff0000' → GET /api/orders/:code của đơn cũ vẫn color_hex '#c62828'` *(Trọng tâm review 4)*
  - `POST màu hex 'red' → 400`
  - `list: status=printing lọc đúng; q='0913' tìm theo SĐT; page 2 với 31 đơn trả 1`
- [ ] **Step 3: Chạy** `npx vitest run worker/admin`. Kết quả mong đợi: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Chạy lại.** Kết quả mong đợi: PASS. Sau đó chạy `npm run typecheck:worker`.
- [ ] **Step 6: Commit** `feat(admin-worker): Cloudflare Access verification and admin API`

---

### Task 10: Giao diện admin

**Files:**
- Create: `admin/index.html`, `vite.admin.config.ts`, `src/admin/main.tsx`, `src/admin/AdminApp.tsx`, `src/admin/adminApi.ts`, `src/admin/OrdersList.tsx`, `src/admin/OrderDetail.tsx`, `src/admin/ColorsPage.tsx`, `src/admin/*.test.tsx`
- Modify: `package.json` (`build` build cả hai bản)

**Interfaces:**
- Consumes: các route của Task 9, `STATUS_LABEL`, `STATUSES`.
- Produces:
  - Định tuyến bằng hash: `#/orders` (mặc định), `#/orders/:code`, `#/colors`.
  - `adminApi` gọi fetch cùng origin, với `credentials: 'same-origin'`. Response `401` thì hiện "Phiên đăng nhập hết hạn, tải lại trang".
- Các màn hình:
  - **OrdersList**:
    - Có các tab lọc trạng thái: "Tất cả" và 6 trạng thái.
    - Ô tìm kiếm, debounce 300 ms.
    - Bảng gồm các cột: mã, ngày, tên, SĐT, nhựa · màu (có chấm màu), trạng thái. Đơn có `file_status = pending` hiện badge "Chưa có file".
    - Có phân trang.
  - **OrderDetail**:
    - Hiện mọi trường của đơn. Link Drive mở tab mới.
    - Cảnh báo khi đơn chưa có file.
    - Dòng thời gian các event: thời điểm, trạng thái, ghi chú, email (đã gửi / lỗi / không có email).
    - Form đổi trạng thái: một select gồm 6 giá trị, textarea ghi chú (tối đa 500 ký tự) và nút "Cập nhật".
    - Nút "Xoá đơn rác" mở hộp xác nhận. Hộp này yêu cầu gõ lại mã đơn, gõ đúng mới bật nút xoá.
  - **ColorsPage**:
    - Danh sách màu với ô `input type="color"`, tên, công tắc bật/ẩn và nút lên/xuống để đổi `sort`.
    - Form thêm màu.
  - Header có chữ "Quản trị đơn in 3D", hai link Đơn hàng và Màu, và nút đăng xuất trỏ tới `/cdn-cgi/access/logout`.

- [ ] **Step 1: Viết test thất bại.** Mock `adminApi`.
  - `OrdersList hiện badge 'Chưa có file' cho đơn pending`
  - `OrderDetail: chọn 'Đang giao hàng' + ghi chú → gọi setStatus(code,'shipping','GHN 123'), timeline thêm dòng`
  - `OrderDetail: nút xoá chỉ bật khi gõ đúng mã`
  - `ColorsPage: đổi màu → patchColor(id,{hex}); thêm màu hex hợp lệ → createColor`
  - `401 → hiện 'Phiên đăng nhập hết hạn'`
- [ ] **Step 2: Chạy.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Implement.**
  - `vite.admin.config.ts`: `root: 'admin'`, `build.outDir: '../dist-admin'`, `emptyOutDir: true`, dùng cùng các plugin.
  - `admin/index.html` import `../src/admin/main.tsx` và `../src/index.css`.
  - Script `"build": "tsc -b && vite build && vite build --config vite.admin.config.ts"`.
- [ ] **Step 4: Chạy** `npm test`, `npm run build`, rồi `ls dist-admin/index.html`. Kết quả mong đợi: PASS, có file `dist-admin/index.html`.
- [ ] **Step 5: Commit** `feat(admin): orders, order detail and colors screens`

---

### Task 11: Tài liệu triển khai và kiểm tra cuối

**Files:**
- Create: `docs/setup-cloudflare.md`
- Modify: `README.md`

- [ ] **Step 1: Viết `docs/setup-cloudflare.md`** bằng tiếng Việt, từng bước một, cho người không phải lập trình viên.
  1. `npx wrangler login`.
  2. `npx wrangler d1 create trung-3d` và `npx wrangler d1 create trung-3d-preview`. Dán `database_id` vào `wrangler.jsonc` (cả khối preview) và vào `wrangler.admin.jsonc`.
  3. Chạy `npx wrangler d1 migrations apply DB --remote` một lần.
  4. Đặt secret: `npx wrangler secret put SHARED_SECRET` (sinh bằng `openssl rand -hex 32`), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TURNSTILE_SECRET` (tuỳ chọn). Làm tương tự cho admin với `-c wrangler.admin.jsonc` (`SHARED_SECRET`).
  5. Trên dashboard Workers Builds của `trung-pcb-3d`, đặt deploy command là `npm run deploy`.
  6. Tạo project Workers Builds thứ hai cho repo này: tên `trung-3d-admin`, build command `npm ci`, deploy command `npm run deploy:admin`.
  7. Bật Cloudflare Access cho `trung-3d-admin.<subdomain>.workers.dev` (Settings → Domains & Routes → workers.dev → Enable Cloudflare Access).
     - Sửa policy: Include là Emails, chỉ email của Trung.
     - Login methods: Google và One-time PIN.
     - Copy giá trị AUD và team domain vào `vars` của `wrangler.admin.jsonc`.
  8. Điền `PUBLIC_SITE_URL`, `ADMIN_SITE_URL`, `APPS_SCRIPT_URL` vào vars. Điền `WORKER_URL` và `SHARED_SECRET` vào Script Properties của Apps Script.
  9. Kiểm tra:
     - Mở trang admin ở cửa sổ ẩn danh: phải bị đưa sang trang đăng nhập Cloudflare.
     - Gửi thử một đơn và tra cứu đơn đó.
     - Đổi trạng thái đơn và kiểm tra có nhận được email.
- [ ] **Step 2: Cập nhật `README.md`.** Phần "Cấu trúc" thêm `worker/`, `migrations/`, `src/admin/`, `src/pages/`. Thêm link tới `docs/setup-cloudflare.md`. Ghi rằng màu sửa trong trang admin, không sửa trong code.
- [ ] **Step 3: Chạy** `npm run lint && npm test && npm run build && npm run typecheck:worker && npx wrangler deploy --dry-run && npx wrangler deploy -c wrangler.admin.jsonc --dry-run`. Kết quả mong đợi: tất cả thành công.
- [ ] **Step 4: Commit** `docs: Cloudflare D1, Access and deployment setup`
