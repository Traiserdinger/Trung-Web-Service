# Quote3DCalculator — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Xây một trang web tĩnh có các chức năng sau:
- Khách thả file STL vào, xem mô hình 3D trên bàn in A1 Mini, và nhận giá in tạm tính.
- Khách gửi đơn. File và thông tin đơn được lưu vào Google Drive của Trung, kèm thông báo Telegram và email.

**Kiến trúc:**
- Logic tính toán là các hàm thuần trong `src/utils/`, có unit test, nhận mọi hệ số từ `src/config/`.
- File STL được parse và phân tích trong Web Worker. Viewer dùng `three` bản thường, viết trong một component React.
- Gửi đơn bằng `POST text/plain` tới Google Apps Script (`apps-script/Code.gs`). Script lưu file vào Drive, nhắn Telegram và gửi Gmail.

**Công nghệ:** Vite + React + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), `three` + `@types/three`, Vitest + jsdom + Testing Library, Google Apps Script, Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-11-20-quote3d-calculator-design.md`. Đọc spec trước. Kế hoạch này lập luận dựa trên spec.

## Ràng buộc chung

- Không VPS, không database, không dịch vụ trả phí. Không lộ secret ra phía trình duyệt. Token Telegram và Turnstile secret chỉ nằm trong Script Properties của Apps Script.
- Toàn bộ chữ trên giao diện bằng tiếng Việt.
- Khổ in mặc định 180 × 180 × 180 mm. Đầu phun 0.4 mm, `lineWidth = 0.42`.
- Giá PETG 450đ/g. PLA và TPU tạm để 450đ/g. ABS: `contactOnly = true`.
- Phí thời gian: `phút = ceil(t/60)`. Nếu `phút > 30` thì tính `floor(phút/30) × 1850`, ngược lại là 0.
- `minimumOrder = 20000`, `rangePercent = 20`, `safetyMargin = 1.05`. Tổng giá làm tròn **lên** bội 1.000. Hai đầu khoảng giá làm tròn **gần nhất** theo bội 1.000.
- Hệ số slicer: `perLayerSec = 3`, `warmupSec = 360`, `purgeGrams = 0.8`, `shellExtra = 0.15`, `supportFactor = 1.15`, `supportAreaThreshold = 100` (mm²), góc treo 45°, mặt cách bàn in > 0.2 mm mới tính là mặt treo, đệm giữa các bản in trên bàn 5 mm.
- Bảng lưu lượng Q (mm³/s), theo thứ tự lớp 0.12 / 0.16 / 0.20 / 0.28:
  - PLA: 9 / 12 / 15 / 18
  - PETG: 7 / 9 / 11 / 13
  - TPU: 2.5 / 3 / 3 / 3.5
- Mật độ (g/cm³): PLA 1.24, PETG 1.27, TPU 1.21, ABS 1.04.
- Giới hạn file: xem trước 100 MB, gửi đơn 35 MB. Số lượng in từ 1 đến 50.
- **Làm rõ spec về support:** hệ số ×1.15 áp **một lần** cho số gram và **một lần** cho thời gian. Thời gian tính từ thể tích *chưa* nhân support: `t_part = (V_base/Q + layers × perLayerSec) × (support ? 1.15 : 1)`. Spec 5.2 viết theo cách có thể đọc thành nhân hai lần, cách viết ở đây là cách đúng.
- Mặc định (quyết định của Claude): nhựa **PETG**, lớp 0.20, infill 15%, 2 tường, số lượng 1.
- Commit message kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Trọng tâm review

1. **STL có winding bị đảo toàn bộ** (thể tích có dấu < 0): thể tích vẫn phải dương và mặt treo vẫn phải được phát hiện đúng. Test nằm ở Task 2.
2. **Sai số dấu phẩy động khi đếm lớp:** cao 30 mm, lớp 0.2 mm phải ra 150 lớp, không phải 151. Test nằm ở Task 3.
3. **STL binary có header bắt đầu bằng chữ `solid`** (SolidWorks hay xuất kiểu này): phải parse như file binary. Test nằm ở Task 6.
4. **SĐT nhập có dấu cách hoặc dấu chấm** như `0913 014 605`, `+84 913.014.605`: phải hợp lệ. `091301460` (9 số) không hợp lệ. Test nằm ở Task 5.
5. **Bấm gửi hai lần, hoặc gửi lại sau khi lỗi:** nút gửi bị khoá trong lúc đang gửi. Gửi lại sau lỗi dùng lại **cùng mã đơn**. Test nằm ở Task 9.

---

## Cấu trúc file

```
package.json, vite.config.ts, tsconfig*.json, index.html, .gitignore, README.md
src/
  main.tsx, App.tsx, index.css
  config/pricingConfig.ts        # máy in, nhựa, bảng Q, hệ số slicer, luật giá, giới hạn file, tuỳ chọn UI
  config/contactConfig.ts        # liên hệ, URL Apps Script, Turnstile site key
  utils/meshAnalysis.ts          # đổi trục, kích thước, S, V, kiểm tra mesh kín, mặt treo, inch, vượt khổ
  utils/slicerEstimator.ts       # estimatePrint, shouldSuggestSupport
  utils/pricing.ts               # computeTimeFee, priceQuote
  utils/format.ts                # formatDuration, formatVnd, formatDims
  utils/quoteState.ts            # computeQuoteState: quote hay consult
  utils/orderCode.ts             # generateOrderCode
  utils/orderPayload.ts          # isValidVnPhone, validateCustomer, buildOrderPayload, canUpload
  utils/stlProcess.ts            # processStl(buffer, scale): parse + đổi trục + phân tích
  workers/stlWorker.ts           # lớp vỏ mỏng quanh processStl
  lib/stlWorkerClient.ts         # parseStlInWorker
  lib/submitOrder.ts             # fileToBase64, submitOrder, OrderSubmitError
  components/quote/Quote3DCalculator.tsx, DropZone.tsx, StlViewer.tsx,
                   OptionsPanel.tsx, QuoteResult.tsx, OrderForm.tsx, TurnstileWidget.tsx
  components/layout/SiteHeader.tsx, SiteFooter.tsx, FloatingZalo.tsx
tests/fixtures/meshes.ts         # makeBox, makeUvSphere, flipWinding, removeTriangles, toBinaryStl, toAsciiStl
src/**/*.test.ts(x)              # test đặt cạnh file nguồn
apps-script/Code.gs
docs/setup-apps-script.md, docs/calibration.md
```

---

### Task 1: Dựng dự án, git và config

**Files:**
- Create: toàn bộ khung Vite, `src/config/pricingConfig.ts`, `src/config/contactConfig.ts`, `src/config/pricingConfig.test.ts`, `.gitignore`

**Interfaces — Produces:**
```ts
// pricingConfig.ts
export type MaterialId = 'PLA' | 'PETG' | 'TPU' | 'ABS';
export type LayerHeight = 0.12 | 0.16 | 0.2 | 0.28;
export interface MaterialConfig {
  id: MaterialId; label: string; density: number;      // g/cm³
  pricePerGram: number | null; color: string;          // hex
  contactOnly: boolean; flowRate: Record<LayerHeight, number>; // mm³/s
}
export interface BedSize { x: number; y: number; z: number }
export const printerConfig: { name: string; bed: BedSize };
export const materials: Record<MaterialId, MaterialConfig>;
export const slicerConfig: {
  perLayerSec: number; warmupSec: number; purgeGrams: number; lineWidth: number;
  shellExtra: number; supportFactor: number; supportAreaThreshold: number;
  overhangAngleDeg: number; bedContactMm: number; platePaddingMm: number; inchSuspectMaxMm: number;
};
export type SlicerConfig = typeof slicerConfig;
export const pricingRules: {
  freeMinutes: number; blockMinutes: number; pricePerBlock: number; minimumOrder: number;
  rangePercent: number; safetyMargin: number; roundTo: number;
};
export type PricingRules = typeof pricingRules;
export const fileLimits: { previewMaxBytes: number; uploadMaxBytes: number };
export const uiOptions: {
  layerHeights: { value: LayerHeight; label: string }[];   // "Mịn", "Chi tiết", "Tiêu chuẩn", "Nhanh"
  infills: number[]; wallLoops: number[];
  quantity: { min: number; max: number };
  defaults: { material: MaterialId; layerHeight: LayerHeight; infillPercent: number; wallLoops: number; quantity: number };
};
// contactConfig.ts
export const contactConfig: {
  name: string; phone: string; zaloUrl: string; email: string; githubUrl: string;
  appsScriptUrl: string; turnstileSiteKey: string;   // để '' cho tới khi deploy xong
};
```
Giá trị trong config lấy đúng như mục "Ràng buộc chung" và spec 5.4. Liên hệ: Nguyễn Đức Trung, `0913014605`, `https://zalo.me/0913014605`, `minhlaductrung@gmail.com`, `https://github.com/Traiserdinger`.

- [ ] **Step 1: Khởi tạo git.** Chạy `git init` trong `C:\Users\tiend\WebSource`.
- [ ] **Step 2: Scaffold Vite.** Chạy `npm create vite@latest tmp-vite -- --template react-ts`, chuyển toàn bộ nội dung `tmp-vite/` (kể cả file ẩn) lên thư mục gốc rồi xoá `tmp-vite`. Cài thêm: `npm i three` và `npm i -D @types/three tailwindcss @tailwindcss/vite vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event`.
- [ ] **Step 3: Cấu hình.**
  - Thêm plugin `tailwindcss()` vào `vite.config.ts`.
  - Viết `src/index.css` chỉ có một dòng `@import "tailwindcss";`.
  - Thêm khối `test: { environment: 'jsdom', setupFiles: ['src/setupTests.ts'] }`.
  - `src/setupTests.ts` import `@testing-library/jest-dom/vitest`.
  - Thêm script `"test": "vitest run"`.
  - Xoá các file demo của Vite (logo, `App.css`).
- [ ] **Step 4: Viết test config bị fail** (`src/config/pricingConfig.test.ts`):
```ts
expect(materials.PETG.pricePerGram).toBe(450);
expect(materials.ABS.contactOnly).toBe(true);
expect(materials.TPU.flowRate[0.2]).toBe(3);
expect(printerConfig.bed).toEqual({ x: 180, y: 180, z: 180 });
expect(pricingRules).toMatchObject({ freeMinutes: 30, blockMinutes: 30, pricePerBlock: 1850, minimumOrder: 20000, safetyMargin: 1.05 });
expect(fileLimits.uploadMaxBytes).toBe(35 * 1024 * 1024);
expect(uiOptions.defaults.material).toBe('PETG');
```
- [ ] **Step 5: Chạy `npm test`.** Kết quả mong đợi: FAIL, không tìm thấy module.
- [ ] **Step 6: Viết hai file config.** Chạy lại `npm test`, kết quả mong đợi: PASS. Chạy `npm run build`, kết quả mong đợi: build thành công.
- [ ] **Step 7: Commit** toàn bộ, kể cả `docs/`, với message `chore: scaffold Vite React TS app with pricing and contact config`.

---

### Task 2: Phân tích hình học mesh

**Files:**
- Create: `tests/fixtures/meshes.ts`, `src/utils/meshAnalysis.ts`, `src/utils/meshAnalysis.test.ts`

**Interfaces:**
- Consumes: `BedSize`, `slicerConfig` (Task 1)
- Produces:
```ts
// tests/fixtures/meshes.ts — toạ độ STL Z-up, tam giác non-indexed, winding CCW hướng ra ngoài
export function makeBox(w: number, d: number, h: number, origin?: [number, number, number]): Float32Array;
export function makeUvSphere(r: number, segments?: number, rings?: number): Float32Array;
export function concat(...parts: Float32Array[]): Float32Array;
export function flipWinding(p: Float32Array): Float32Array;
export function removeTriangles(p: Float32Array, indices: number[]): Float32Array;
// meshAnalysis.ts
export interface Dims { length: number; width: number; height: number }  // X, Z, Y sau khi đổi trục
export interface MeshStats {
  dims: Dims; surfaceArea: number; volume: number; signedVolume: number;
  isWatertight: boolean; overhangArea: number; triangleCount: number;
}
export function orientZUpToYUp(p: Float32Array): Float32Array;   // (x,y,z)→(x,z,−y), rồi tâm XZ = 0, minY = 0
export function scalePositions(p: Float32Array, factor: number): Float32Array;
export function analyzeMesh(p: Float32Array, cfg?: SlicerConfig): MeshStats; // p đã đổi trục
export function isSuspectedInches(d: Dims, cfg?: SlicerConfig): boolean;     // cạnh lớn nhất < 5
export function exceedsBed(d: Dims, bed: BedSize): { exceeds: boolean; axes: (keyof Dims)[] }; // length↔x, width↔y, height↔z
```

- [ ] **Step 1: Viết test bị fail.**
  - `fixture box has outward winding`: `analyzeMesh(orientZUpToYUp(makeBox(10,10,10))).signedVolume > 0`.
  - `cube 10mm`: kết quả có `volume` ≈ 1000, `surfaceArea` ≈ 600 (`toBeCloseTo(…, 6)`), `isWatertight === true`, `triangleCount === 12`.
  - `orient`: `makeBox(20,10,5, [3,4,7])` sau khi đổi trục có `dims` = `{length:20, width:10, height:5}`, minY = 0, tâm X và Z = 0 (sai số 1e-9).
  - `sphere`: với `makeUvSphere(10, 64, 32)`, thể tích nằm trong ±2% của 4188.79, diện tích nằm trong ±2% của 1256.64.
  - `open mesh`: `removeTriangles(box, [0,1])` cho `isWatertight === false`.
  - `inverted winding` (trọng tâm review 1): khối T đã `flipWinding` vẫn có `volume > 0` và `overhangArea ≈ 300`.
  - `overhang`: khối T = `concat(makeBox(10,10,20,[10,0,0]), makeBox(30,10,5,[0,0,20]))` cho `overhangArea ≈ 300` (mặt dưới của thanh ngang). Cube cho `overhangArea === 0`, vì mặt đáy nằm sát bàn in.
  - `inches`: `isSuspectedInches({length:2, width:1, height:1})` là true. Kích thước (10,1,1) cho false.
  - `exceedsBed`: kích thước (210,90,40) với bàn 180 cho `{exceeds:true, axes:['length']}`.
- [ ] **Step 2: Chạy `npx vitest run src/utils/meshAnalysis.test.ts`.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt `meshAnalysis.ts`.**
  - Diện tích: `½|(b−a)×(c−a)|`.
  - Thể tích có dấu: `Σ a·(b×c)/6`. `volume = |signedVolume|`.
  - Mesh kín: gộp đỉnh bằng khoá `round(v/1e-4)`. Mỗi cạnh vô hướng phải được đếm đúng 2 lần.
  - Mặt treo: lấy pháp tuyến đơn vị `n = normalize((b−a)×(c−a)) × sign(signedVolume)`. Mặt được tính là treo khi `n.y < −cos(overhangAngleDeg)` và `min(a.y, b.y, c.y) > bedContactMm`.
- [ ] **Step 4: Chạy lại test.** Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat: mesh analysis (orient, dims, area, volume, watertight, overhang)`.

---

### Task 3: Ước tính gram và thời gian

**Files:**
- Create: `src/utils/slicerEstimator.ts`, `src/utils/slicerEstimator.test.ts`

**Interfaces:**
- Consumes: `MeshStats` (Task 2), `materials`, `slicerConfig`, `printerConfig` (Task 1)
- Produces:
```ts
export interface PrintSettings {
  material: MaterialId; layerHeight: LayerHeight; infillPercent: number;
  wallLoops: number; support: boolean; quantity: number;
}
export interface PrintEstimate {
  grams: number; timeSec: number; layers: number; plates: number; copiesPerPlate: number;
  shellVolume: number; infillVolume: number; partVolume: number;   // mm³, partVolume đã gồm support
}
export function countLayers(height: number, layerHeight: number): number;  // ceil(h/lh − 1e-9)
export function estimatePrint(stats: MeshStats, s: PrintSettings, cfg?: SlicerConfig, bed?: BedSize): PrintEstimate;
export function shouldSuggestSupport(stats: MeshStats, cfg?: SlicerConfig): boolean; // overhangArea ≥ threshold
```
Công thức: spec 5.2 bước 7–10, có áp phần làm rõ về support trong mục Ràng buộc chung.
- `copiesPerPlate = max(1, floor(bed.x·bed.y / ((length+5)(width+5))))`
- `plates = ceil(quantity / copiesPerPlate)`
- `grams = quantity·partVolume/1000·ρ + purgeGrams·plates`
- `timeSec = quantity·t_part + warmupSec·plates`

- [ ] **Step 1: Viết test bị fail.** Dùng stats của cube 10 mm (S = 600, V = 1000, cao 10, dài/rộng 10), PETG, lớp 0.2, infill 15%, 2 tường:
  - `no support, qty 1`: `shellVolume ≈ 594`, `infillVolume ≈ 60.9`, `partVolume ≈ 654.9`, `grams ≈ 1.6317` (`toBeCloseTo(…, 3)`), `layers === 50`, `timeSec ≈ 569.54` (sai số 2 chữ số thập phân), `copiesPerPlate === 144`, `plates === 1`.
  - `support, qty 3`: `partVolume ≈ 753.135`, `grams ≈ 3.6694`, `timeSec ≈ 1082.90`.
  - `thin shell clamp`: với S = 5000 và V = 1000, `shellVolume === 1000` và `infillVolume === 0`.
  - `layers precision` (trọng tâm review 2): `countLayers(30, 0.2) === 150`, `countLayers(10, 0.12) === 84`.
  - `plates`: kích thước 100×100, số lượng 3 cho `copiesPerPlate === 2`, `plates === 2`.
  - `support suggestion`: `shouldSuggestSupport` trả true khi `overhangArea` = 300, false khi = 50.
- [ ] **Step 2: Chạy test.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt `slicerEstimator.ts`.**
- [ ] **Step 4: Chạy test.** Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat: slicer estimator for grams, time and plates`.

---

### Task 4: Tính giá và định dạng hiển thị

**Files:**
- Create: `src/utils/pricing.ts`, `src/utils/format.ts`, cùng các file `*.test.ts` tương ứng

**Interfaces — Produces:**
```ts
export function computeTimeFee(minutes: number, r?: PricingRules): number;
export interface PriceQuote { materialCost: number; minutes: number; timeFee: number; total: number; rangeLow: number; rangeHigh: number }
export function priceQuote(e: Pick<PrintEstimate,'grams'|'timeSec'>, m: MaterialConfig, r?: PricingRules): PriceQuote | null; // null nếu contactOnly hoặc pricePerGram null
export function formatDuration(sec: number): string;  // ceil ra phút; "45 phút", "1 giờ 05 phút"
export function formatVnd(n: number): string;          // "32.000đ"
export function formatDims(d: Dims): string;           // "62 × 40 × 25 mm", làm tròn số nguyên
```

- [ ] **Step 1: Viết test bị fail.**
  - Phí thời gian: `computeTimeFee` với 0, 30, 31, 59, 60, 120 lần lượt ra 0, 0, 1850, 1850, 3700, 7400.
  - `priceQuote({grams:100, timeSec:7200}, PETG)` ra `{materialCost:45000, minutes:120, timeFee:7400, total:56000, rangeLow:45000, rangeHigh:67000}`.
  - Giá sàn: `priceQuote({grams:1.6317, timeSec:569.54}, PETG)` ra `total === 20000`, `rangeLow === 20000`, `rangeHigh === 24000`.
  - `priceQuote(…, ABS)` ra `null`.
  - `formatDuration`: 2700 → `"45 phút"`, 3900 → `"1 giờ 05 phút"`, 7200 → `"2 giờ 00 phút"`, 30 → `"1 phút"`.
  - `formatVnd`: 32000 → `"32.000đ"`, 1250000 → `"1.250.000đ"`.
  - `formatDims({length:62.4, width:40, height:25.6})` → `"62 × 40 × 26 mm"`.
- [ ] **Step 2: Chạy test.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt hai file.**
  - `total = max(minimumOrder, ceilTo1000((materialCost + timeFee) × safetyMargin))`
  - `rangeLow = max(minimumOrder, roundTo1000(total × 0.8))`
  - `rangeHigh = roundTo1000(total × 1.2)`
  - `formatVnd` tự chèn dấu chấm phân cách hàng nghìn, không dùng `Intl` (để tránh ký tự nbsp).
- [ ] **Step 4: Chạy test.** Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat: pricing rules and display formatting`.

---

### Task 5: Trạng thái báo giá, mã đơn, dữ liệu đơn

**Files:**
- Create: `src/utils/quoteState.ts`, `src/utils/orderCode.ts`, `src/utils/orderPayload.ts`, cùng các file `*.test.ts` tương ứng

**Interfaces:**
- Consumes: `estimatePrint`, `priceQuote`, `exceedsBed`, `formatDims`
- Produces:
```ts
export type OrderType = 'quote' | 'consult';
export interface QuoteState { orderType: OrderType; consultReasons: string[]; estimate: PrintEstimate | null; price: PriceQuote | null }
export function computeQuoteState(stats: MeshStats, s: PrintSettings): QuoteState;
// lý do: "ABS" khi nhựa contactOnly; `Vượt khổ: ${formatDims(dims)}` khi vượt khổ. Có lý do nào thì estimate và price là null.
export function generateOrderCode(date?: Date, rand?: () => number): string; // P3D-YYMMDD-XXXX, ký tự [A-Z2-9]
export interface CustomerInfo { name: string; phone: string; email: string; note: string; consent: boolean; honeypot: string }
export type CustomerErrors = Partial<Record<'name'|'phone'|'email'|'consent', string>>;
export function isValidVnPhone(p: string): boolean;     // bỏ dấu cách, dấu chấm, gạch ngang rồi khớp /^(0|\+84)\d{9}$/
export function validateCustomer(c: CustomerInfo): CustomerErrors;
export function canUpload(fileSize: number): boolean;   // ≤ fileLimits.uploadMaxBytes
export interface OrderPayload {
  orderCode: string; orderType: OrderType; consultReasons: string[];
  customer: { name: string; phone: string; email: string; note: string };
  settings: PrintSettings; dims: Dims; surfaceArea: number; volume: number;
  estimate: { grams: number; timeSec: number; total: number; rangeLow: number; rangeHigh: number } | null;
  fileName: string; fileSize: number; fileBase64: string;
  turnstileToken: string | null; honeypot: string; createdAt: string;   // ISO
}
export function buildOrderPayload(a: { orderCode: string; quote: QuoteState; stats: MeshStats; settings: PrintSettings;
  customer: CustomerInfo; fileName: string; fileSize: number; fileBase64: string; turnstileToken: string | null; now?: Date }): OrderPayload;
```
Thông báo lỗi khi kiểm tra thông tin khách:
- Tên trống: `"Vui lòng nhập họ tên"`
- SĐT sai: `"Số Zalo/SĐT không hợp lệ"`
- Email sai (chỉ kiểm khi có nhập): `"Email không hợp lệ"`
- Chưa tick đồng ý: `"Vui lòng đồng ý để Trung liên hệ báo giá"`

- [ ] **Step 1: Viết test bị fail.**
  - `quoteState`: cube PETG cho `orderType === 'quote'` và `price.total === 20000`. ABS cho `{orderType:'consult', consultReasons:['ABS'], estimate:null, price:null}`. Kích thước (210,90,40) cho `consultReasons` là `['Vượt khổ: 210 × 90 × 40 mm']`.
  - `orderCode`: `generateOrderCode(new Date(2026,10,20), () => 0)` ra `'P3D-261120-AAAA'`. Với `rand` mặc định thì khớp `/^P3D-\d{6}-[A-Z2-9]{4}$/`.
  - `phone` (trọng tâm review 4): các số `0913014605`, `0913 014 605`, `+84 913.014.605` là true. Các số `091301460`, `1913014605`, `abc` là false.
  - `validateCustomer`: thông tin rỗng, không tick đồng ý thì có lỗi ở `name`, `phone`, `consent` và không có lỗi `email`.
  - `buildOrderPayload` cho đơn consult: `estimate === null`, `consultReasons` đúng như đầu vào, `customer` không chứa `consent` và `honeypot`.
  - `canUpload`: `35*1024*1024` là true, cộng thêm 1 byte là false.
- [ ] **Step 2: Chạy test.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt ba file.**
- [ ] **Step 4: Chạy test.** Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat: quote state, order code and order payload`.

---

### Task 6: Parse STL trong Web Worker

**Files:**
- Create: `src/utils/stlProcess.ts`, `src/utils/stlProcess.test.ts`, `src/workers/stlWorker.ts`, `src/lib/stlWorkerClient.ts`
- Modify: `tests/fixtures/meshes.ts`, thêm `toBinaryStl(p, header?)` và `toAsciiStl(p)`

**Interfaces:**
- Consumes: `orientZUpToYUp`, `scalePositions`, `analyzeMesh`
- Produces:
```ts
export class StlParseError extends Error {}
export function processStl(buffer: ArrayBuffer, scale?: number): { positions: Float32Array; stats: MeshStats };
// Dùng STLLoader().parse(buffer). Ném StlParseError('File STL không hợp lệ hoặc rỗng') nếu không có tam giác nào.
// Thứ tự xử lý: scale trước, rồi mới đổi trục.
// Worker nhận: { id: number; buffer: ArrayBuffer; scale: number }
// Worker trả về: { id; ok: true; positions; stats } hoặc { id; ok: false; message }
//   positions gửi dạng transferable.
export function parseStlInWorker(buffer: ArrayBuffer, scale?: number): Promise<{ positions: Float32Array; stats: MeshStats }>;
// Gửi một bản sao của buffer (không transfer), để client còn giữ bản gốc mà scale lại theo inch.
```

- [ ] **Step 1: Viết test bị fail.**
  - File binary: `toBinaryStl(makeBox(10,10,10))` cho `stats.volume ≈ 1000`.
  - File ASCII: `toAsciiStl(makeBox(10,10,10))` cho `volume ≈ 1000`.
  - Header `solid` (trọng tâm review 3): `toBinaryStl(box, 'solid exported by SolidWorks')` vẫn cho `volume ≈ 1000`.
  - Scale: `processStl(buf, 25.4)` với cube 1 mm cho `dims.length ≈ 25.4`.
  - File rỗng: `new ArrayBuffer(84)` (0 tam giác) ném `StlParseError`.
- [ ] **Step 2: Chạy test.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt.**
  - `processStl` viết như interface ở trên.
  - Worker là lớp vỏ mỏng quanh `processStl`.
  - Client tạo worker bằng `new Worker(new URL('../workers/stlWorker.ts', import.meta.url), { type: 'module' })`, mỗi lời gọi có `id` tăng dần.
- [ ] **Step 4: Chạy test.** Kết quả mong đợi: PASS. Chạy `npm run build`, kết quả mong đợi: build thành công và worker được tách thành chunk riêng.
- [ ] **Step 5: Commit** `feat: STL parsing in a web worker`.

---

### Task 7: Viewer 3D

**Files:**
- Create: `src/components/quote/StlViewer.tsx`

**Interfaces:**
- Consumes: `BedSize`
- Produces:
```ts
export interface StlViewerHandle { resetView(): void }
export interface StlViewerProps { positions: Float32Array | null; color: string; overflow: boolean; bed: BedSize }
export const StlViewer: React.ForwardRefExoticComponent<StlViewerProps & React.RefAttributes<StlViewerHandle>>;
```
Yêu cầu:
- Tạo renderer, scene, camera và `OrbitControls` một lần trong `useEffect`. Khi unmount phải dispose renderer, geometry và material.
- Bàn in: `GridHelper` kích thước `bed.x`, chia 18 ô. Thêm `Box3Helper` hoặc khung dây trong suốt cho khối `bed.x × bed.z × bed.y`, đặt đáy ở y = 0.
- Mô hình dùng `MeshStandardMaterial`. Màu lấy theo `overflow ? '#ef4444' : color`. Gọi `geometry.computeVertexNormals()`.
- Camera tự đặt để nhìn trọn mô hình hoặc bàn in, lấy cái nào lớn hơn. `resetView()` đưa camera về vị trí mặc định đó.
- Dùng `ResizeObserver` để resize canvas theo khung chứa.
- Đổi `positions` thì thay geometry. Đổi `color` hoặc `overflow` thì chỉ đổi màu, không tạo lại geometry.

- [ ] **Step 1: Cài đặt component.** Phần này không có unit test vì jsdom không có WebGL. Phần kiểm tra bằng mắt nằm ở Task 8, Step 5.
- [ ] **Step 2: Chạy `npx tsc -b`.** Kết quả mong đợi: không có lỗi.
- [ ] **Step 3: Commit** `feat: three.js STL viewer with print bed`.

---

### Task 8: Ghép module `Quote3DCalculator`

**Files:**
- Create: `src/components/quote/Quote3DCalculator.tsx`, `DropZone.tsx`, `OptionsPanel.tsx`, `QuoteResult.tsx`, `OptionsPanel.test.tsx`, `QuoteResult.test.tsx`
- Modify: `src/App.tsx` (tạm thời chỉ render `<Quote3DCalculator />`)

**Interfaces:**
- Consumes: `parseStlInWorker`, `computeQuoteState`, `shouldSuggestSupport`, `isSuspectedInches`, `StlViewer`, `uiOptions`, `materials`, các hàm format
- Produces:
```ts
export function DropZone(p: { onFile(f: File): void; disabled?: boolean }): JSX.Element; // nhận .stl; file > previewMaxBytes thì báo lỗi
export function OptionsPanel(p: { value: PrintSettings; onChange(s: PrintSettings): void; supportReason: string | null }): JSX.Element;
export function QuoteResult(p: { quote: QuoteState | null; stats: MeshStats | null; onSubmit(): void }): JSX.Element;
export function Quote3DCalculator(): JSX.Element;
```
Hành vi:
- Khi nạp file mới:
  - parse trong worker
  - tự tick support theo `shouldSuggestSupport`, dòng lý do là `` `Phát hiện ~${(overhangArea/100).toFixed(1)} cm² mặt treo` ``
  - nếu nghi đơn vị inch thì hiện dòng "File có thể tính bằng inch, nhân ×25,4?" kèm nút áp dụng. Nút này parse lại từ buffer gốc với `scale = 25.4`.
- Khi đổi tuỳ chọn: chỉ gọi lại `computeQuoteState`, không parse lại file.
- Mesh hở: hiện "Mesh không kín – giá có thể sai".
- Vượt khổ: mô hình chuyển đỏ và hiện *"Vượt khổ bàn in tiêu chuẩn - Cần chia mảnh hoặc liên hệ tư vấn"*.
- Lỗi parse: hiện `message` của lỗi.
- `QuoteResult`:
  - Đơn quote hiện dòng `~{gram} g · ~{formatDuration}`, `Tạm tính: {formatVnd(total)}`, `(khoảng {low} – {high})`, câu *"Giá tạm tính, sai số khoảng ±20%. Giá chính xác sau khi slice."*, và nút **"Gửi yêu cầu in"**.
  - Đơn consult hiện lý do và nút **"Gửi yêu cầu tư vấn"**, không hiện giá.
  - Có khối `<details>` "Chi tiết kỹ thuật" liệt kê S, V, chiều cao, số lớp, V_shell, V_infill.
- ABS trong `OptionsPanel` có nhãn "ABS – liên hệ".
- Layout: desktop chia 2 cột (`lg:grid-cols-2`), mobile xếp dọc.

- [ ] **Step 1: Viết test bị fail.**
  - `QuoteResult` với đơn quote (total 32000, low 26000, high 39000) hiện chữ `Tạm tính: 32.000đ`, `khoảng 26.000đ – 39.000đ`, và nút "Gửi yêu cầu in".
  - `QuoteResult` với đơn consult `['ABS']` có nút "Gửi yêu cầu tư vấn", không có chữ "Tạm tính", và có chữ "ABS".
  - `OptionsPanel`: bấm "+" khi số lượng đang là 50 thì không gọi `onChange` với 51. Bấm "−" khi đang là 1 thì không gọi với 0. Chọn "0.28" thì `onChange` nhận được `layerHeight: 0.28`.
- [ ] **Step 2: Chạy test.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt bốn component.** Đặt nút "Reset góc nhìn" gọi `viewerRef.current?.resetView()`.
- [ ] **Step 4: Chạy test.** Kết quả mong đợi: PASS.
- [ ] **Step 5: Kiểm tra bằng mắt.** Chạy `npm run dev` rồi lần lượt thử:
  1. File STL binary.
  2. File STL ASCII, tạo bằng fixture ghi ra file.
  3. Khối 200 mm: mô hình chuyển đỏ, xuất hiện nút tư vấn.
  4. Chọn ABS: thấy nút tư vấn, không có giá.
  5. Khối 2 mm: hiện gợi ý inch, bấm áp dụng thì kích thước thành 50,8 mm.
  6. Xoay, zoom mô hình rồi bấm Reset.
  7. Màu mô hình đổi theo loại nhựa đã chọn.
  8. File khoảng 80 MB: giao diện không đơ trong lúc parse.
- [ ] **Step 6: Commit** `feat: Quote3DCalculator UI`.

---

### Task 9: Gửi đơn phía web

**Files:**
- Create: `src/lib/submitOrder.ts`, `src/lib/submitOrder.test.ts`, `src/components/quote/OrderForm.tsx`, `src/components/quote/OrderForm.test.tsx`, `src/components/quote/TurnstileWidget.tsx`
- Modify: `Quote3DCalculator.tsx` (bấm nút gửi thì mở `OrderForm`)

**Interfaces:**
- Consumes: `validateCustomer`, `canUpload`, `buildOrderPayload`, `generateOrderCode`, `contactConfig`
- Produces:
```ts
export class OrderSubmitError extends Error {}
export type Transport = (url: string, body: string, onProgress?: (fraction: number) => void) => Promise<string>;
export const xhrTransport: Transport;  // XMLHttpRequest POST, Content-Type text/plain;charset=utf-8, dùng upload.onprogress
export function fileToBase64(f: Blob): Promise<string>;  // FileReader.readAsDataURL, bỏ phần tiền tố "data:...;base64,"
export function submitOrder(p: OrderPayload, opts: { url: string; transport?: Transport; onProgress?: (f: number) => void }): Promise<{ orderCode: string }>;
// response {ok:true, orderCode} thì resolve. {ok:false, error} thì ném OrderSubmitError(error).
// lỗi mạng hoặc JSON hỏng thì ném OrderSubmitError('Không gửi được, kiểm tra mạng và thử lại').
// url rỗng thì ném OrderSubmitError('Chưa cấu hình nơi nhận đơn').
export function OrderForm(p: { quote: QuoteState; stats: MeshStats; settings: PrintSettings; file: File; onClose(): void;
  submit?: typeof submitOrder }): JSX.Element;
export function TurnstileWidget(p: { siteKey: string; onToken(t: string | null): void }): JSX.Element; // nạp api.js của Turnstile; siteKey rỗng thì không render gì
```
Hành vi của `OrderForm`:
- Gồm các trường: Họ tên, Zalo/SĐT, Email, Ghi chú. Checkbox đồng ý dùng câu *"Tôi đồng ý cho Trung lưu file và liên hệ để báo giá."* Thêm một input honeypot `name="website"`, ẩn bằng CSS (không dùng `type=hidden`).
- Mã đơn tạo **một lần** khi form mount, giữ nguyên qua các lần gửi lại.
- Trong lúc gửi: nút bị khoá, có thanh tiến trình.
- `!canUpload(file.size)`: không gửi, hiện "File lớn hơn 35MB – vui lòng gửi file qua Zalo kèm mã đơn {code}" và nút mở `zaloUrl`.
- Gửi thành công: hiện mã đơn, câu "Nhắn mã này để chốt đơn" và nút "Nhắn Zalo cho Trung".
- Gửi thất bại: giữ nguyên dữ liệu đã nhập, hiện lỗi, kèm đường dự phòng qua Zalo và mã đơn.

- [ ] **Step 1: Viết test bị fail.**
  - `submitOrder`, mỗi trường hợp truyền một transport giả:
    - Transport trả `{ok:true, orderCode:'P3D-261120-AAAA'}` thì resolve ra đúng mã đó.
    - Trả `{ok:false, error:'Quá nhiều đơn'}` thì ném `OrderSubmitError` với message `'Quá nhiều đơn'`.
    - Transport reject thì ném lỗi có message "Không gửi được…".
    - `url` rỗng thì ném "Chưa cấu hình nơi nhận đơn".
  - `OrderForm`:
    - Bấm gửi khi form trống thì hiện ba lỗi và `submit` không được gọi.
    - Nhập hợp lệ, bấm gửi hai lần liền thì `submit` chỉ được gọi 1 lần (trọng tâm review 5).
    - `submit` lần đầu reject, lần sau resolve, bấm gửi lại thì cả hai lần gọi có cùng `orderCode`, và form vẫn giữ tên đã nhập sau lần lỗi.
    - File lớn hơn 35 MB thì `submit` không được gọi và có hiện chữ "gửi file qua Zalo".
- [ ] **Step 2: Chạy test.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt.**
- [ ] **Step 4: Chạy test.** Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat: order form and submission to Apps Script`.

---

### Task 10: Khung trang và hướng dẫn deploy

**Files:**
- Create: `src/components/layout/SiteHeader.tsx`, `SiteFooter.tsx`, `FloatingZalo.tsx`, `README.md`
- Modify: `src/App.tsx`, `index.html` (`lang="vi"`, title "In 3D & Thiết kế mạch – Nguyễn Đức Trung")

Nội dung:
- **Header:** tên và câu mô tả ngắn: "Thiết kế mạch (Altium/Allegro) · Gia công PCB · In 3D vỏ hộp khớp mạch".
- **Footer:** Zalo, điện thoại (`tel:`), email (`mailto:`), GitHub. Mọi giá trị lấy từ `contactConfig`.
- **FloatingZalo:** nút tròn cố định ở góc dưới bên phải, mở `zaloUrl` trong tab mới.
- **README:** cách chạy dev và test, cách sửa config, và các bước deploy lên Cloudflare Pages: tạo repo GitHub, push code, vào Pages chọn Connect to Git, build command `npm run build`, output `dist`.

- [ ] **Step 1: Viết test bị fail** (`SiteFooter.test.tsx`): footer chứa link `href="https://zalo.me/0913014605"`, `href="tel:0913014605"` và `href="mailto:minhlaductrung@gmail.com"`.
- [ ] **Step 2: Chạy test.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt** các component, sửa `App.tsx`, viết README.
- [ ] **Step 4: Chạy test.** Kết quả mong đợi: PASS. Chạy `npm run build`, kết quả mong đợi: build thành công.
- [ ] **Step 5: Commit** `feat: site shell with contact links and deploy guide`.

---

### Task 11: Google Apps Script và tài liệu cài đặt

**Files:**
- Create: `apps-script/Code.gs`, `docs/setup-apps-script.md`, `docs/calibration.md`

**Interfaces:**
- Consumes: định dạng `OrderPayload` (Task 5), gửi lên dưới dạng JSON trong `e.postData.contents`
- Produces: `doPost(e)` trả JSON `{ok:true, orderCode}` hoặc `{ok:false, error}` qua `ContentService` với `MimeType.JSON`. `doGet()` trả `{ok:true}` để kiểm tra script còn sống.

Script Properties gồm `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DRIVE_FOLDER_ID` (= `1EIxvJZqVhZ8Y8Zp3JmoKgIIpM-Jrokh5`), `OWNER_EMAIL` (= `minhlaductrung@gmail.com`), và `TURNSTILE_SECRET` (tuỳ chọn).

`doPost` làm theo thứ tự sau, mỗi bước là một hàm riêng có hậu tố `_`:
1. Parse JSON. Nếu `honeypot` khác rỗng thì trả `{ok:true}` giả và không lưu gì.
2. Kiểm tra kích thước: `fileBase64.length ≤ ceil(35MB × 4/3)`.
3. Nếu có `TURNSTILE_SECRET` thì gọi `UrlFetchApp` POST tới `https://challenges.cloudflare.com/turnstile/v0/siteverify`. Xác minh thất bại thì trả `{ok:false, error:'Xác minh chống spam thất bại'}`.
4. Giới hạn tần suất: dùng `CacheService.getScriptCache()`, khoá `rl_<sđt đã chuẩn hoá>`, tối đa 3 đơn trong 600 giây. Vượt quá thì trả `{ok:false, error:'Bạn đã gửi quá nhiều đơn, vui lòng thử lại sau 10 phút'}`.
5. Lấy thư mục gốc bằng `DriveApp.getFolderById(DRIVE_FOLDER_ID)`, tạo thư mục con `createFolder(orderCode)`. Lưu file `.stl` bằng `Utilities.newBlob(Utilities.base64Decode(b64), 'model/stl', fileName)`. Lưu `order.json` (payload đã bỏ `fileBase64`).
6. Gửi Telegram bằng `sendMessage`, nội dung văn bản thường (không dùng `parse_mode`).
   - Đơn quote: `🟢 ĐƠN IN 3D {code}` + tên, SĐT, email, nhựa, lớp, infill, số tường, support, số lượng, kích thước, `~{g} g · ~{thời gian}`, `Tạm tính {giá} (khoảng {low}–{high})`, ghi chú, link thư mục.
   - Đơn consult: `🟠 CẦN TƯ VẤN {code}` + lý do + kích thước + thông số, không có giá.
7. Gửi email bằng `MailApp.sendEmail(OWNER_EMAIL, '[Đơn in 3D] {code}', cùng nội dung)`.
8. Bước 6 hoặc 7 lỗi thì vẫn trả `ok:true`, vì file đã lưu được, chỉ ghi `console.error`. Bước 5 lỗi thì trả `ok:false`.

`docs/setup-apps-script.md`, viết từng bước bằng tiếng Việt:
1. Tạo bot với @BotFather để lấy token.
2. Nhắn cho bot một tin, mở `https://api.telegram.org/bot<TOKEN>/getUpdates` để lấy `chat.id`.
3. Vào script.google.com, tạo dự án mới, dán `Code.gs` vào.
4. Vào Project Settings, thêm các Script Properties.
5. Vào Deploy, chọn New deployment, loại Web app, Execute as: **Me**, Who has access: **Anyone**. Cấp quyền khi Google hỏi.
6. Dán URL `/exec` vào `contactConfig.appsScriptUrl`.
7. Đặt thư mục Drive về chế độ **Bị hạn chế**.
8. Mỗi lần sửa code script thì vào Manage deployments, chọn Edit, tạo New version.
9. (Tuỳ chọn) Tạo Turnstile widget trên Cloudflare, lấy site key và secret.

`docs/calibration.md` gồm:
- Bảng mẫu với các cột: file, nhựa, lớp, infill, tường, S, V, cao, số lớp, gram (web), gram (Bambu), thời gian (web), thời gian (Bambu), lệch %.
- Hướng dẫn chỉnh `Q`, `perLayerSec`, `shellExtra` để sai số trung bình về 0 (biên an toàn đã do `safetyMargin` lo).

- [ ] **Step 1: Viết `Code.gs` và hai tài liệu.**
- [ ] **Step 2: Kiểm tra cú pháp.** Chạy `node --check apps-script/Code.gs` (đổi tạm đuôi thành `.js` nếu node không nhận `.gs`). Kết quả mong đợi: không có lỗi cú pháp.
- [ ] **Step 3: Commit** `feat: Apps Script order receiver and setup docs`.

---

### Task 12: Kiểm tra tổng thể

- [ ] **Step 1: Chạy `npm test`.** Kết quả mong đợi: mọi test PASS. Chạy `npm run build`, kết quả mong đợi: build thành công, không có lỗi TypeScript.
- [ ] **Step 2: Mở trang bằng `npm run dev` trong trình duyệt.** Lặp lại các bước kiểm tra bằng mắt ở Task 8, Step 5. Thêm: mở form gửi đơn khi `appsScriptUrl` để trống, phải thấy lỗi "Chưa cấu hình nơi nhận đơn" kèm đường dự phòng qua Zalo. Thử thêm ở khổ màn hình mobile 375 px.
- [ ] **Step 3: Thử gửi đơn thật** (cần Trung đã deploy Apps Script theo `docs/setup-apps-script.md`).
  - Gửi một đơn PETG: phải có thư mục mang mã đơn trên Drive, có tin 🟢 trên Telegram và có email.
  - Gửi một đơn ABS: phải có tin 🟠.
  - Ngắt mạng rồi gửi: phải hiện lỗi kèm đường dự phòng qua Zalo.
- [ ] **Step 4: Ghi lại kết quả.** Bước nào chưa làm được, ví dụ Apps Script chưa deploy, thì ghi rõ là chưa kiểm.
