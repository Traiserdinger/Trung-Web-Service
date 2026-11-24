import type { OrderMeta } from '../utils/orderPayload'
import { OrderSubmitError } from './submitOrder'

const NETWORK = 'Không gửi được, kiểm tra mạng và thử lại'

export interface CreatedOrder {
  orderCode: string
  uploadTicket: string | null
  trackUrl: string
}

/** Bước 1: ghi đơn (không kèm file) qua Worker cùng origin. */
export async function createOrder(meta: OrderMeta, fetchFn: typeof fetch = fetch): Promise<CreatedOrder> {
  let res: { ok?: boolean; error?: string; orderCode?: string; uploadTicket?: string | null; trackUrl?: string }
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
    uploadTicket: res.uploadTicket ?? null,
    trackUrl: res.trackUrl ?? '',
  }
}
