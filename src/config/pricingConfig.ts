// Bảng giá và hệ số ước tính in 3D.
// Trung tự sửa file này để đổi giá / hiệu chỉnh — không cần đụng code giao diện.

export type MaterialId = 'PLA' | 'PETG' | 'TPU' | 'ABS'
export type LayerHeight = 0.12 | 0.16 | 0.2 | 0.28

export interface MaterialConfig {
  id: MaterialId
  label: string
  /** Mật độ nhựa, g/cm³ */
  density: number
  /** Giá bán, VNĐ/gram. null = không báo giá tự động */
  pricePerGram: number | null
  /** Màu hiển thị mô hình (hex) */
  color: string
  /** true = chỉ nhận tư vấn, không hiện giá */
  contactOnly: boolean
  /** Lưu lượng đùn trung bình, mm³/s — HIỆU CHỈNH bằng docs/calibration.md */
  flowRate: Record<LayerHeight, number>
}

export interface BedSize {
  x: number
  y: number
  z: number
}

export const printerConfig: { name: string; bed: BedSize } = {
  name: 'Bambu Lab A1 Mini',
  bed: { x: 180, y: 180, z: 180 },
}

export const materials: Record<MaterialId, MaterialConfig> = {
  PLA: {
    id: 'PLA',
    label: 'PLA',
    density: 1.24,
    pricePerGram: 450, // tạm, chỉnh sau
    color: '#eef0ee',
    contactOnly: false,
    flowRate: { 0.12: 9, 0.16: 12, 0.2: 15, 0.28: 18 },
  },
  PETG: {
    id: 'PETG',
    label: 'PETG',
    density: 1.27,
    pricePerGram: 450,
    color: '#38bdf8',
    contactOnly: false,
    flowRate: { 0.12: 7, 0.16: 9, 0.2: 11, 0.28: 13 },
  },
  TPU: {
    id: 'TPU',
    label: 'TPU',
    density: 1.21,
    pricePerGram: 450, // tạm, chỉnh sau
    color: '#a3e635',
    contactOnly: false,
    flowRate: { 0.12: 2.5, 0.16: 3, 0.2: 3, 0.28: 3.5 },
  },
  ABS: {
    id: 'ABS',
    label: 'ABS',
    density: 1.04,
    pricePerGram: null,
    color: '#fb923c',
    contactOnly: true, // A1 Mini khung hở – không in ABS tự động
    flowRate: { 0.12: 9, 0.16: 12, 0.2: 15, 0.28: 18 },
  },
}

export const slicerConfig = {
  /** Thời gian phụ mỗi lớp (đổi lớp, z-hop, di chuyển), giây */
  perLayerSec: 3,
  /** Làm nóng, cân bàn, lau đầu phun — mỗi bàn in, giây */
  warmupSec: 360,
  /** Nhựa xả đầu vòi — mỗi bàn in, gram */
  purgeGrams: 0.8,
  /** Bề rộng đường đùn, mm (đầu 0.4) */
  lineWidth: 0.42,
  /** Bù lớp đáy/nóc vào độ dày vỏ, mm */
  shellExtra: 0.15,
  /** Support: nhân nhựa và thời gian */
  supportFactor: 1.15,
  /** Tổng diện tích mặt treo (mm²) để tự gợi ý support */
  supportAreaThreshold: 100,
  /** Mặt nghiêng hơn góc này (tính từ phương thẳng đứng xuống) là mặt treo */
  overhangAngleDeg: 45,
  /** Mặt thấp hơn mức này (mm) coi như nằm trên bàn in */
  bedContactMm: 0.2,
  /** Khoảng hở giữa các bản in trên cùng bàn, mm */
  platePaddingMm: 5,
  /** Cạnh lớn nhất nhỏ hơn mức này (mm) thì nghi file tính bằng inch */
  inchSuspectMaxMm: 5,
  /** Món cao hơn mức này (mm) thì khoảng hở rộng hơn khi xếp bàn */
  tallItemMm: 60,
  /** Khoảng hở cho món cao, mm */
  tallPaddingMm: 8,
  /** Mép bàn không xếp, mm */
  bedMarginMm: 3,
  /** Bước góc thử khi xếp bàn, độ */
  arrangeAngleStepDeg: 15,
  /** Ngân sách thời gian xếp bàn, ms */
  arrangeBudgetMs: 1000,
  /** Ngân sách công việc xếp bàn: số vị trí thử tối đa cho mỗi cách xếp (kết quả không phụ thuộc tốc độ máy) */
  arrangeWorkBudget: 1_000_000,
}
export type SlicerConfig = typeof slicerConfig

export const pricingRules = {
  /** Không tính phí thời gian nếu in ≤ số phút này */
  freeMinutes: 30,
  blockMinutes: 30,
  /** VNĐ cho mỗi block 30 phút trọn vẹn (7.400đ / 2 giờ) */
  pricePerBlock: 1850,
  /** Giá tối thiểu mỗi đơn, VNĐ */
  minimumOrder: 20000,
  /** Khoảng giá hiển thị ±% */
  rangePercent: 20,
  /** Hệ số an toàn để giá tạm tính hơi nghiêng lên (1.0 = tắt) */
  safetyMargin: 1.05,
  /** Làm tròn giá theo bội số này, VNĐ */
  roundTo: 1000,
  /** Phí cộng thêm cho mỗi món từ món thứ 2 (sau hệ số an toàn), VNĐ */
  perItemFee: 3500,
  /** Giá tối thiểu khi đơn có từ 2 món, VNĐ */
  combinedMinimumOrder: 30000,
}
export type PricingRules = typeof pricingRules

export const fileLimits = {
  previewMaxBytes: 100 * 1024 * 1024,
  uploadMaxBytes: 35 * 1024 * 1024,
}

export const multiPlate = { maxItems: 10, maxTotalBytes: 35 * 1024 * 1024 }

export const uiOptions: {
  layerHeights: { value: LayerHeight; label: string }[]
  infills: number[]
  wallLoops: number[]
  quantity: { min: number; max: number }
  defaults: {
    material: MaterialId
    layerHeight: LayerHeight
    infillPercent: number
    wallLoops: number
    quantity: number
  }
} = {
  layerHeights: [
    { value: 0.12, label: 'Mịn' },
    { value: 0.16, label: 'Chi tiết' },
    { value: 0.2, label: 'Tiêu chuẩn' },
    { value: 0.28, label: 'Nhanh' },
  ],
  infills: [15, 25, 50, 100],
  wallLoops: [2, 3, 4],
  quantity: { min: 1, max: 50 },
  defaults: { material: 'PETG', layerHeight: 0.2, infillPercent: 15, wallLoops: 2, quantity: 1 },
}
