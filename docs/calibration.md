# Hiệu chỉnh hệ số ước tính

Web ước tính số gram và thời gian in bằng công thức (xem spec, mục 5.2). Các hệ số ban đầu chỉ là con số khởi điểm. Làm theo hướng dẫn dưới đây để giá tạm tính sát với Bambu Studio, mục tiêu là lệch không quá ±20%.

## Cách làm

1. Chọn khoảng **15 file** đa dạng: vỏ hộp mỏng, khối đặc, chi tiết cao và mảnh, chi tiết nhỏ. Mỗi loại nhựa thật sự hay in nên có vài file.
2. Với mỗi file:
   - Thả vào web, chọn đúng thông số định in, mở **"Chi tiết kỹ thuật"** rồi ghi S, V, chiều cao và số lớp. Ghi thêm số gram và thời gian web báo.
   - Mở Bambu Studio, dùng **đúng** thông số đó (profile A1 Mini 0.4, cùng nhựa, cùng chiều cao lớp, infill, số tường), bấm **Slice** rồi ghi số gram và thời gian.
3. Điền kết quả vào bảng dưới, rồi tính `lệch % = (web − Bambu) / Bambu × 100`.

| File | Nhựa | Lớp | Infill | Tường | S (mm²) | V (mm³) | Cao | Số lớp | Gram web | Gram Bambu | Lệch g % | TG web | TG Bambu | Lệch TG % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | | |
| | | | | | | | | | | | | | | |
| | | | | | | | | | | | | | | |

## Chỉnh ở đâu (`src/config/pricingConfig.ts`)

| Hiện tượng | Chỉnh |
|---|---|
| Gram lệch đều với mọi file | `shellExtra` (vỏ dày hay mỏng hơn thực tế) |
| Gram của hộp mỏng lệch, khối đặc thì đúng | `lineWidth` / `shellExtra` |
| Thời gian lệch đều ở một loại nhựa và một chiều cao lớp | `flowRate[nhựa][lớp]`. Web nhanh hơn thực tế thì **giảm** Q |
| Chi tiết cao và mảnh bị báo nhanh hơn thực tế | **Tăng** `perLayerSec` |
| Chi tiết rất nhỏ (< 15 phút) lệch nhiều | `warmupSec` |

Hiệu chỉnh để **sai số trung bình bằng 0** so với Bambu Studio. Phần dư an toàn đã có `pricingRules.safetyMargin` (mặc định 1.05, tức +5%) lo, nên không cần cộng dư vào các hệ số.

Sau khi chỉnh, chạy `npm test`. Một số test cố định con số theo hệ số ban đầu sẽ báo lỗi, đó là điều bình thường. Cập nhật con số mong đợi trong test cho khớp với hệ số mới, rồi commit.
