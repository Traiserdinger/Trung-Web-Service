import { fileLimits } from '../config/pricingConfig'
import type { Dims } from './meshAnalysis'
import type { Placement } from './plateArrange'
import type { PlateQuote } from './plateState'
import type { OrderType } from './quoteState'
import type { SharedSettings } from './slicerEstimator'

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

export interface OrderMetaFile {
  /** 0 = file bàn in (role 'plate'); 1…n = file nguồn */
  fileNo: number
  role: 'source' | 'plate'
  fileName: string
  fileSize: number
  fileType: 'stl' | '3mf'
  fileDelivery: 'upload' | 'zalo'
}

export interface OrderMetaItem {
  itemNo: number
  fileNo: number
  name: string
  dims: Dims
  volume: number
  surfaceArea: number
  scale: number
  orient: 'auto' | 'file' | 'face'
  infillPercent: number
  wallLoops: number
  support: boolean
  quantity: number
  placements: Placement[] | null
  footprint: [number, number][] | null
}

/** Metadata đơn nhiều file gửi lên Worker (file được tải lên riêng bằng vé từng file). */
export interface OrderMeta {
  orderCode: string
  orderType: OrderType
  consultReasons: string[]
  customer: { name: string; phone: string; email: string; note: string }
  colorId: number
  shared: SharedSettings
  files: OrderMetaFile[]
  items: OrderMetaItem[]
  estimate: {
    grams: number
    timeSec: number
    total: number
    rangeLow: number
    rangeHigh: number
    separateTotal: number | null
  } | null
  turnstileToken: string | null
  honeypot: string
  createdAt: string
}

export function buildOrderMeta(a: {
  orderCode: string
  quote: PlateQuote
  shared: SharedSettings
  colorId: number
  customer: CustomerInfo
  files: OrderMeta['files']
  items: OrderMeta['items']
  turnstileToken: string | null
  now?: Date
}): OrderMeta {
  const { quote } = a
  const estimate =
    quote.orderType === 'quote' && quote.estimate && quote.price
      ? {
          grams: quote.estimate.grams,
          timeSec: quote.estimate.timeSec,
          total: quote.price.total,
          rangeLow: quote.price.rangeLow,
          rangeHigh: quote.price.rangeHigh,
          separateTotal: quote.separateTotal,
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
    colorId: a.colorId,
    shared: a.shared,
    files: a.files,
    items: a.items,
    estimate,
    turnstileToken: a.turnstileToken,
    honeypot: a.customer.honeypot,
    createdAt: (a.now ?? new Date()).toISOString(),
  }
}
