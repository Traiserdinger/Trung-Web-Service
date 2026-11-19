# Thiết kế: Báo giá In 3D tự động + Gửi đơn về Drive

- Ngày: 2026-11-20
- Chủ dự án: Nguyễn Đức Trung
- Trạng thái: chờ duyệt

## 1. Mục đích và lý do

Trung nhận thiết kế mạch (Altium/Allegro, 2–6 lớp), đặt gia công, hàn/test và in 3D vỏ hộp bằng **Bambu Lab A1 Mini**. Khách mục tiêu: sinh viên đồ án, nhóm nghiên cứu, startup làm mẫu, dân DIY.

Module này là phần đầu tiên của website dịch vụ. Nó giải quyết hai việc:

1. Khách **tự thả file STL** để xem mô hình 3D và nhận **giá tạm tính ngay**, không phải chờ nhắn tin hỏi giá.
2. Khi khách bấm gửi, **file STL + thông số + giá tạm tính + liên hệ của khách** về thẳng Google Drive của Trung, kèm **thông báo Telegram trên điện thoại** và email dự phòng. Trung chốt đơn thủ công qua Zalo.

Toàn bộ chạy miễn phí: web tĩnh trên Cloudflare Pages, phần nhận file là Google Apps Script trên tài khoản Google của Trung.

## 2. Mục tiêu, ngoài phạm vi, điều cấm

**Mục tiêu**
- Giá tạm tính lệch không quá khoảng ±20% so với Bambu Studio, sau khi đã hiệu chỉnh hệ số.
- Mọi đơn gửi thành công đều có file trên Drive và có thông báo Telegram trong vòng 1 phút.
- Trung đổi giá và hệ số bằng cách sửa file config, không đụng code giao diện.
- Chạy mượt với file STL tới 100MB (xem trước) và 35MB (gửi đơn).

**Ngoài phạm vi (để bản sau)**
- File STEP, 3MF, OBJ.
- Slicer thật chạy trên máy tính của Trung qua Cloudflare Tunnel (hướng B, sẽ làm ở V2).
- Nhiều file trong một đơn. V1 là một file mỗi đơn.
- Tự xoay mô hình cho vừa bàn in, tự chia mảnh.
- Thanh toán online, tài khoản khách, trang quản trị, theo dõi đơn.
- Landing page đầy đủ, trang gói dịch vụ mạch, portfolio. Các phần này sẽ được bàn riêng ở vòng sau. V1 chỉ có một trang đơn giản chứa module và thông tin liên hệ.

**Điều cấm (dù chạy được cũng coi là hỏng)**
- Báo giá thấp hơn thực tế một cách có hệ thống, khiến Trung lỗ.
- Lộ token Telegram hay khoá bí mật nào ra code phía trình duyệt.
- Mất file của khách mà không báo lỗi. Khách phải luôn biết đơn đã gửi được hay chưa, và có đường dự phòng là gửi qua Zalo.
- Trình duyệt đơ khi mở file lớn.
- Nhận đơn ABS rồi in hỏng. A1 Mini là máy khung hở nên ABS chỉ ở chế độ "liên hệ".

## 3. Ràng buộc

- Không có VPS, database hay dịch vụ trả phí. Không phụ thuộc thẻ thanh toán.
- Máy in: Bambu A1 Mini, khổ in 180×180×180mm, đầu phun 0.4mm.
- Giá đã chốt:
  - PETG Basic **450đ/gram** (giá bán cho khách).
  - Phí thời gian: **miễn phí khi tổng thời gian ≤ 30 phút**. Quá 30 phút thì tính **1.850đ cho mỗi block 30 phút trọn vẹn**, tức `floor(phút / 30) × 1.850đ`. Kiểm tra: 120 phút = 4 block = 7.400đ, khớp với số Trung đưa.
- Giao diện tiếng Việt.

## 4. Các hướng đã cân nhắc

### 4.1. Cách ước tính gram và thời gian

| Hướng | Mô tả | Đánh đổi | Kết quả |
|---|---|---|---|
| **A. Công thức hiệu chỉnh trong trình duyệt** | Tính diện tích, thể tích, chiều cao từ mesh rồi áp hệ số | 0đ, ra kết quả ngay. Sai số ±15–20% sau khi hiệu chỉnh | **Chọn cho V1** |
| B. Máy của Trung chạy Bambu Studio CLI qua Cloudflare Tunnel | Slice thật bằng profile của Trung | Gần chính xác tuyệt đối, nhưng máy phải bật | Để V2 |
| C. CuraEngine WASM trong trình duyệt | Slice ngay phía khách | Profile Cura khác Bambu, nặng, chậm trên điện thoại | Loại |

### 4.2. Cách nhận file và báo đơn

| Hướng | Mô tả | Đánh đổi | Kết quả |
|---|---|---|---|
| **A. Google Apps Script → Drive + Telegram + Gmail** | Script trên tài khoản Google của Trung nhận file, lưu Drive, gửi thông báo | File nằm đúng trên Drive, token được giữ kín. Giới hạn khoảng 35MB | **Chọn** |
| B. Cloudflare Function gửi file thẳng vào Telegram | File nằm trong chat Telegram | Đơn giản, giới hạn 50MB, khó sắp xếp file | Không chọn |
| C. Cloudflare R2 + Telegram | 10GB lưu trữ | Phải gắn thẻ thanh toán | Loại |

**Vì sao báo qua Telegram mà không qua Zalo hay WhatsApp:** Zalo cần Official Account đã xác minh doanh nghiệp. WhatsApp cần Meta Business API với mẫu tin đã duyệt. Cả hai đều không làm miễn phí cho cá nhân được.

## 5. Những gì đã thống nhất

### 5.1. Giao diện

Desktop chia 2 cột, mobile xếp dọc. Viewer nằm trên, bảng cấu hình nằm dưới.

```
┌──────────────────────────────┬─────────────────────────────┐
│  [Kéo-thả file .stl / Chọn]  │ Loại nhựa: (PLA)(PETG)(TPU) │
│ ┌──────────────────────────┐ │            (ABS – liên hệ)  │
│ │   Bàn in 180×180 (lưới)  │ │ Chiều cao lớp: 0.12 ...0.28 │
│ │        [mô hình 3D]      │ │ Infill: 15 25 50 100%       │
│ └──────────────────────────┘ │ Số tường: 2 3 4             │
│ D×R×C: 62 × 40 × 25 mm       │ [x] Cần support (tự phát    │
│ [Reset góc nhìn]             │     hiện – có lý do)        │
│ ⚠ Vượt khổ bàn in ... (đỏ)   │ Số lượng: [-] 1 [+]         │
│                              │ ─────────────────────────── │
│                              │ ~27 g · ~1 giờ 05 phút      │
│                              │ Tạm tính: 32.000đ           │
│                              │ (khoảng 26.000 – 39.000đ)   │
│                              │ ▸ Chi tiết kỹ thuật         │
│                              │ [ Gửi yêu cầu in ]          │
└──────────────────────────────┴─────────────────────────────┘
```

**Viewer**
- Nhận file STL dạng binary và ASCII, bằng kéo-thả hoặc nút chọn file.
- Hiển thị lưới bàn in theo kích thước trong config, mặc định 180×180, và khung trong suốt thể hiện khối 180mm.
- Xoay và zoom bằng `OrbitControls`. Có nút Reset góc nhìn.
- Mô hình mang màu của loại nhựa đang chọn. Khi **vượt khổ** ở bất kỳ trục nào: mô hình chuyển đỏ và hiện dòng *"Vượt khổ bàn in tiêu chuẩn - Cần chia mảnh hoặc liên hệ tư vấn"*. Lúc này không hiện giá, và nút gửi đổi thành **"Gửi yêu cầu tư vấn"**. Khách vẫn gửi file về Drive như bình thường, chỉ khác là đơn được đánh dấu "Cần tư vấn" (xem 5.5).

**Bảng cấu hình**
- Loại nhựa: PLA, PETG, TPU, ABS. Riêng ABS hiển thị "Liên hệ": chọn ABS sẽ ẩn giá, và nút gửi đổi thành "Gửi yêu cầu tư vấn" (vẫn gửi file về Drive).
- Chiều cao lớp: 0.12 (Mịn), 0.16 (Chi tiết), **0.20 (Tiêu chuẩn, mặc định)**, 0.28 (Nhanh).
- Infill: **15% (mặc định)**, 25%, 50%, 100%.
- Số tường: **2 (mặc định)**, 3, 4.
- Support: checkbox *"Mô hình có phần treo lơ lửng cần Support (+15% nhựa & thời gian)"*. **Tự động tick** khi phát hiện vùng treo (xem 5.2), kèm dòng lý do như "Phát hiện ~X cm² mặt treo". Khách vẫn tự bỏ tick được.
- Số lượng: nút tăng/giảm, mặc định 1, tối đa 50.
- Kết quả gồm: số gram, thời gian in theo dạng `1 giờ 05 phút`, **giá tạm tính**, **khoảng giá ±20%**, và dòng "Giá tạm tính, sai số khoảng ±20%. Giá chính xác sau khi slice."
- Khối "Chi tiết kỹ thuật" thu gọn được, hiện S, V, chiều cao, số lớp, V_shell, V_infill. Khối này để Trung so với Bambu Studio khi hiệu chỉnh.

### 5.2. Tính toán (`src/utils/slicerEstimator.ts`, hàm thuần)

Đầu vào là mảng toạ độ đỉnh (Float32Array, non-indexed) đã đổi trục. Mọi hằng số lấy từ config.

1. **Đổi trục:** STL dùng Z-up. Xoay -90° quanh trục X để thành Y-up của three.js. Dịch mô hình cho tâm XZ nằm ở 0 và `minY = 0`.
2. **Kích thước bao:** Dài = X, Rộng = Z, Cao = Y. So từng trục với khổ in.
3. **Nghi đơn vị inch:** nếu cạnh lớn nhất < 5mm, hiện gợi ý "File có thể tính bằng inch, nhân ×25,4?" kèm nút áp dụng.
4. **Diện tích S:** `Σ ½‖(v2−v1)×(v3−v1)‖`.
5. **Thể tích V:** `|Σ v1·(v2×v3) / 6|`.
6. **Kiểm tra mesh kín:** gộp các đỉnh trùng nhau (sai số 1e-4mm), mỗi cạnh phải thuộc đúng 2 tam giác. Mesh hở thì hiện cảnh báo "Mesh không kín – giá có thể sai", nhưng vẫn tính tiếp.
7. **Vỏ và ruột:**
   - `t_shell = wallLoops × lineWidth(0.42) + shellExtra(0.15)`
   - `V_shell = min(V, S × t_shell)`
   - `V_infill = max(0, V − V_shell) × infill%`
   - `V_part = V_shell + V_infill`
   - Nếu có support: `V_part × supportFactor(1.15)`
8. **Số gram cho cả đơn:** `gram = (V_part × số lượng / 1000) × ρ + purgeGrams × số bàn in`. Lượng nhựa xả là số gram cố định cho mỗi bàn in, thay cho hệ số ×1.05 trong spec gốc. Lý do: cộng 5% làm dư nhiều với vật lớn.
9. **Thời gian:**
   - `số lớp = ceil(Cao / layerHeight)`
   - `t_part = V_part / Q[nhựa][layerHeight] + số lớp × perLayerSec`
   - Nếu có support thì `t_part × 1.15`
   - Tổng: `t = t_part × số lượng + warmupSec(360) × số bàn in`
10. **Số bàn in:**
    - `copiesPerPlate = max(1, floor(180² / ((Dài + 5) × (Rộng + 5))))`
    - `số bàn = ceil(số lượng / copiesPerPlate)`
11. **Phát hiện support:** cộng diện tích các mặt có pháp tuyến `n.y < −cos(45°)` và có `minY > 0.2mm` (tức là không nằm sát bàn in). Nếu tổng ≥ `supportAreaThreshold` thì tự tick support. Ngưỡng mặc định 100mm², chỉnh trong config.

Phần parse file và tính toán chạy trong **Web Worker**. Worker trả về mảng toạ độ (dạng transferable) cho viewer và kết quả hình học. Đổi tuỳ chọn giá thì chỉ tính lại phần 7–10 trên kết quả hình học đã có, không parse lại file.

### 5.3. Giá (`src/utils/pricing.ts`)

- `tiền nhựa = gram × giá/gram của loại nhựa`
- `phút = ceil(t / 60)`
- `phí thời gian = phút > freeMinutes(30) ? floor(phút / blockMinutes(30)) × pricePerBlock(1.850) : 0`
- `tổng = max(minimumOrder(20.000), làm tròn lên bội 1.000 của ((tiền nhựa + phí thời gian) × safetyMargin(1.05)))`
- `safetyMargin` cộng thêm 5% để giá tạm tính hơi nghiêng lên, tránh báo thấp hơn thực tế. Đây là quyết định của Claude, Trung có thể đổi về 1.0.
- Khoảng giá: `[max(minimumOrder, tổng × 0.8), tổng × 1.2]`, làm tròn theo bội 1.000.

### 5.4. Config (Trung tự sửa)

**`src/config/pricingConfig.ts`**
- Máy in: khổ 180×180×180.
- Từng loại nhựa:

  | Nhựa | Mật độ | Giá/gram | Màu hiển thị | Chỉ liên hệ |
  |---|---|---|---|---|
  | PLA | 1.24 | 450đ (tạm) | có | không |
  | PETG | 1.27 | 450đ | có | không |
  | TPU | 1.21 | 450đ (tạm) | có | không |
  | ABS | 1.04 | – | có | **có** |

- Bảng lưu lượng `Q` (mm³/s), giá trị khởi điểm, **sẽ hiệu chỉnh**:

  | | 0.12 | 0.16 | 0.20 | 0.28 |
  |---|---|---|---|---|
  | PLA | 9 | 12 | 15 | 18 |
  | PETG | 7 | 9 | 11 | 13 |
  | TPU | 2.5 | 3 | 3 | 3.5 |

- Hệ số khác: `perLayerSec = 3`, `warmupSec = 360`, `purgeGrams = 0.8`, `lineWidth = 0.42`, `shellExtra = 0.15`, `supportFactor = 1.15`, `supportAreaThreshold = 100`.
- Giá: `freeMinutes = 30`, `blockMinutes = 30`, `pricePerBlock = 1850`, `minimumOrder = 20000`, `rangePercent = 20`, `safetyMargin = 1.05`.
- Giới hạn file: xem trước 100MB, gửi đơn 35MB.

**`src/config/contactConfig.ts`**
- Tên: Nguyễn Đức Trung
- Điện thoại / Zalo: 0913014605. Link Zalo: `https://zalo.me/0913014605`
- Email: minhlaductrung@gmail.com
- Đường dẫn Apps Script (URL web app, công khai được) và Turnstile site key (tuỳ chọn).

### 5.5. Gửi đơn

**Form** (mở sau khi bấm "Gửi yêu cầu in")
- Họ tên (bắt buộc).
- Zalo/SĐT (bắt buộc). Kiểm tra định dạng số Việt Nam: 10 số, bắt đầu bằng 0, hoặc dạng +84.
- Email (tuỳ chọn), Ghi chú (tuỳ chọn).
- Checkbox đồng ý (bắt buộc): *"Tôi đồng ý cho Trung lưu file và liên hệ để báo giá."* Đây là yêu cầu của Nghị định 13/2023.
- Một trường honeypot ẩn để lọc bot. Thêm Cloudflare Turnstile nếu config có site key.

**Loại đơn:** mỗi đơn có trường `orderType`.
- `"quote"`: đơn có giá tạm tính.
- `"consult"`: đơn cần tư vấn. Trường hợp này xảy ra khi khách chọn ABS hoặc mô hình vượt khổ. `estimate` là `null`, kèm `consultReasons`, ví dụ `["ABS"]` hoặc `["Vượt khổ: 210 × 90 × 40 mm"]`. Kích thước bao, S và V vẫn được gửi kèm.

**Mã đơn:** tạo phía trình duyệt theo dạng `P3D-YYMMDD-XXXX`, trong đó XXXX là 4 ký tự ngẫu nhiên A–Z và 2–9.

**Gửi đi:** `POST` tới URL Apps Script với `Content-Type: text/plain` để tránh preflight CORS. Body là JSON gồm mã đơn, thông tin khách, thông số đã chọn, kết quả ước tính, tên file và file dạng base64. Có thanh tiến trình trong lúc gửi.

**Apps Script (`apps-script/Code.gs`)** làm các bước sau:
1. Kiểm tra honeypot, kích thước file và Turnstile token (nếu bật). Secret lưu trong Script Properties.
2. Chặn spam: mỗi số điện thoại tối đa 3 đơn trong 10 phút, đếm bằng `CacheService`.
3. Mở thư mục gốc bằng `DriveApp.getFolderById(DRIVE_FOLDER_ID)`. ID này lưu trong Script Properties, giá trị là `1EIxvJZqVhZ8Y8Zp3JmoKgIIpM-Jrokh5`, thuộc Drive của minhlaductrung@gmail.com. Trong thư mục gốc, tạo thư mục con `<mã đơn>/` rồi lưu file `.stl` và `order.json` vào đó.
4. Gửi tin Telegram gồm mã đơn, tên và SĐT khách, nhựa, thông số, gram, thời gian, giá, link thư mục Drive. Với đơn `consult`, tin bắt đầu bằng "🟠 CẦN TƯ VẤN", ghi lý do và kích thước, không có giá. Script phải chấp nhận `estimate = null`. Bot token và chat id lưu trong Script Properties.
5. Gửi email tóm tắt tới Gmail của Trung bằng `MailApp`.
6. Trả về `{ ok: true, orderCode }`. Nếu lỗi thì trả `{ ok: false, error }`.

File trên Drive để chế độ riêng tư, chỉ Trung mở được.

**Sau khi gửi**
- Thành công: hiện mã đơn, nút "Nhắn Zalo cho Trung", và dòng "Nhắn mã này để chốt đơn".
- Thất bại, hoặc file lớn hơn 35MB: giữ nguyên dữ liệu khách đã điền, hiện lỗi dễ hiểu và đường dự phòng "Gửi file qua Zalo kèm mã đơn".

**Hướng dẫn cài đặt** (`docs/setup-apps-script.md`), viết từng bước:
- Tạo bot bằng @BotFather.
- Lấy chat id.
- Dán script, đặt Script Properties.
- Deploy dạng Web app ("Execute as: Me", "Who has access: Anyone").
- Dán URL vào `contactConfig.ts`.

### 5.6. Trang chứa (V1)

Một trang duy nhất gồm:
- Header: tên và mô tả ngắn dịch vụ.
- Module báo giá.
- Footer: Zalo, điện thoại, email, link GitHub (https://github.com/Traiserdinger).
- Nút Zalo nổi cố định ở góc màn hình.

### 5.7. Công nghệ

Vite + React + TypeScript + Tailwind CSS, `three` bản thường (dùng `STLLoader`, `OrbitControls`, `BufferGeometryUtils`), Vitest. Deploy lên Cloudflare Pages từ GitHub. README hướng dẫn các bước deploy.

## 6. Kiểm thử

- **Unit test (Vitest)**
  - Hình học: khối lập phương 10mm có V = 1000, S = 600. Khối hộp, khối cầu xấp xỉ. Phát hiện mesh hở trên khối lập phương bị bỏ một mặt. Đổi trục. Nghi đơn vị inch.
  - Support: khối chữ T phải bị phát hiện, khối lập phương không bị phát hiện.
  - Giá: 30 phút → 0đ, 31 → 1.850đ, 59 → 1.850đ, 60 → 3.700đ, 120 → 7.400đ. Giá sàn. Làm tròn. Số bàn in.
  - Mã đơn đúng định dạng.
  - Payload đơn `consult` có `estimate = null` và có `consultReasons`.
- **Kiểm thử tay:** file binary, file ASCII, file vượt khổ, file 80MB (giao diện không đơ), gửi đơn thật tới Apps Script (có file trên Drive và có tin Telegram), gửi khi mất mạng (hiện đường dự phòng).

## 7. Hiệu chỉnh hệ số (sau khi xây xong)

Trung slice khoảng 15 file trong Bambu Studio. Mỗi file ghi lại thông số trong khối "Chi tiết kỹ thuật" của web, cùng số gram và thời gian Bambu Studio báo, vào `docs/calibration.md` (sẽ có sẵn bảng mẫu). Sau đó chỉnh `Q`, `perLayerSec` và `shellExtra` cho sai số nằm trong khoảng ±20%. Hiệu chỉnh nhắm cho sai số trung bình **bằng 0** so với Bambu Studio. Phần dư an toàn đã do `safetyMargin` lo.

## 8. Phần để người xây dựng tự quyết

- Bố cục, màu sắc, font chữ, màu của từng loại nhựa.
- Cấu trúc component con và cách tổ chức state.
- Cách vẽ khung bàn in, ánh sáng, vị trí camera mặc định.
- Thông báo lỗi chi tiết, các trạng thái loading.
