import { fileLimits } from '../config/pricingConfig'
import type { Dims, MeshStats } from './meshAnalysis'
import type { OrderType, QuoteState } from './quoteState'
import type { PrintSettings } from './slicerEstimator'

export interface CustomerInfo {
  name: string
  phone: string
  email: string
  note: string
  consent: boolean
  /** Trường ẩn chống bot — người thật để trống */
  honeypot: string
}

export type CustomerErrors = Partial<Record<'name' | 'phone' | 'email' | 'consent', string>>

/**
 * Chuẩn hoá SĐT Việt Nam về dạng 0xxxxxxxxx. Nhận các cách viết hay gặp:
 * "0913 014 605", "+84 913.014.605", "(+84) 913…", "+84 (0) 913…", "+84 0913…", "84913014605".
 * Trả null nếu không phải số di động/cố định 10 chữ số.
 */
export function normalizeVnPhone(p: string): string | null {
  let s = p.replace(/[\s.\-()]/g, '')
  if (s.startsWith('+84')) s = s.slice(3)
  else if (s.startsWith('84') && (s.length === 11 || s.length === 12)) s = s.slice(2)
  else if (!s.startsWith('0')) return null
  if (!s.startsWith('0')) s = '0' + s
  return /^0\d{9}$/.test(s) ? s : null
}

export function isValidVnPhone(p: string): boolean {
  return normalizeVnPhone(p) !== null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateCustomer(c: CustomerInfo): CustomerErrors {
  const e: CustomerErrors = {}
  if (!c.name.trim()) e.name = 'Vui lòng nhập họ tên'
  if (!isValidVnPhone(c.phone)) e.phone = 'Số Zalo/SĐT không hợp lệ'
  if (c.email.trim() && !EMAIL_RE.test(c.email.trim())) e.email = 'Email không hợp lệ'
  if (!c.consent) e.consent = 'Vui lòng đồng ý để Trung liên hệ báo giá'
  return e
}

export function canUpload(fileSize: number): boolean {
  return fileSize <= fileLimits.uploadMaxBytes
}

export interface OrderPayload {
  orderCode: string
  orderType: OrderType
  consultReasons: string[]
  customer: { name: string; phone: string; email: string; note: string }
  settings: PrintSettings
  dims: Dims
  surfaceArea: number
  volume: number
  estimate: { grams: number; timeSec: number; total: number; rangeLow: number; rangeHigh: number } | null
  fileName: string
  fileSize: number
  fileBase64: string
  /** 'zalo' khi file quá lớn để gửi qua web: đơn vẫn được ghi, khách gửi file qua Zalo */
  fileDelivery: 'upload' | 'zalo'
  /** Hệ số đã nhân vào file khi báo giá (25.4 nếu khách đổi inch → mm) */
  scale: number
  turnstileToken: string | null
  honeypot: string
  createdAt: string
}

/** Phần metadata của đơn gửi lên Worker (file được tải lên riêng bằng vé). */
export type OrderMeta = Omit<OrderPayload, 'fileBase64'> & { colorId: number }

export function buildOrderPayload(a: {
  orderCode: string
  quote: QuoteState
  stats: MeshStats
  settings: PrintSettings
  customer: CustomerInfo
  fileName: string
  fileSize: number
  fileBase64: string
  fileDelivery?: 'upload' | 'zalo'
  scale?: number
  turnstileToken: string | null
  now?: Date
}): OrderPayload {
  const { quote } = a
  const estimate =
    quote.orderType === 'quote' && quote.estimate && quote.price
      ? {
          grams: quote.estimate.grams,
          timeSec: quote.estimate.timeSec,
          total: quote.price.total,
          rangeLow: quote.price.rangeLow,
          rangeHigh: quote.price.rangeHigh,
        }
      : null
  return {
    orderCode: a.orderCode,
    orderType: quote.orderType,
    consultReasons: quote.consultReasons,
    customer: {
      name: a.customer.name.trim(),
      phone: normalizeVnPhone(a.customer.phone) ?? a.customer.phone.trim(),
      email: a.customer.email.trim(),
      note: a.customer.note.trim(),
    },
    settings: a.settings,
    dims: a.stats.dims,
    surfaceArea: a.stats.surfaceArea,
    volume: a.stats.volume,
    estimate,
    fileName: a.fileName,
    fileSize: a.fileSize,
    fileBase64: a.fileBase64,
    fileDelivery: a.fileDelivery ?? 'upload',
    scale: a.scale ?? 1,
    turnstileToken: a.turnstileToken,
    honeypot: a.customer.honeypot,
    createdAt: (a.now ?? new Date()).toISOString(),
  }
}
