const KEY = 'recentOrders'
const MAX = 20

export interface RecentOrder {
  code: string
  createdAt: string
  summary: string
}

const isRecent = (o: unknown): o is RecentOrder =>
  !!o &&
  typeof (o as RecentOrder).code === 'string' &&
  typeof (o as RecentOrder).createdAt === 'string' &&
  typeof (o as RecentOrder).summary === 'string'

/** Đơn gần đây trên máy này, mới nhất trước. Chỉ mã, ngày, tóm tắt — không lưu SĐT/tên/email. */
export function listRecentOrders(storage?: Storage): RecentOrder[] {
  try {
    const raw = (storage ?? localStorage).getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isRecent)
      .map(({ code, createdAt, summary }) => ({ code, createdAt, summary }))
      .slice(0, MAX)
  } catch {
    return []
  }
}

export function saveRecentOrder(o: RecentOrder, storage?: Storage): void {
  try {
    const entry = { code: o.code, createdAt: o.createdAt, summary: o.summary }
    const st = storage ?? localStorage
    const rest = listRecentOrders(st).filter((x) => x.code !== o.code)
    st.setItem(KEY, JSON.stringify([entry, ...rest].slice(0, MAX)))
  } catch {
    /* bộ nhớ đầy hoặc bị chặn: bỏ qua */
  }
}

export function clearRecentOrders(storage?: Storage): void {
  try {
    ;(storage ?? localStorage).removeItem(KEY)
  } catch {
    /* bỏ qua */
  }
}

export function recentSummary(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names[0]} +${names.length - 1} món`
}
