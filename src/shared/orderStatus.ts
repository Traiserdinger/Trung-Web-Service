export const STATUSES = ['received', 'paid', 'printing', 'shipping', 'done', 'cancelled'] as const

export type OrderStatus = (typeof STATUSES)[number]

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: 'Đã nhận đơn',
  paid: 'Đã thanh toán',
  printing: 'Đang in 3D',
  shipping: 'Đang giao hàng',
  done: 'Hoàn tất',
  cancelled: 'Đã huỷ',
}

// 5 bước tiến độ, không có `cancelled`.
export const PROGRESS: OrderStatus[] = ['received', 'paid', 'printing', 'shipping', 'done']

// Dữ liệu tra cứu công khai: tuyệt đối không có tên, SĐT, email của khách.
export interface TrackView {
  code: string
  createdAt: string
  material: string
  colorName: string
  colorHex: string
  quantity: number
  estimateTotal: number | null
  status: OrderStatus
  events: { status: OrderStatus; note: string | null; at: string }[]
}
