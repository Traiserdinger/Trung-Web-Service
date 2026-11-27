# Gộp nhiều file vào một bàn in, nhận file 3MF, và khách quên mã đơn — thiết kế

Ngày: 2026-11-26 · Chủ web: Nguyễn Đức Trung

Ghi chú: "quyết định của Claude" = Trung chưa nói, Claude chọn và Trung có thể sửa.

## 1. Mục đích và lý do

Hiện tại mỗi đơn chỉ có **một file STL**. Khách hay có vài món nhỏ không liên quan nhau và muốn **gộp lại cho đỡ tiền** hoặc **gửi một lượt cho xong**. Trung muốn:

1. Khách thả **nhiều file** (STL hoặc 3MF) vào **một đơn, một mã, một bàn in**.
2. Web **tự xếp** các món lên bàn cho **tiết kiệm chỗ nhất và dễ in nhất**.
3. Nhiều quá thì bảo khách **gửi qua Zalo** thay vì web tạo thêm bàn in.
4. Trung **nhìn vào đơn là biết cần in gì**.
5. Khách thấy mình **lời** khi gộp, trong khi tiền lời của Trung vẫn cao.
6. Khách **quên mã đơn** vẫn tìm lại được (§9, phần riêng).

## 2. Mục tiêu

- Một đơn = một bàn in = **một loại nhựa, một độ dày lớp, một màu** (Trung không có AMS Lite).
- Mỗi món **tự chỉnh** độ đặc (infill), số lớp vỏ, support, số lượng, hướng in và đổi inch→mm.
- Nhận `.stl` và `.3mf`. Mỗi vật thể trong 3MF là một món.
- Xếp theo **hình dáng thật** của món (không theo hình chữ nhật bao), có luật dễ in cho máy bàn chạy (A1 Mini).
- Giá gộp hiện kèm so sánh "In riêng từng món → Gộp chung bàn, bạn tiết kiệm …".
- Trang admin có **phiếu in**: hình bàn in nhìn từ trên, bảng thông số từng món, **file bàn in `.3mf` do web tạo** với các món đã nằm đúng chỗ.

## 3. Không làm (non-goals)

- Nhiều bàn in trong một đơn gộp nhiều món (quá một bàn → Zalo).
- Mỗi món một màu / một loại nhựa trên cùng bàn.
- Đọc thông số in, màu hay cách xếp có sẵn trong file 3MF (bỏ qua, chỉ lấy hình).
- Đọc STEP, OBJ và định dạng khác.
- Ghi thông số độ đặc/vỏ của từng món vào file bàn in theo định dạng riêng của Bambu (Trung chỉnh theo bảng). *(Quyết định của Claude; có thể làm sau.)*
- Tài khoản khách, tra cứu chỉ bằng SĐT.

## 4. Điều không được xảy ra (anti-goals)

- Web báo "vừa một bàn" mà thực tế các món **chồng lên nhau hoặc lòi ra ngoài bàn**. Sai thì phải sai theo hướng an toàn (báo không vừa → Zalo).
- Đơn cũ (một file) bị hỏng hoặc hiện sai sau khi đổi database.
- Khách bấm gửi rồi mất đơn vì một file tải lỗi. File lỗi chỉ đánh dấu file đó "gửi qua Zalo".
- Trang báo giá bị đứng khi đọc/xếp file lớn (mọi việc nặng chạy trong Web Worker).
- File 3MF độc hại (zip bomb) làm treo trình duyệt.
- Người lạ dò được đơn người khác (giữ nguyên luật tra cứu mã + SĐT).

## 5. Ràng buộc

- Giữ kiến trúc của spec `2026-11-24-orders-db-tracking-colors-design.md`: Worker + D1 giữ đơn; trình duyệt tải file thẳng lên Apps Script bằng vé HMAC; Apps Script lưu Drive (mỗi mã đơn một thư mục, `saveToDrive_` đã hỗ trợ nhiều file) rồi báo lại Worker qua `/api/internal/*`.
- Worker miễn phí ~10 ms CPU/request: Worker **không** đọc file, không tính xếp bàn. Mọi việc nặng ở trình duyệt.
- Migration D1 **chỉ thêm**, không xoá/đổi tên cột (quy ước trong `0001_init.sql`).
- Bàn in `printerConfig.bed` = 180×180×180 mm. Khoảng hở giữa món `slicerConfig.platePaddingMm` = 5 mm.
- Mã đơn giữ định dạng `P3D-YYMMDD-XXXX`.
- `three` đã có trong dự án. `3MFLoader` của three cần `DOMParser` (không có trong Web Worker) và đọc kém 3MF kiểu Bambu, nên **không dùng**. Thêm thư viện `fflate` để giải nén.

## 6. Các phương án đã cân nhắc

### 6.1 Cách xếp món lên bàn

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Hình chữ nhật bao + MaxRects | Nhanh, dễ kiểm thử | Món hình L/tròn tốn chỗ, hay báo "không vừa" oan |
| **B. Hình dáng thật trên lưới 1 mm, thử xoay** ✅ | Xếp khít gần bằng Bambu Studio | Code nhiều hơn, phải chú ý tốc độ và kiểm thử |

**Trung chọn B** ("xếp làm sao để tối ưu không gian và khả năng in nhất").

### 6.2 Lưu đơn nhiều món

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Bảng mới cho file và món** ✅ | Biết rõ file nào tải lỗi, món nào thông số gì; admin hiển thị dễ | Phải viết migration và chuyển đơn cũ |
| B. Một ô JSON trong `orders` | Ít sửa | Khó theo dõi trạng thái từng file, khó tìm |

**Trung đồng ý A.**

### 6.3 Tải file lên Drive

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Mỗi file một lượt, mỗi file một vé** ✅ | Dùng lại cơ chế đang chạy; file lỗi không kéo đổ cả đơn | Nhiều lượt gọi hơn |
| B. Nén tất cả thành một zip | Một lượt | Một lỗi hỏng cả đơn; Trung phải giải nén |

**Trung chọn A.**

### 6.4 Tra cứu khi quên mã (§9)

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Trình duyệt nhớ đơn đã gửi trên máy đó** ✅ | An toàn, không đổi luật tra cứu | Đổi máy / xoá dữ liệu trình duyệt thì mất |
| B. Tra chỉ bằng SĐT | Tiện | Biết SĐT là xem được đơn người khác (vi phạm anti-goal của spec trước) |

*(Quyết định của Claude, Trung không phản đối.)*

## 7. Thiết kế — nhiều món trên một bàn

### 7.1 Khái niệm

- **File**: thứ khách thả vào (`.stl` hoặc `.3mf`). Một file STL = một món. Một file 3MF = một hoặc nhiều món.
- **Món** (item): một vật thể cần in, có thông số riêng và số lượng. "10 món" tính theo **số món**, không theo số file và không theo số lượng.
- **Bản** (copy): một món số lượng 3 là 3 bản trên bàn.
- **File bàn in**: file `.3mf` do web tạo lúc gửi đơn, chứa mọi bản đã xếp đúng chỗ.

### 7.2 Thông số chung và riêng

| Chung cả bàn (cả đơn) | Riêng từng món |
|---|---|
| Nhựa, độ dày lớp, màu | Độ đặc, số lớp vỏ, support (tự gợi ý theo mặt treo như hiện nay), số lượng, hướng in (Tự xoay / Chọn mặt đáy / Như file), đổi inch→mm |

### 7.3 Giao diện trang báo giá (quyết định của Claude về bố cục)

```
┌ Sân khấu 3D: bàn in, mọi bản đã xếp, món đang chọn được viền sáng ┐
│                                     [+ Thêm file] [Xếp lại]        │
└────────────────────────────────────────────────────────────────────┘
Danh sách món
 ● 1 moc-khoa.stl        40×30×5   SL [2]  Đặc 15%  Vỏ 2   [×]
   2 hop.3mf · Nắp        60×60×12  SL [1]  Đặc 25%  Vỏ 3   [×]
   3 hop.3mf · Thân       60×60×40  …
Thông số chung: Nhựa · Lớp · Màu
Phiếu tạm tính:  In riêng từng món 75.000đ → Gộp chung bàn 52.000đ
                 Bạn tiết kiệm 23.000đ
```

- Khách thả/chọn **nhiều file một lúc** hoặc thêm dần bằng "+ Thêm file". DropZone nhận `.stl` và `.3mf`.
- Bấm một món trong danh sách (hoặc trên hình) để chọn. Các nút hướng in, đổi inch, và bảng độ đặc/vỏ/support/số lượng áp dụng cho món đang chọn. Nhựa/lớp/màu là chung.
- Thêm, xoá, đổi số lượng, đổi hướng in → **tự xếp lại**. Nút "Xếp lại" để khách chủ động.
- Đơn **chỉ một món** trông và hoạt động như hiện nay (không có danh sách, không có dòng "tiết kiệm").
- Thông báo (inch, mesh không kín, vượt khổ) hiện theo từng món, ghi rõ tên món.

### 7.4 Đọc file 3MF

- Chạy trong `stlWorker` (đổi tên cho đúng nghĩa là tuỳ builder). Giải nén bằng `fflate`, đọc XML bằng bộ quét chuỗi tự viết (không dùng `DOMParser`).
- Đọc `3D/3dmodel.model` và các file `.model` con mà nó tham chiếu (kiểu Bambu: `<component p:path="/3D/Objects/…model" objectid=…>`). Áp đúng ma trận `transform` của `component` và của `<build><item>`. Đổi đơn vị theo thuộc tính `unit` (micron, millimeter, centimeter, inch, foot, meter).
- **Mỗi `<build><item>` = một món.** Tên món = thuộc tính `name` của object, không có thì "`<tên file>` #n". 3MF nhiều plate kiểu Bambu: gom mọi build item.
- Bỏ qua màu, vật liệu, thông số, vị trí xếp trong file.
- Chống zip bomb: giới hạn tổng dung lượng giải nén (đề xuất 300 MB) và tổng số tam giác (đề xuất 3 triệu); vượt → báo lỗi thân thiện "File 3MF quá nặng, gửi qua Zalo". *(Quyết định của Claude về con số.)*
- Sau khi đọc, mỗi món đi qua cùng đường với STL: đổi trục Z-up→Y-up, tự xoay hướng in (nếu chọn), `analyzeMesh`.
- **File 3MF gốc được tải nguyên** lên Drive (một file, kể cả khi nó có nhiều món).

### 7.5 Xếp bàn (chạy trong worker)

Đầu vào: danh sách bản (mỗi món × số lượng), mỗi bản có hình chiếu đáy và chiều cao. Đầu ra: vị trí (x, y) và góc xoay quanh trục đứng cho từng bản, hoặc "không vừa".

1. **Hình chiếu**: chiếu mọi tam giác của món xuống mặt bàn, tô lên lưới 1 mm (ô bị chạm = bị chiếm). Lấp kín lỗ bên trong không bắt buộc *(builder chọn)*. Nới rộng hình chiếu một nửa khoảng hở (xem bước 3) để hai bản cách nhau đủ hở.
2. **Thứ tự**: xếp bản to trước (theo diện tích hình chiếu, cùng diện tích thì cao trước).
3. **Luật dễ in** (A1 Mini là máy bàn chạy theo trục Y, món cao dễ rung):
   - Khoảng hở giữa bản: 5 mm (`platePaddingMm`). Bản cao hơn 60 mm: khoảng hở quanh nó 8 mm.
   - Chừa mép bàn 3 mm.
   - Bản cao được ưu tiên vị trí gần giữa bàn; bản thấp xếp quanh.
   - Các con số trên đặt trong `slicerConfig` để Trung chỉnh. *(Quyết định của Claude về con số.)*
4. **Tìm chỗ**: với mỗi bản, thử góc xoay 0°–345° bước 15° và mọi vị trí trống; chấm điểm theo độ gọn (khung bao của cả nhóm nhỏ nhất) cộng với khoảng cách tới giữa bàn có trọng số theo chiều cao. Chọn điểm tốt nhất. Cách chấm điểm và tối ưu tốc độ (bitmask theo hàng, thử vị trí thô rồi tinh) để builder chọn, miễn đạt mục tiêu tốc độ dưới đây.
5. Không đặt được một bản nào → **không vừa**.

Bản thân việc xoay quanh trục đứng không đổi hướng in, nên không đổi giá.

Yêu cầu bắt buộc, có kiểm thử tự động:
- Không hai bản nào chồng nhau (tính cả khoảng hở), không bản nào ra ngoài vùng bàn trừ mép.
- Kết quả **giống nhau** với cùng đầu vào (không ngẫu nhiên), để giá và hình không nhảy khi khách bấm lại.
- 10 món, tổng tới ~30 bản, xếp xong dưới ~1 giây trên máy tầm trung. Nếu quá giờ, dừng tìm kiếm và dùng kết quả tốt nhất đã có (vẫn phải hợp lệ). *(Quyết định của Claude.)*

### 7.6 Khi nào chuyển sang Zalo

Áp dụng khi đơn có **từ 2 món trở lên**. Bất kỳ điều nào dưới đây đúng → đơn thành **đơn tư vấn** (`orderType: 'consult'`, dùng cơ chế `consultReasons` hiện có), không tải file, `fileDelivery = 'zalo'`, màn hình hiện "Gửi file qua Zalo kèm mã này":

- Không xếp vừa một bàn. Lý do: "Không vừa một bàn in".
- Quá 10 món (`multiPlate.maxItems = 10` trong config). Lý do: "Quá 10 món".
- Tổng dung lượng các file gốc > 35 MB. Lý do: "Tổng file lớn hơn 35 MB".
- Các lý do hiện có (nhựa chỉ tư vấn như ABS, một món vượt khổ bàn) áp dụng như cũ.

Đơn **một món** vẫn được nhận khi số lượng nhiều cần nhiều bàn. Trình tự: chạy thuật toán xếp mới trước; nếu mọi bản vừa một bàn thì **tính giá theo 1 bàn** và tạo file bàn in. Nếu không vừa thì dùng cách đếm bàn theo lưới của `estimatePrint` như hôm nay và không tạo file bàn in. *(Quyết định của Claude: giá khớp với cách Trung thực sự in. Đơn một món số lượng nhiều có thể rẻ hơn hôm nay một chút, vì bớt một lần làm nóng.)*

Khách đang ở trạng thái "không vừa" vẫn thấy danh sách và có thể bớt món/số lượng để quay về báo giá.

### 7.7 Tính giá gộp

Dùng lại công thức thể tích/thời gian của `estimatePrint` cho từng món, rồi gộp:

- `gram = Σ(số lượng × thể tích món × mật độ) + nhựa xả × 1`
- `thời gian = Σ(số lượng × thời gian một bản) + làm nóng × 1` (thời gian một bản như hôm nay: thể tích/lưu lượng + số lớp × `perLayerSec`, nhân support nếu có)
- `phí nhựa = gram × giá/gram`, `phí thời gian = computeTimeFee(phút)` như hiện nay
- `tổng = max(giá tối thiểu gộp, làm tròn lên((phí nhựa + phí thời gian) × safetyMargin + phí mỗi món × (số món − 1)))`

Config mới trong `pricingRules`:
- `perItemFee: 3500`: tính cho mỗi món từ món thứ hai, theo **số món chứ không theo số bản** *(quyết định của Claude)*. **Không** hiện thành dòng riêng cho khách. Cộng sau `safetyMargin` để đúng 3.500đ.
- `combinedMinimumOrder: 30000`: giá tối thiểu khi có từ 2 món. *(Trung đồng ý có giá tối thiểu gộp; con số 30.000đ là của Claude.)*
- Khoảng giá ±20% như hiện nay.

**"In riêng từng món"** = tổng giá báo cho mỗi món nếu đặt riêng (đúng công thức một món hôm nay, mỗi món có giá tối thiểu 20.000đ, làm nóng/xả riêng). Chỉ hiện dòng "Bạn tiết kiệm X" khi X > 0. Phần tiết kiệm là chi phí Trung cũng tiết kiệm thật (một lần làm nóng, xả, canh máy). Phí mỗi món bù cho phần giá tối thiểu mất đi.

### 7.8 Dữ liệu (migration `0003`)

```
order_files
  order_code TEXT, file_no INTEGER         -- PK (order_code, file_no), file_no từ 1
  role TEXT        -- 'source' (file khách) | 'plate' (file bàn in web tạo)
  file_name TEXT, file_size INTEGER, file_type TEXT ('stl'|'3mf')
  file_delivery TEXT ('upload'|'zalo'), file_status TEXT ('pending'|'saved'|'zalo'|'failed'), drive_url TEXT

order_items
  order_code TEXT, item_no INTEGER          -- PK (order_code, item_no), item_no từ 1 = số trên phiếu in
  file_no INTEGER                           -- thuộc file nguồn nào
  name TEXT                                 -- tên file, hoặc tên vật thể trong 3MF
  dims TEXT (JSON), volume REAL, surface_area REAL, scale REAL
  orient TEXT ('auto'|'file'|'face')
  infill_percent INTEGER, wall_loops INTEGER, support INTEGER, quantity INTEGER
  placements TEXT  -- JSON [{x, y, rotDeg}] mỗi bản, toạ độ mm trên bàn; NULL nếu không xếp
  footprint TEXT   -- JSON đa giác đơn giản hoá (bao lồi) của hình chiếu, để admin vẽ SVG
```

- `orders` giữ nguyên các cột cũ. `settings` vẫn lưu phần chung (nhựa, lớp) và có thể giữ bản sao thông số món 1 để code cũ không vỡ; `estimate` lưu giá gộp kèm `separateTotal` (giá in riêng).
- Migration chuyển **mọi đơn cũ** thành 1 file + 1 món bằng `INSERT … SELECT` từ cột cũ của `orders`. Sau migration, code mới chỉ đọc từ `order_files`/`order_items`.
- Xoá đơn ở admin phải xoá cả hai bảng mới.
- `fingerprint` tính trên toàn bộ nội dung đơn mới (mọi món, mọi file).

### 7.9 Luồng gửi đơn

1. Trình duyệt `POST /api/orders` với thông tin khách, thông số chung, danh sách file (tên, cỡ, loại, cách gửi) và danh sách món (thông số, kích thước, vị trí xếp, hình chiếu). Không gửi nội dung file.
2. Worker kiểm tra như hiện nay, thêm: số món ≤ 10, mỗi file ≤ 35 MB, tổng file nguồn ≤ 35 MB (khi không phải đơn Zalo), số liệu là số hữu hạn, cắt độ dài chuỗi. Worker **không** tự kiểm tra lại cách xếp (tin trình duyệt; Trung vẫn cắt lớp lại). Ghi `orders` + `order_files` + `order_items` trong một batch D1.
3. Worker trả **một vé cho mỗi file** cần tải: HMAC(`orderCode|file_no|fileSize|hết hạn`). Vé cũ dạng `orderCode|fileSize` bỏ.
4. Trình duyệt tải **lần lượt** từng file nguồn, rồi file bàn in, lên Apps Script (`orderCode`, `fileNo`, `uploadTicket`, `fileName`, `fileBase64`). Apps Script kiểm vé, lưu vào thư mục của mã đơn, báo Worker `fileSaved` kèm `fileNo` và `driveUrl` → Worker cập nhật đúng dòng `order_files`.
5. File nào lỗi: đánh dấu `failed`, các file khác vẫn tải tiếp. Màn hình xong đơn liệt kê file chưa gửi được và bảo gửi qua Zalo kèm mã. File bàn in lỗi thì **không** báo khách (đó là việc của Trung), admin chỉ thấy "không có file bàn in".
6. Tin báo Trung (Telegram + Gmail) liệt kê các món: số, tên, số lượng, độ đặc/vỏ.

### 7.10 File bàn in `.3mf`

- Tạo trong worker lúc khách bấm gửi, từ hình đã đọc sẵn trong bộ nhớ: mỗi món một `<object>` (tên `"<số> - <tên món>"`), mỗi bản một `<build><item>` với ma trận đặt đúng vị trí và góc xoay đã xếp. Toạ độ mm, trục Z hướng lên, gốc ở góc bàn 180×180 để Bambu Studio mở ra là đúng chỗ. Nén bằng `fflate`.
- Chỉ tạo khi mọi bản vừa một bàn. Nếu file bàn in > 35 MB thì bỏ qua, không tạo *(quyết định của Claude)*. File bàn in **không** tính vào giới hạn 35 MB tổng của file khách.
- Phải mở được bằng Bambu Studio (kiểm tra tay một lần trước khi phát hành) và đọc lại được bằng chính bộ đọc 3MF của web (kiểm thử tự động: đọc lại ra đúng số món và đúng kích thước).

### 7.11 Admin: phiếu in

Trong trang chi tiết đơn (`src/admin/OrderDetail.tsx`):

```
BÀN IN · PETG · lớp 0.2 · Đen · ~3g40p · 48g          [Tải file bàn in .3mf]
┌──────────────┐  #  Món            SL  Đặc  Vỏ  Support  Kích thước   File
│ ①   ②②  ③   │  1  moc-khoa.stl   1   15%  2   –        40×30×5     [Drive]
│   ④     ①   │  2  Nắp (hop.3mf)  2   25%  3   Có       60×60×12    [Drive]
└──────────────┘
```

- Hình bàn: SVG vẽ từ `footprint` + `placements`, mỗi bản ghi số món.
- Bảng: mọi món; dòng file lỗi/Zalo ghi rõ.
- Đơn cũ (đã chuyển thành 1 món, không có `placements`) hiện bảng một dòng, không có hình bàn.
- Danh sách đơn có thể hiện "3 món" cạnh tên đơn *(tuỳ builder)*.

### 7.12 Trang tra cứu

Hiện thêm danh sách tên món và số lượng. Không hiện thông số in.

## 8. Kiểm thử

- Đọc 3MF: file một vật thể, nhiều vật thể, kiểu Bambu có `p:path` và ma trận, đơn vị inch, file hỏng, zip bomb.
- Xếp bàn: không chồng, không lòi ra, xác định (cùng kết quả), báo "không vừa" khi không vừa, món hình L lồng được vào nhau tốt hơn hình chữ nhật bao.
- Giá: một món số lượng 1 giống hệt hôm nay; một món nhiều bản theo §7.6; gộp đúng công thức §7.7; dòng tiết kiệm chỉ hiện khi > 0.
- Worker: đơn nhiều file, vé từng file, `fileSaved` theo `fileNo`, migration chuyển đơn cũ, xoá đơn xoá cả bảng con.
- Apps Script: vé mới, nhiều file cùng thư mục.
- Kiểm tra tay: file bàn in mở đúng trong Bambu Studio.

## 9. Khách quên mã đơn

### 9.1 Hiện trạng

- Ô **Zalo/SĐT là bắt buộc**, nên đơn nào cũng có SĐT. Chỉ email là tuỳ chọn.
- Admin đã tìm đơn được theo SĐT (`/api/admin/orders?q=…`). Tin Telegram/Gmail báo Trung cũng có SĐT.
- Tra cứu cần **mã + SĐT** và giữ như vậy.

### 9.2 Thay đổi

1. **Trình duyệt nhớ đơn**: gửi đơn xong, lưu vào `localStorage` danh sách tối đa 20 đơn gần nhất: `{ mã, ngày, tên món đầu + số món }`. **Không lưu SĐT, tên, email** (máy dùng chung). *(Quyết định của Claude.)*
2. Trang `/tra-cuu` hiện khối "Đơn đã gửi từ máy này" nếu danh sách không rỗng. Bấm một đơn → điền sẵn mã, khách chỉ nhập SĐT. Có nút xoá danh sách.
3. Màn hình gửi đơn xong: thêm nút **"Sao chép mã"** và một dòng "Chụp màn hình hoặc lưu mã này để tra cứu sau".
4. Khách đổi máy hoặc xoá dữ liệu trình duyệt → nhắn Zalo cho Trung. Trung tìm theo SĐT trong admin. Thêm mục **"Khách quên mã đơn"** vào `README.md` (hoặc `docs/`) ghi lại quy trình này cho Trung.

## 10. Quyết định thêm sau khi soát (của Claude)

Các điểm này bổ sung và, nếu khác, thay thế §7.8–§7.9:

1. **Không lưu trạng thái `failed`.** Worker không biết khi trình duyệt tải lỗi hay khách đóng tab. `file_status` chỉ có `pending | saved | zalo`. Admin hiện file `pending` quá 30 phút là "Chưa nhận file". Màn hình xong đơn của khách tự biết file nào lỗi (từ kết quả tải trong trình duyệt). Không thêm route công khai mới.
2. **`orders.file_status` vẫn được ghi** như một giá trị tổng hợp, để `/api/stats`, Overview, Attention, OrderLine, OrderFacts chạy tiếp không phải viết lại: `zalo` nếu đơn gửi qua Zalo; `pending` nếu còn **file nguồn** nào chưa `saved`; còn lại `saved`. **File bàn in không tính vào đây**; thiếu file bàn in chỉ hiện trong trang chi tiết đơn. Worker cập nhật giá trị này mỗi lần `fileSaved`.
3. **Gửi lại cùng mã:** `fingerprint` tính trên thông tin khách, thông số chung, danh sách file (tên, cỡ, loại, cách gửi) và thông số từng món (không gồm `placements`, `footprint`, `dims` dạng số thực). Khớp → trả vé mới cho **mọi file chưa `saved`**, kể cả file bàn in.
4. **Drive:** lưu mỗi file với tên có tiền tố số file, ví dụ `01-moc-khoa.stl`, `00-ban-in.3mf` (file bàn in), để hai file trùng tên không đè nhau. Apps Script trả về **URL của từng file**; `order_files.drive_url` là URL file. Trang admin có thêm link thư mục (lấy từ URL file đầu tiên hoặc giữ `orders.drive_url` là URL thư mục).
5. **Đổi định dạng vé:** Apps Script nhận **cả hai** dạng vé (`code|fileSize` cũ và `code|fileNo|fileSize` mới) trong một bản phát hành, để deploy Worker và Apps Script lệch nhau vài phút không làm hỏng đơn. Bản sau bỏ dạng cũ.

## 11. Để lại cho builder

- Chia nhỏ component (danh sách món, bảng thông số món, phiếu tạm tính gộp) và tên file mới.
- Chi tiết tối ưu tốc độ và cách chấm điểm vị trí của thuật toán xếp, miễn đạt §7.5.
- Có lấp lỗ bên trong hình chiếu hay không.
- Cách hiển thị bàn in nhiều món trong `StlViewer` (gộp một mesh hay nhiều mesh), cách viền sáng món đang chọn.
- Thứ tự các bước làm (gợi ý: giá gộp + xếp bàn → nhiều STL → 3MF → database/tải lên → admin → §9).
