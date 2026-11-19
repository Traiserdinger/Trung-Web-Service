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

export function isValidVnPhone(p: string): boolean {
  return /^(0|\+84)\d{9}$/.test(p.replace(/[\s.-]/g, ''))
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
  turnstileToken: string | null
  honeypot: string
  createdAt: string
}

export function buildOrderPayload(a: {
  orderCode: string
  quote: QuoteState
  stats: MeshStats
  settings: PrintSettings
  customer: CustomerInfo
  fileName: string
  fileSize: number
  fileBase64: string
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
      phone: a.customer.phone.trim(),
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
    turnstileToken: a.turnstileToken,
    honeypot: a.customer.honeypot,
    createdAt: (a.now ?? new Date()).toISOString(),
  }
}
