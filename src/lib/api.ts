import type { TrackView } from '../shared/orderStatus'
import type { OrderMeta } from '../utils/orderPayload'
import { OrderSubmitError } from './submitOrder'

const NETWORK = 'Không gửi được, kiểm tra mạng và thử lại'

export interface CreatedOrder {
  orderCode: string
  uploads: { fileNo: number; ticket: string }[]
  trackUrl: string
  preview: boolean
  fileStatus: 'pending' | 'saved' | 'zalo'
}

/** Bước 1: ghi đơn (không kèm file) qua Worker cùng origin. */
export async function createOrder(meta: OrderMeta, fetchFn: typeof fetch = fetch): Promise<CreatedOrder> {
  let res: {
    ok?: boolean
    error?: string
    orderCode?: string
    uploads?: unknown
    trackUrl?: string
    preview?: boolean
    fileStatus?: string
  }
  try {
    const r = await fetchFn('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meta),
    })
    res = await r.json()
  } catch {
    throw new OrderSubmitError(NETWORK)
  }
  if (!res || !res.ok) throw new OrderSubmitError(res?.error || NETWORK)
  return {
    orderCode: res.orderCode ?? meta.orderCode,
    uploads: Array.isArray(res.uploads)
      ? res.uploads.filter(
          (u): u is { fileNo: number; ticket: string } =>
            !!u && typeof u.fileNo === 'number' && typeof u.ticket === 'string' && u.ticket !== '',
        )
      : [],
    trackUrl: res.trackUrl ?? '',
    preview: res.preview === true,
    fileStatus: res.fileStatus === 'saved' || res.fileStatus === 'zalo' ? res.fileStatus : 'pending',
  }
}

/** Tra cứu đơn công khai: mã đơn + SĐT. */
export async function trackOrder(
  code: string,
  phone: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; order: TrackView } | { ok: false; error: string }> {
  try {
    const r = await fetchFn('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, phone }),
    })
    const res = await r.json()
    if (res?.ok && res.order) return { ok: true, order: res.order as TrackView }
    return { ok: false, error: typeof res?.error === 'string' && res.error ? res.error : NETWORK }
  } catch {
    return { ok: false, error: NETWORK }
  }
}
