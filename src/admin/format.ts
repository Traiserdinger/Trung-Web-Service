// Định dạng ngày giờ theo giờ Việt Nam và đọc các cột JSON của đơn.

const TZ = 'Asia/Ho_Chi_Minh'

const longFmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
})

const parts = (f: Intl.DateTimeFormat, d: Date) => Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))

/** dd/MM/yyyy HH:mm */
export function vnDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = parts(longFmt, d)
  return `${p.day}/${p.month}/${p.year} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}

const shortFmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
})

/** dd/MM HH:mm */
export function vnShort(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = parts(shortFmt, d)
  return `${p.day}/${p.month} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}

/** "3 giờ trước", "2 ngày trước" */
export function ago(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (min < 60) return `${Math.max(1, min)} phút trước`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} giờ trước`
  return `${Math.floor(h / 24)} ngày trước`
}

export function todayLabel(now = new Date()): string {
  const s = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(now)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function parseObj(s: string | null): Record<string, unknown> | null {
  if (!s) return null
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Số kiểu Việt: 1.234,5 */
export const vnNum = (n: number, digits = 1) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(n)

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${vnNum(bytes / 1024)} KB`
  return `${vnNum(bytes / 1024 / 1024)} MB`
}
