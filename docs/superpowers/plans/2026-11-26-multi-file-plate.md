# Gộp nhiều file vào một bàn in, nhận 3MF, khách quên mã đơn — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Khách thả nhiều file STL/3MF vào một đơn, một bàn in. Web tự xếp các món theo hình thật, tính giá gộp kèm dòng "tiết kiệm", và tạo file bàn in `.3mf` cho Trung. Quá một bàn thì chuyển sang Zalo. Khách tìm lại được mã đơn đã gửi từ máy mình.

**Kiến trúc:**
- Mọi việc nặng (đọc STL/3MF, chiếu hình, xếp bàn, tạo file bàn in) chạy trong Web Worker của trình duyệt (`src/workers/stlWorker.ts`).
- Worker Cloudflare chỉ kiểm tra dữ liệu, ghi D1 (bảng mới `order_files`, `order_items`) và cấp **một vé cho mỗi file**.
- Trình duyệt tải lần lượt từng file lên Apps Script. Apps Script lưu Drive rồi báo Worker `fileSaved` kèm `fileNo`.

**Công nghệ:** React 19 + TS + Vite + Tailwind v4, three.js, `fflate` (mới), Cloudflare Workers + D1, Google Apps Script, Vitest (test Worker chạy trên `node:sqlite` qua `worker/test/fakeD1.ts`).

**Spec:** `docs/superpowers/specs/2026-11-26-multi-file-plate-design.md`. Đọc cả spec trước, nhất là §10 (thay thế §7.8–§7.9 khi khác nhau). Spec nền: `docs/superpowers/specs/2026-11-24-orders-db-tracking-colors-design.md`.

## Ràng buộc chung

- Một đơn = một bàn in = một nhựa, một độ dày lớp, một màu. Thông số riêng từng món: `infillPercent`, `wallLoops`, `support`, `quantity`, hướng in, đổi inch.
- Bàn `printerConfig.bed` = 180×180×180. Khoảng hở `platePaddingMm` = 5. Món cao > 60 mm: khoảng hở 8. Mép bàn 3. Góc thử bước 15° (0…345). Ngân sách xếp 1000 ms.
- `perItemFee = 3500` (theo số món, từ món thứ 2, cộng sau `safetyMargin`, không hiện dòng riêng). `combinedMinimumOrder = 30000` khi ≥ 2 món. Giá tối thiểu một món vẫn `20000`.
- Zalo khi ≥ 2 món và một trong: không vừa một bàn (`"Không vừa một bàn in"`), > 10 món (`"Quá 10 món"`), tổng file nguồn > 35 MB (`"Tổng file lớn hơn 35 MB"`).
- 3MF: giới hạn giải nén 300 MB, 3.000.000 tam giác. Lỗi quá nặng: `"File 3MF quá nặng, gửi qua Zalo"`.
- File bàn in: chỉ tạo khi mọi bản vừa một bàn; > 35 MB thì bỏ; không tính vào giới hạn 35 MB tổng; `fileNo = 0`, `role = 'plate'`, tên Drive `00-ban-in.3mf`.
- `file_status` chỉ có `pending | saved | zalo`. File `pending` quá 30 phút hiện "Chưa nhận file" trong admin.
- `orders.file_status` là giá trị tổng hợp **chỉ từ file nguồn**: `zalo` nếu đơn Zalo; `pending` nếu còn file nguồn chưa `saved`; còn lại `saved`.
- Tên file trên Drive: `NN-<tên an toàn>` với `NN` = `fileNo` 2 chữ số.
- Apps Script nhận cả vé cũ `code|fileSize|exp` và vé mới `code|fileNo|fileSize|exp` trong bản phát hành này.
- Migration chỉ thêm, không xoá/đổi tên cột. Đơn cũ được chuyển thành 1 file + 1 món.
- `localStorage` đơn gần đây: khoá `recentOrders`, tối đa 20, **không lưu SĐT/tên/email**.
- Mọi chữ hiển thị bằng tiếng Việt. Không `dangerouslySetInnerHTML`.
- Đơn một món, số lượng 1: giá giống hệt hôm nay.

## Trọng tâm review

1. **Hai file trùng tên** (`part.stl` ×2 từ hai thư mục): cả hai đều được lưu trên Drive và mỗi file có link riêng. *(Task 9: `saves two files with the same name as distinct files`)*
2. **3MF không có `<build><item>`, hoặc `p:path` trỏ tới file con không tồn tại:** báo lỗi thân thiện, không treo, không ra món rỗng. *(Task 3: `rejects 3mf without build items`, `rejects missing component path`)*
3. **Khách xoá bớt chỉ còn 1 món:** quay về đúng hành vi một món (không dòng tiết kiệm, tối thiểu 20.000đ, không phí mỗi món). *(Task 6: `two items then one behaves like single item`)*
4. **Đổi hướng in hay đổi inch của một món không làm mất thông số các món khác**, và bàn được xếp lại. *(Task 11: `reorienting one item keeps other items' settings`)*
5. **Gửi lại cùng mã sau khi tải lỗi một phần:** chỉ cấp vé cho file chưa `saved`, kể cả file bàn in; không báo Trung lần nữa; `placements` khác chút do số thực không làm báo "nội dung khác". *(Task 8: `resubmit returns tickets only for unsaved files`, `fingerprint ignores placements`)*

---

### Task 1: Config và giá gộp

**Files:**
- Modify: `src/config/pricingConfig.ts`
- Modify: `src/utils/slicerEstimator.ts`
- Modify: `src/utils/pricing.ts`
- Test: `src/utils/slicerEstimator.test.ts`, `src/utils/pricing.test.ts`

**Interfaces:**
- Produces (config): `pricingRules.perItemFee = 3500`, `pricingRules.combinedMinimumOrder = 30000`; `slicerConfig.tallItemMm = 60`, `slicerConfig.tallPaddingMm = 8`, `slicerConfig.bedMarginMm = 3`, `slicerConfig.arrangeAngleStepDeg = 15`, `slicerConfig.arrangeBudgetMs = 1000`; `export const multiPlate = { maxItems: 10, maxTotalBytes: 35 * 1024 * 1024 }`.
- Produces (types, in `slicerEstimator.ts`):
  - `type SharedSettings = Pick<PrintSettings, 'material' | 'layerHeight'>`
  - `type ItemSettings = Pick<PrintSettings, 'infillPercent' | 'wallLoops' | 'support' | 'quantity'>`
  - `interface PartEstimate { baseVolume: number; partVolume: number; partTimeSec: number; layers: number }`
- Produces (functions):
  - `estimatePart(stats: MeshStats, s: PrintSettings, cfg?): PartEstimate`, the per-copy part of `estimatePrint`.
  - `estimatePrint(stats, s, cfg?, bed?, platesOverride?: number): PrintEstimate`. When `platesOverride` is given it replaces the grid plate count.
  - `estimatePlate(items: { stats: MeshStats; settings: ItemSettings }[], shared: SharedSettings, cfg?): PrintEstimate` with `plates = 1` and `copiesPerPlate = Σ quantity`.
  - `priceCombined(e: Pick<PrintEstimate,'grams'|'timeSec'>, m: MaterialConfig, itemCount: number, r?): PriceQuote | null`.

- [ ] **Step 1: Write failing tests**

```ts
// slicerEstimator.test.ts
it('estimatePrint with platesOverride=1 drops one warmup and purge', () => {
  const stats = box(50, 50, 10) // existing fixture helper; grid fits 9 per plate
  const s = { ...defaults, quantity: 10 }
  const grid = estimatePrint(stats, s)
  const one = estimatePrint(stats, s, slicerConfig, printerConfig.bed, 1)
  expect(grid.plates).toBe(2)
  expect(one.plates).toBe(1)
  expect(grid.timeSec - one.timeSec).toBeCloseTo(slicerConfig.warmupSec)
  expect(grid.grams - one.grams).toBeCloseTo(slicerConfig.purgeGrams)
})
it('estimatePlate sums parts and adds one warmup and purge', () => {
  const a = { stats: box(20, 20, 10), settings: { infillPercent: 15, wallLoops: 2, support: false, quantity: 2 } }
  const b = { stats: box(30, 10, 40), settings: { infillPercent: 50, wallLoops: 3, support: true, quantity: 1 } }
  const shared = { material: 'PETG' as const, layerHeight: 0.2 as const }
  const pa = estimatePart(a.stats, { ...shared, ...a.settings })
  const pb = estimatePart(b.stats, { ...shared, ...b.settings })
  const e = estimatePlate([a, b], shared)
  expect(e.timeSec).toBeCloseTo(2 * pa.partTimeSec + pb.partTimeSec + slicerConfig.warmupSec)
  expect(e.grams).toBeCloseTo(((2 * pa.partVolume + pb.partVolume) / 1000) * 1.27 + slicerConfig.purgeGrams)
  expect(e.plates).toBe(1)
})
// pricing.test.ts
it('priceCombined adds per-item fee after margin and uses combined minimum', () => {
  const q = priceCombined({ grams: 40, timeSec: 6000 }, materials.PETG, 3)!
  expect(q.total).toBe(32000) // (18000+5550)*1.05 + 7000 = 31727.5 → 32000
  expect(q.rangeLow).toBe(30000)
  expect(q.rangeHigh).toBe(38000)
  expect(priceCombined({ grams: 5, timeSec: 600 }, materials.PETG, 2)!.total).toBe(30000)
  expect(priceCombined({ grams: 5, timeSec: 600 }, materials.ABS, 2)).toBeNull()
})
```

- [ ] **Step 2: Run** `npx vitest run src/utils/slicerEstimator.test.ts src/utils/pricing.test.ts`. Expected: FAIL (functions not exported).
- [ ] **Step 3: Implement.** Extract `estimatePart` from `estimatePrint` without changing its numbers. In `priceCombined`, `rangeLow` uses `max(combinedMinimumOrder, …)`.
- [ ] **Step 4: Run** `npx vitest run src/utils`. Expected: PASS, and every existing test still passes.
- [ ] **Step 5: Commit** `feat(pricing): per-part estimate, combined plate estimate and price`

### Task 2: Footprint and plate arrangement

**Files:**
- Create: `src/utils/plateArrange.ts`
- Test: `src/utils/plateArrange.test.ts`

**Interfaces:**
- Coordinates: a footprint lives in the **bed plane** `(u, v) = (threeX, −threeZ)` of the mesh as displayed (Y-up, XZ centred at 0). A placement `{ x, y, rotDeg }` puts the local origin at bed point `(x, y)` (mm, origin at the bed corner, 0…180), rotated anticlockwise seen from above: `bed = (x + u·cosθ − v·sinθ, y + u·sinθ + v·cosθ)`.
- Produces:
  - `interface Placement { x: number; y: number; rotDeg: number }`
  - `interface Footprint { cells: Int16Array /* pairs (i,j) of 0.5 mm occupied cells, relative to origin */; res: number; hull: [number, number][] /* convex hull, mm, ≤ 32 points */ }`
  - `footprintOf(positions: Float32Array, res = 0.5): Footprint`: projects triangles onto the bed plane and fills them.
  - `interface ArrangeInput { itemId: string; copies: number; footprint: Footprint; height: number }`
  - `interface ArrangeResult { fits: boolean; placements: Record<string, Placement[]> /* length = copies when fits */ }`
  - `arrangePlate(inputs: ArrangeInput[], bed: BedSize, cfg?: SlicerConfig, clock?: () => number): ArrangeResult`

The algorithm follows spec §7.5, steps 1–5. Occupancy grid is 1 mm. Each copy is dilated by half its padding: 5 mm, or 8 mm if `height > tallItemMm`. Bed margin is `bedMarginMm`. Copies are ordered by footprint area descending, then taller first. Score = bounding box of the group so far + distance to the bed centre weighted by height. Ties break by angle and then position, so the result is deterministic. If the time budget runs out, keep scanning only coarse positions; never return an invalid placement.

- [ ] **Step 1: Write failing tests.** Helpers in the test: `box(l,w,h)` and `rightTriangle(leg,h)` (a prism) build positions; `occupancy(result, inputs)` rasterises the placed hulls.

```ts
it('places copies without overlap and inside the margin', () => {
  const r = arrangePlate([{ itemId: 'a', copies: 6, footprint: footprintOf(box(40, 30, 10)), height: 10 }], bed)
  expect(r.fits).toBe(true)
  expect(r.placements.a).toHaveLength(6)
  expectNoOverlap(r, 5)          // pairwise min distance between rotated hulls ≥ 5 mm
  expectInside(r, bed, 3)        // every hull point within [3, 177]
})
it('uses 8 mm spacing around tall copies', () => { /* two 30×30×80 copies: min distance ≥ 8 */ })
it('is deterministic', () => { expect(arrangePlate(inp, bed)).toEqual(arrangePlate(inp, bed)) })
it('reports not fitting', () => {
  expect(arrangePlate([{ itemId: 'a', copies: 5, footprint: footprintOf(box(100, 100, 5)), height: 5 }], bed).fits).toBe(false)
})
it('nests shapes tighter than bounding boxes', () => {
  // right triangle with 120 mm legs: two bounding boxes need 245 mm, but rotated 180° into each other
  // the pair fits in about 120 + gap on the 174 mm usable bed
  expect(arrangePlate([{ itemId: 'T', copies: 2, footprint: footprintOf(rightTriangle(120, 5)), height: 5 }], bed).fits).toBe(true)
})
it('puts the tallest copy nearer the centre than short ones', () => { /* 1 tall + 4 short */ })
it('finishes within the budget and stays valid when the clock runs out', () => {
  let t = 0
  const r = arrangePlate(tenItemsThirtyCopies, bed, slicerConfig, () => (t += 400))
  expectNoOverlap(r, 5); expectInside(r, bed, 3)
})
```

- [ ] **Step 2: Run** `npx vitest run src/utils/plateArrange.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `footprintOf` and `arrangePlate`. Use row bitmasks (`Uint32Array` per row) for the overlap test.
- [ ] **Step 4: Run.** Expected: PASS. Also time `tenItemsThirtyCopies` with the real clock and assert `< 1500` ms (CI headroom).
- [ ] **Step 5: Commit** `feat(arrange): shape-based plate packing with printability rules`

### Task 3: Read 3MF

**Files:**
- Modify: `package.json` (add `fflate` dependency)
- Create: `src/utils/threeMf.ts`
- Create: `tests/fixtures/threeMf.ts` (builds 3MF buffers in memory with `fflate.zipSync`)
- Test: `src/utils/threeMf.test.ts`

**Interfaces:**
- Produces:
  - `class ThreeMfError extends Error {}`
  - `interface ThreeMfObject { name: string; positions: Float32Array /* non-indexed triangles, Z-up, mm */ }`
  - `parse3mf(buffer: ArrayBuffer, limits = { maxUnzippedBytes: 300 * 1024 * 1024, maxTriangles: 3_000_000 }): ThreeMfObject[]` (one entry per `<build><item>`)
- Fixture: `make3mf(opts: { objects: …; build: …; extraModels?: Record<string,string>; unit?: string }): ArrayBuffer`

Read `_rels/.rels` to find the root model, or fall back to `3D/3dmodel.model`. Use a hand-written tag scanner, no `DOMParser`. Support `<mesh>`, `<components>/<component objectid transform p:path>` recursively, the `transform` attribute (12 numbers, column order as in the 3MF spec), and `unit`. Check the size limit while unzipping (`fflate.unzipSync` with a `filter` that sums `originalSize`) and before allocating. Error copy: corrupt → `"File 3MF không hợp lệ hoặc rỗng"`; too heavy → `"File 3MF quá nặng, gửi qua Zalo"`.

- [ ] **Step 1: Write failing tests:**
  - `reads a single mesh object`: triangle count and bbox.
  - `one item per build item with transforms`: two items of the same object, translated by 50 mm, give bboxes offset by 50.
  - `reads Bambu-style component p:path`: object in `3D/Objects/object_1.model`.
  - `converts inch units`: a 1-unit cube gives a 25.4 mm cube.
  - `names from object name or file #n`.
  - `rejects 3mf without build items`: throws ThreeMfError with the corrupt copy.
  - `rejects missing component path`: same.
  - `rejects zip bomb by unzipped size`: limit 1 KB in the test, throws the too-heavy copy.
  - `rejects too many triangles`.
  - `rejects non-zip bytes`.
- [ ] **Step 2: Run** `npx vitest run src/utils/threeMf.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(3mf): parse 3MF objects in a worker-safe way`

### Task 4: Write the plate file `.3mf`

**Files:**
- Create: `src/utils/plateFile.ts`
- Test: `src/utils/plateFile.test.ts`

**Interfaces:**
- Consumes: `Placement` (Task 2), `parse3mf` (Task 3, used only in the test).
- Produces: `buildPlate3mf(parts: { itemNo: number; name: string; positions: Float32Array /* displayed, Y-up */; placements: Placement[] }[], bed: BedSize): Uint8Array`

Each part is one `<object name="<itemNo> - <name>">` whose vertices are the mesh in Z-up `(u, v, h) = (X, −Z, Y)`. Each placement is one `<build><item>` with transform `[cosθ sinθ 0  −sinθ cosθ 0  0 0 1  x y 0]`. Use `unit="millimeter"`, deduplicate vertices with a hash map, and zip with `fflate.zipSync` (level 6). Include `[Content_Types].xml` and `_rels/.rels`.

- [ ] **Step 1: Write failing test** `round-trips through parse3mf`: 2 parts, 3 placements total. `parse3mf(buildPlate3mf(...))` returns 3 objects, and each bbox centre equals the placement `(x, y)` within 0.01, z min 0. The name of the first object is `"1 - a.stl"`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(3mf): build arranged plate file`

### Task 5: Worker API

**Files:**
- Modify: `src/workers/stlWorker.ts` (move the dispatch into an exported pure function)
- Create: `src/workers/handleRequest.ts`
- Modify: `src/utils/stlProcess.ts` (export `prepareMesh`)
- Modify: `src/lib/stlWorkerClient.ts`
- Test: `src/workers/handleRequest.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `prepareMesh(rawZUp: Float32Array, scale: number, autoOrient: boolean): ProcessedStl`, which `processStl` reuses after parsing.
  - Worker requests (`kind`):
    - `'parseFile'` `{ buffer, fileType: 'stl'|'3mf', scale, autoOrient }` → `{ parts: { name: string; source: Float32Array /* Y-up, scale 1, file orientation */; positions; stats; rotated }[] }`
    - `'prepare'` `{ source, scale, autoOrient }` → `WorkerResult`, for inch changes and back to "Như file" / "Tự xoay"
    - `'orient'` (unchanged)
    - `'arrange'` `{ inputs: { itemId, copies, positions, height }[], bed }` → `ArrangeResult & { hulls: Record<string, [number,number][]> }`
    - `'buildPlate'` `{ parts, bed }` → `{ bytes: Uint8Array }`
  - `handleRequest(req: StlWorkerRequest): { reply: unknown; transfer: Transferable[] }`, which throws errors with user-facing messages.
  - Client: `parseFileInWorker(buffer, fileType, scale?, autoOrient?)`, `prepareInWorker(source, scale, autoOrient)`, `orientInWorker` (unchanged), `arrangeInWorker(inputs, bed)`, `buildPlateInWorker(parts, bed)`. `parseStlInWorker` is removed once Task 11 stops using it.

- [ ] **Step 1: Write failing tests** for `handleRequest`:
  - `parseFile stl returns one part named after nothing`: `name: ''`, because the caller names it after the file.
  - `parseFile 3mf returns one part per build item`.
  - `prepare with scale 25.4 multiplies dims`.
  - `arrange returns hulls per item`.
  - `buildPlate returns zip bytes starting with PK`.
  - `3mf errors keep their message`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `stlWorker.ts`, only call `handleRequest` and post the reply (default error copy stays `'Không đọc được file STL'`).
- [ ] **Step 4: Run** `npx vitest run src/workers src/utils`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(worker): parse multi-part files, arrange and build plate in worker`

### Task 6: Quote state for a plate

**Files:**
- Create: `src/utils/plateState.ts`
- Test: `src/utils/plateState.test.ts`

**Interfaces:**
- Consumes: Task 1 (`estimatePlate`, `priceCombined`, `estimatePrint` with `platesOverride`), `ArrangeResult` (Task 2), `computeQuoteState` (existing).
- Produces:
  - `interface PlateItemInput { id: string; name: string; stats: MeshStats; settings: ItemSettings }`
  - `interface PlateQuote extends QuoteState { separateTotal: number | null; savings: number | null; fitsOnePlate: boolean }`
  - `computePlateState(a: { items: PlateItemInput[]; shared: SharedSettings; arrangement: ArrangeResult | null; totalSourceBytes: number }): PlateQuote`

Rules:
- **1 item:** same as `computeQuoteState(stats, {...shared, ...settings})`, except that `platesOverride = 1` when `arrangement?.fits`. `separateTotal`/`savings` = `null`.
- **≥ 2 items:** reasons in this order:
  - material (existing rule)
  - per item `"<name>: Vượt khổ: …"` (existing `formatOversize`)
  - `"Quá 10 món"` when `items.length > multiPlate.maxItems`
  - `"Tổng file lớn hơn 35 MB"` when `totalSourceBytes > multiPlate.maxTotalBytes`
  - `"Không vừa một bàn in"` when `arrangement && !arrangement.fits`

  Any reason → `consult`. Otherwise `estimatePlate` + `priceCombined(…, items.length)`. Then `separateTotal` = Σ `computeQuoteState(item alone).price.total`, and `savings = separateTotal − total` (null if ≤ 0).
- `arrangement === null` (still arranging) with ≥ 2 items → `orderType 'quote'`, `estimate`/`price` null, so the UI shows "Đang xếp bàn…".

- [ ] **Step 1: Write failing tests:**
  - `single item equals computeQuoteState`
  - `single item uses one plate when arrangement fits`
  - `two items price combined and show savings`: assert `savings === separateTotal - price.total` and > 0 for three 20×20×5 items.
  - `two items then one behaves like single item`: the one-item result equals `computeQuoteState` for that item (minimum 20000, no per-item fee), `savings` and `separateTotal` null.
  - `more than 10 items is consult with "Quá 10 món"`
  - `total bytes over 35 MB is consult`
  - `not fitting is consult with "Không vừa một bàn in"`
  - `oversize item reason names the item`
  - `ABS is consult`
  - `null arrangement leaves price pending`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(quote): plate quote state with Zalo rules and savings`

### Task 7: D1 migration and repo

**Files:**
- Create: `migrations/0003_order_items.sql`
- Modify: `worker/shared/orderRepo.ts`
- Test: `worker/shared/orderRepo.test.ts` (create) and existing worker tests

**Interfaces:**
- Produces:
  - `interface OrderFileRow { orderCode; fileNo: number; role: 'source'|'plate'; fileName; fileSize: number; fileType: 'stl'|'3mf'; fileDelivery: 'upload'|'zalo'; fileStatus: 'pending'|'saved'|'zalo'; driveUrl: string|null }`
  - `interface OrderItemRow { orderCode; itemNo; fileNo; name; dims: string; volume; surfaceArea; scale; orient: string|null; infillPercent; wallLoops; support: number; quantity; placements: string|null; footprint: string|null }`
  - `insertOrder(db, o: OrderRow, files: OrderFileRow[], items: OrderItemRow[]): Promise<void>`: one batch with `orders`, `order_files`, `order_items` and the first event.
  - `listOrderFiles(db, code): Promise<OrderFileRow[]>` (by `fileNo`)
  - `listOrderItems(db, code): Promise<OrderItemRow[]>` (by `itemNo`)
  - `setFileSaved(db, code, fileNo: number, fileUrl: string, folderUrl: string): Promise<boolean>`: updates the pending file row, sets `orders.drive_url = folderUrl`, and recomputes `orders.file_status` with `aggregateFileStatus`.
  - `aggregateFileStatus(files: Pick<OrderFileRow,'role'|'fileStatus'|'fileDelivery'>[]): 'pending'|'saved'|'zalo'` (pure, plate rows ignored)
  - `deleteOrder` also deletes the two new tables.

Migration: `CREATE TABLE order_files (… PRIMARY KEY (order_code, file_no))`, `CREATE TABLE order_items (… PRIMARY KEY (order_code, item_no))`. Columns are as in spec §7.8, with `file_status` CHECK in `('pending','saved','zalo')`. Backfill with `INSERT … SELECT`:
- `file_no = 1`, `role 'source'`, `file_type 'stl'`, `COALESCE(file_name,'model.stl')`, `COALESCE(file_size,0)`, `COALESCE(file_delivery,'upload')`, `COALESCE(file_status,'pending')`, `drive_url`.
- Item 1 from `json_extract(settings,'$.infillPercent'|'$.wallLoops'|'$.support'|'$.quantity')`, `orient NULL`, `placements NULL`, `footprint NULL`.

- [ ] **Step 1: Write failing tests** (on `createFakeD1()`):
  - `migration backfills old orders`: add an option `createFakeD1({ upTo: '0002' })` (applies migrations whose file name sorts ≤ that prefix) plus `applyMigration(db, '0003')`; create the DB up to 0002, insert an old-style order with raw SQL, apply 0003, and expect one `order_files` row and one `order_items` row with infill/walls/quantity taken from `settings`.
  - `insertOrder writes files and items`
  - `setFileSaved updates one file and the aggregate`: 2 sources + plate. Save source 1 → `pending`; save source 2 → `saved`; plate never changes the aggregate.
  - `aggregateFileStatus ignores plate`
  - `deleteOrder removes files and items`
- [ ] **Step 2: Run** `npx vitest run worker`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Update existing callers of `insertOrder`/`setFileSaved` so they compile (Task 8 finishes them).
- [ ] **Step 4: Run** `npx vitest run worker` and `npm run typecheck:worker`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(db): order_files and order_items with backfill`

### Task 8: Worker order API, tickets, internal callback, messages, tracking

**Files:**
- Modify: `worker/shared/hmac.ts`, `worker/public/orders.ts`, `worker/public/internal.ts`, `worker/public/track.ts`, `worker/shared/ownerMessage.ts`, `worker/admin/orders.ts`, `src/shared/orderStatus.ts`, `src/utils/orderPayload.ts` (type `OrderMeta` only)
- Test: `worker/shared/hmac.test.ts`, `worker/public/orders.test.ts`, `worker/public/internal.test.ts`, `worker/public/track.test.ts`, `worker/shared/ownerMessage.test.ts`, `worker/admin/api.test.ts`

**Interfaces:**
- Produces:
  - `makeFileTicket(secret, code, fileNo: number, fileSize: number, now?)` and `verifyFileTicket(secret, ticket, code, fileNo, fileSize, now?)`, with HMAC message `${code}|${fileNo}|${fileSize}|${exp}`. `makeTicket` stays for the Apps Script compatibility tests.
  - `OrderMeta` (shared type in `orderPayload.ts`): `{ orderCode; orderType; consultReasons; customer; colorId; shared: SharedSettings; files: { fileNo; role; fileName; fileSize; fileType; fileDelivery }[]; items: { itemNo; fileNo; name; dims: Dims; volume; surfaceArea; scale; orient; infillPercent; wallLoops; support: boolean; quantity; placements: Placement[] | null; footprint: [number,number][] | null }[]; estimate: { grams; timeSec; total; rangeLow; rangeHigh; separateTotal: number | null } | null; turnstileToken; honeypot; createdAt }`
  - `POST /api/orders` response: `{ ok, orderCode, uploads: { fileNo: number; ticket: string }[], trackUrl, preview, fileStatus }`.
  - `fileSaved` envelope data: `{ orderCode, fileNo?: number /* missing → 1 */, driveUrl /* folder */, fileUrl?: string /* missing → driveUrl */ }`.
  - `TrackView.items: { name: string; quantity: number }[]`.
  - Admin `GET /api/orders/:code` adds `files: OrderFileRow[]` and `items: OrderItemRow[]`.
  - `formatOwnerMessage(o, adminUrl, items: OrderItemRow[])` adds one line per item: `#1 moc-khoa.stl ×2 · đặc 15% · 2 vỏ · support`.

Validation (extends the current `validate`):
- 1 ≤ items ≤ 10; 1 ≤ source files ≤ 10; at most one plate file, with `fileNo 0`.
- Every `item.fileNo` refers to a source file. `quantity` is an integer 1…50. `infillPercent`, `wallLoops` and dims are finite.
- `placements` is null or has length `quantity`. `footprint` is null or has ≤ 32 points.
- For upload files: each ≤ 35 MB, sum of sources ≤ 35 MB.
- Item `name` and `fileName` are clamped to 160.
- Pass `readJson(req, 256_000)`.

Legacy `orders` columns:
- `settings = {...shared, ...item1 settings}`, `dims`/`volume`/`surface_area`/`scale` from item 1.
- `file_name` = the first source name, plus `" +N"` when there are more files.
- `file_size` = sum of sources, `file_delivery` = `zalo` if any source is Zalo.
- `file_status` = `aggregateFileStatus`, `estimate` = the JSON above.

Fingerprint = `JSON.stringify([shared, customer, colorId, files.map(name,size,type,delivery,role), items.map(itemNo,fileNo,name,scale,orient,infill,walls,support,quantity)])`.

- [ ] **Step 1: Write failing tests:**
  - `file ticket binds fileNo`: a ticket for fileNo 1 fails for fileNo 2.
  - `creates order with files and items and one ticket per upload file`
  - `zalo order returns no tickets`
  - `rejects 11 items`, `rejects item pointing to unknown file`, `rejects sources over 35 MB total`, `rejects placements length mismatch`
  - `resubmit returns tickets only for unsaved files`: save source 1 via internal, resubmit, and expect tickets for source 2 and plate 0 only, with no second Telegram call.
  - `fingerprint ignores placements`: resubmit with shifted placements gives ok.
  - `internal fileSaved with fileNo updates that file`, `internal fileSaved without fileNo updates file 1`
  - `track returns item names and quantities`
  - `owner message lists items`
  - `admin detail returns files and items`
  - Update the existing tests to the new payload shape.
- [ ] **Step 2: Run** `npx vitest run worker`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run worker` and `npm run typecheck:worker`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): multi-file orders with per-file tickets`

### Task 9: Apps Script

**Files:**
- Modify: `apps-script/Code.gs`
- Test: `apps-script/Code.test.ts`
- Modify: `docs/setup-apps-script.md` (redeploy note)

**Interfaces:**
- Consumes: `makeFileTicket`, `makeTicket` (Task 8).
- Produces:
  - Upload body `{ orderCode, fileNo?, uploadTicket, fileName, fileSize, fileBase64 }`.
  - `fileSaved` data `{ orderCode, fileNo, driveUrl: folderUrl, fileUrl }`.
  - `saveToDrive_(folderId, code, name, bytes)` returns `{ folderUrl, fileUrl }`. If the name already exists in the folder, it returns that existing file's URL.

Rules:
- With `fileNo` present, verify the new ticket. Without it, verify the old ticket and use `fileNo = 1`.
- Stored name = `('0' + fileNo).slice(-2) + '-' + safeName`.
- MIME is `model/3mf` for `.3mf` and `model/stl` otherwise.
- The error copy for a missing file becomes `'Thiếu file'`.

- [ ] **Step 1: Write failing tests:**
  - `accepts new ticket with fileNo`
  - `accepts old ticket without fileNo as file 1`
  - `rejects new ticket for another fileNo`
  - `saves two files with the same name as distinct files`: `01-part.stl` and `02-part.stl` in one folder.
  - `fileSaved callback carries fileNo and fileUrl`
  - `stores plate as 00-ban-in.3mf`
- [ ] **Step 2: Run** `npx vitest run apps-script`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(apps-script): per-file tickets and numbered Drive files`

### Task 10: Client payload and upload

**Files:**
- Modify: `src/utils/orderPayload.ts`, `src/lib/api.ts`, `src/lib/submitOrder.ts`
- Create: `src/lib/recentOrders.ts`
- Test: `src/utils/orderPayload.test.ts`, `src/lib/submitOrder.test.ts`, `src/lib/api.test.ts`, `src/lib/recentOrders.test.ts`

**Interfaces:**
- Consumes: `OrderMeta` (Task 8), `PlateQuote` (Task 6), `Placement` (Task 2).
- Produces:
  - `buildOrderMeta(a: { orderCode; quote: PlateQuote; shared: SharedSettings; colorId; customer: CustomerInfo; files: OrderMeta['files']; items: OrderMeta['items']; turnstileToken; now? }): OrderMeta`. It replaces `buildOrderPayload`.
  - `createOrder(meta, fetchFn?)` returns `{ orderCode; uploads: { fileNo; ticket }[]; trackUrl; preview; fileStatus }`.
  - `submitOrder(meta: OrderMeta, blobs: Map<number, Blob>, opts: { url; transport?; fetchFn? }): Promise<{ orderCode; trackUrl; preview; files: { fileNo: number; uploaded: boolean }[] }>`. It uploads one at a time, sources by ascending `fileNo` first and the plate (0) last, and keeps going after a failure. Files with no ticket because they are already saved count as `uploaded: true`; Zalo files are left out.
  - `saveRecentOrder(o: { code: string; createdAt: string; summary: string }, storage = localStorage)`, `listRecentOrders(storage = localStorage)`, `clearRecentOrders(storage = localStorage)`. Key `recentOrders`, newest first, deduplicated by code, max 20. Corrupt JSON → `[]`. Storage errors are swallowed.
  - `recentSummary(names: string[]): string` gives `"a.stl"` or `"a.stl +2 món"`.

- [ ] **Step 1: Write failing tests:**
  - `buildOrderMeta trims customer and copies estimate with separateTotal`
  - `uploads files in order with plate last`
  - `continues after one upload fails`
  - `already-saved files count as uploaded`
  - `recent orders keep 20 newest and only code, date, summary`: save 21, expect 20 newest first; each stored object's keys are exactly `code`, `createdAt`, `summary`.
  - `corrupt recent orders read as empty`
- [ ] **Step 2: Run** `npx vitest run src/lib src/utils/orderPayload.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(order): multi-file payload, sequential uploads, recent orders store`

### Task 11: Quote page — many items

**Files:**
- Create: `src/components/quote/usePlateItems.ts`, `src/components/quote/ItemList.tsx`
- Modify: `src/components/quote/Quote3DCalculator.tsx`, `src/components/quote/DropZone.tsx`, `src/components/quote/StlViewer.tsx`, `src/components/quote/QuoteResult.tsx`, `src/components/quote/OptionsPanel.tsx`
- Test: `src/components/quote/Quote3DCalculator.test.tsx`, `src/components/quote/ItemList.test.tsx` (create), `src/components/quote/QuoteResult.test.tsx`

**Interfaces:**
- Consumes: Task 5 client functions, Task 6 `computePlateState`.
- Produces:
  - `interface PlateFile { fileNo: number; file: File; buffer: ArrayBuffer; fileType: 'stl'|'3mf' }`
  - `interface PlateItem { id: string; fileNo: number; name: string; source: Float32Array; positions: Float32Array; stats: MeshStats; scale: number; orient: 'auto'|'file'|'face'; rotated: boolean; settings: ItemSettings; inchDismissed: boolean }`
  - `usePlateItems()` returns `{ files, items, selectedId, select, addFiles(files: File[]), removeItem(id), updateItem(id, patch: Partial<ItemSettings>), reorient(id, mode, down?), setScale(id, scale), arrangement: (ArrangeResult & { hulls }) | null, arranging: boolean, error: string | null, busy: boolean }`. It re-arranges (debounced 150 ms, stale results dropped by request id) after add, remove, quantity change, reorient and scale change. Removing the last item of a file drops the file.
  - `DropZone` prop `onFiles(files: File[])` replaces `onFile`; `multiple`; accepts `.stl` and `.3mf` (`accept` adds `.3mf,model/3mf`). Rejection copy: `"Chỉ nhận file .stl hoặc .3mf. Với file STEP, hãy gửi qua Zalo."`.
  - `StlViewer` prop `parts: { id: string; positions: Float32Array; placements: Placement[] | null; overflow: boolean; selected: boolean }[]` replaces `positions`/`overflow`. One geometry per part, one mesh per placement at three position `(x − bed.x/2, 0, −(y − bed.y/2))`, `rotation.y = θ` in radians. With `placements == null` (still arranging, or a single part that does not fit), the part is drawn centred. A selected part is drawn with an emissive tint. `onPickFace` reports the normal in the **part's local** frame (inverse rotation applied) together with `partId`: `onPickFace(partId, down)`.
  - `QuoteResult` new props `savings: number | null`, `separateTotal: number | null`, `pending: boolean`. With savings it shows `In riêng từng món: {formatVnd(separateTotal)} → Gộp chung bàn: {formatVnd(total)}` and a highlighted line `Bạn tiết kiệm {formatVnd(savings)}`. `pending` shows `Đang xếp bàn…`.
  - `OptionsPanel` unchanged API. The calculator passes `{...shared, ...selected.settings}` and splits `onChange` back. With ≥ 2 items, a caption above the item-specific controls says `Áp dụng cho món đang chọn: <name>`.

Single-item UI stays as today: no list, no savings line, and the top bar still shows the file name + "Đổi file". With ≥ 2 items, "Đổi file" becomes "+ Thêm file", next to a "Xếp lại" button. The inch, non-watertight and oversize notices are per item and prefixed with the item name when there are ≥ 2 items.

- [ ] **Step 1: Write failing tests** (mock the worker client module like the existing calculator test does):
  - `dropping two stl files lists two items and shows savings`
  - `dropping a 3mf with three objects lists three items named from the file`
  - `removing an item back to one hides the list and savings`
  - `reorienting one item keeps other items' settings`: set infill 50% on item 2, reorient item 1, item 2 still shows 50% when selected.
  - `not fitting shows Zalo consult reason`
  - `rejects .step with the new copy`
  - `QuoteResult shows savings lines`
- [ ] **Step 2: Run** `npx vitest run src/components/quote`. Expected: FAIL.
- [ ] **Step 3: Implement** `usePlateItems`, `ItemList`, and the viewer, drop zone, result and calculator changes. The calculator owns `shared` (material, layerHeight), color and orderCode. The order code is regenerated when the set of files changes after a sent order, the same as `startNewOrder` today.
- [ ] **Step 4: Run** `npx vitest run src/components/quote`. Expected: PASS. Then `npm run build`. Expected: no type errors.
- [ ] **Step 5: Verify in the preview** (`.claude/launch.json` dev server): drop two STL files and one 3MF, check the arrangement on the bed, the savings line and per-item settings, and take a screenshot.
- [ ] **Step 6: Commit** `feat(quote): multiple files on one plate with auto arrange`

### Task 12: Order form — send many files

**Files:**
- Modify: `src/components/quote/OrderForm.tsx`, `src/components/quote/Quote3DCalculator.tsx` (props)
- Test: `src/components/quote/OrderForm.test.tsx`

**Interfaces:**
- Consumes: Task 10 (`buildOrderMeta`, `submitOrder`, `saveRecentOrder`, `recentSummary`), Task 5 `buildPlateInWorker`, Task 11 `PlateFile`/`PlateItem`.
- Produces: `OrderForm` props replace `stats/settings/file/fileBuffer/scale` with `files: PlateFile[]`, `items: PlateItem[]`, `shared: SharedSettings`, `arrangement`, and `quote: PlateQuote`.

On send:
1. If `quote.orderType === 'quote'` and `arrangement?.fits`, build the plate file (`buildPlateInWorker`). If it is > 35 MB or fails, continue without it.
2. Build `files`:
   - sources get `fileDelivery 'zalo'` for the whole order when consult or when total > 35 MB, otherwise `'upload'`;
   - the plate is `fileNo 0` with `fileName 'ban-in.3mf'`.
3. Build `items` with placements and hulls.
4. Call `submitOrder`.
5. Call `saveRecentOrder`.

Done screen:
- Header `Đã gửi yêu cầu cho {n} món. Mã đơn của bạn`.
- A `Sao chép mã` button that turns into `Đã chép` for 2 s (`navigator.clipboard.writeText`; if it fails, select the code text).
- The line `Chụp màn hình hoặc lưu mã này để tra cứu sau`.
- Source files that failed to upload are listed under `Các file chưa gửi được, gửi qua Zalo kèm mã này:`. A plate failure is never mentioned.
- Stage copy `Đang chuẩn bị file` covers reading the files and building the plate.

- [ ] **Step 1: Write failing tests:**
  - `sends plate file when arranged`
  - `skips plate when consult`
  - `lists failed source files but not plate`
  - `copy code button copies`
  - `saves recent order summary`
  - Update the existing single-file tests to the new props.
- [ ] **Step 2: Run** `npx vitest run src/components/quote/OrderForm.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/components/quote` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(order-form): send multi-file orders with plate file and copy code`

### Task 13: Admin print sheet

**Files:**
- Create: `src/admin/detail/PrintSheet.tsx`
- Modify: `src/admin/adminApi.ts`, `src/admin/OrderDetail.tsx`, `src/admin/format.ts`
- Test: `src/admin/OrderDetail.test.tsx`, `src/admin/detail/PrintSheet.test.tsx` (create)

**Interfaces:**
- Consumes: admin detail `files`/`items` (Task 8).
- Produces:
  - `fileLabel(f: { fileStatus; fileDelivery }, createdAt: string, now = Date.now()): 'Đã lưu' | 'Gửi qua Zalo' | 'Đang tải' | 'Chưa nhận file'` (pending older than 30 min → `Chưa nhận file`)
  - `PrintSheet({ order, files, items })`, which renders:
    - the header line `BÀN IN · {material} · lớp {layerHeight} · {colorName} · ~{formatDuration} · {grams}g`;
    - `Tải file bàn in .3mf` linking to the plate `driveUrl`, or the text `Không có file bàn in`;
    - an SVG of the 180×180 bed with each placement's rotated hull and its item number (only when items have placements);
    - a table with the columns `# · Món · SL · Đặc · Vỏ · Support · Kích thước · File`, where the File cell links to that source's Drive file or shows `fileLabel`.
  - Old orders (no placements) show the table only.

- [ ] **Step 1: Write failing tests:**
  - `renders a row per item with Drive links`
  - `draws one hull per placement with item numbers`
  - `old order shows table without plate svg`
  - `shows Không có file bàn in when plate missing`
  - `fileLabel turns pending into Chưa nhận file after 30 minutes`
- [ ] **Step 2: Run** `npx vitest run src/admin`. Expected: FAIL.
- [ ] **Step 3: Implement.** Place `PrintSheet` in `OrderDetail` above the existing facts block.
- [ ] **Step 4: Run** `npx vitest run src/admin` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): print sheet with plate diagram and per-item table`

### Task 14: Tracking page — items and recent orders, plus Trung's note

**Files:**
- Modify: `src/pages/TrackPage.tsx`, `README.md`
- Test: `src/pages/TrackPage.test.tsx`

**Interfaces:**
- Consumes: `TrackView.items` (Task 8), `listRecentOrders`/`clearRecentOrders` (Task 10).

Behaviour:
- Below the order header, list `{name} ×{quantity}` per item.
- When the recent list is not empty, show a block titled `Đơn đã gửi từ máy này` with rows `{code} · {dd/MM} · {summary}`. Clicking a row fills the code field and focuses the phone field. A `Xoá danh sách` button clears the list.
- README: add the section `## Khách quên mã đơn` with these steps:
  1. Khách mở lại `/tra-cuu` trên đúng máy đã gửi đơn → mục "Đơn đã gửi từ máy này".
  2. Không có → khách nhắn Zalo, Trung tìm theo SĐT trong ô tìm kiếm của trang admin.
  3. Ô SĐT luôn bắt buộc khi đặt đơn nên đơn nào cũng tìm được theo SĐT.

- [ ] **Step 1: Write failing tests:**
  - `shows recent orders and fills code on click`
  - `clear removes recent orders`
  - `shows item names and quantities`
- [ ] **Step 2: Run** `npx vitest run src/pages`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run build` and `npm run lint`. Expected: all PASS.
- [ ] **Step 5: Manual check:** open a generated plate file (from a preview order, saved via devtools) in Bambu Studio and confirm the parts sit where the web placed them. Record the result in the PR description.
- [ ] **Step 6: Commit** `feat(track): recent orders on this device, item list, README note`
