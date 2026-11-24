import type { OrderStatus } from '../shared/orderStatus.ts'

export const SESSION_EXPIRED = 'Phiên đăng nhập hết hạn, tải lại trang'

export interface OrderListItem {
  code: string
  createdAt: string
  orderType: string
  customerName: string
  customerPhone: string
  colorName: string | null
  colorHex: string | null
  fileStatus: string | null
  status: OrderStatus
  statusUpdatedAt: string
}

export interface OrderRow extends Omit<OrderListItem, 'orderType'> {
  orderType: string
  consultReasons: string | null
  customerEmail: string | null
  customerNote: string | null
  settings: string | null
  dims: string | null
  surfaceArea: number | null
  volume: number | null
  scale: number | null
  estimate: string | null
  colorId: number | null
  fileName: string | null
  fileSize: number | null
  fileDelivery: string | null
  driveUrl: string | null
  fingerprint: string | null
}

export interface OrderEvent {
  id: number
  orderCode: string
  status: OrderStatus
  note: string | null
  createdAt: string
  emailSent: number | null
}

export interface AdminColor {
  id: number
  name: string
  hex: string
  sort: number
  active: number
}

export interface OrdersPage {
  orders: OrderListItem[]
  total: number
  page: number
  pageSize: number
}

async function call<T>(path: string, init?: { method: string; body?: unknown }): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: init?.method ?? 'GET',
      credentials: 'same-origin',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    // Phiên Access hết hạn: trình duyệt bị chuyển sang trang đăng nhập khác origin nên fetch ném lỗi.
    throw new Error(SESSION_EXPIRED)
  }
  if (res.status === 401 || res.redirected || res.type === 'opaqueredirect') throw new Error(SESSION_EXPIRED)
  let data: { ok?: boolean; error?: string } & Record<string, unknown> = {}
  try {
    data = await res.json()
  } catch {
    // phản hồi không phải JSON: rơi xuống thông báo chung
  }
  if (!res.ok || data.ok === false) throw new Error(data.error || `Lỗi ${res.status}`)
  return data as T
}

export async function listOrders(f: { status: string; q: string; page: number }): Promise<OrdersPage> {
  const p = new URLSearchParams()
  if (f.status) p.set('status', f.status)
  if (f.q) p.set('q', f.q)
  p.set('page', String(f.page))
  return call<OrdersPage>(`/api/orders?${p}`)
}

export const getOrder = (code: string) =>
  call<{ order: OrderRow; events: OrderEvent[] }>(`/api/orders/${encodeURIComponent(code)}`)

export const setStatus = (code: string, status: OrderStatus, note?: string) =>
  call<{ event: OrderEvent }>(`/api/orders/${encodeURIComponent(code)}/status`, {
    method: 'POST',
    body: { status, note },
  })

export const deleteOrder = (code: string) =>
  call<{ ok: true }>(`/api/orders/${encodeURIComponent(code)}`, { method: 'DELETE', body: { confirm: code } })

export const listColors = () => call<{ colors: AdminColor[] }>('/api/colors')

export const createColor = (name: string, hex: string) =>
  call<{ color: AdminColor }>('/api/colors', { method: 'POST', body: { name, hex } })

export const patchColor = (id: number, patch: Partial<Pick<AdminColor, 'name' | 'hex' | 'sort'>> & { active?: boolean }) =>
  call<{ color: AdminColor }>(`/api/colors/${id}`, { method: 'PATCH', body: patch })
