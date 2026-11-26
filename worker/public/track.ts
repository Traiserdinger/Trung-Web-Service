import { normalizeVnPhone } from '../../src/utils/orderPayload.ts'
import type { OrderStatus, TrackView } from '../../src/shared/orderStatus.ts'
import type { Env } from '../shared/env.ts'
import { json, readJson } from '../shared/http.ts'
import { getOrder, listEvents, listOrderItems } from '../shared/orderRepo.ts'
import { hit } from '../shared/rateLimit.ts'

const NOT_FOUND = 'Không tìm thấy đơn. Kiểm tra lại mã đơn và SĐT.'
const notFound = () => json({ ok: false, error: NOT_FOUND })

function parse(s: string | null): Record<string, unknown> {
  try {
    const v = s ? JSON.parse(s) : null
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export async function handleTrack(req: Request, env: Env): Promise<Response> {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown'
  if (!(await hit(env.DB, 'track:' + ip, 10, 600))) {
    return json({ ok: false, error: 'Bạn tra cứu quá nhiều lần, thử lại sau 10 phút' }, 429)
  }

  const body = await readJson<{ code?: unknown; phone?: unknown }>(req)
  if (!body || typeof body.code !== 'string' || typeof body.phone !== 'string') return notFound()
  const phone = normalizeVnPhone(body.phone)
  if (!phone) return notFound()

  // Mã sai và SĐT sai cho cùng một phản hồi, không lộ đơn có tồn tại hay không.
  const order = await getOrder(env.DB, body.code.trim().toUpperCase())
  if (!order || order.customerPhone !== phone) return notFound()

  const settings = parse(order.settings)
  const estimate = parse(order.estimate)
  const events = await listEvents(env.DB, order.code)
  const items = (await listOrderItems(env.DB, order.code)).map((i) => ({ name: i.name, quantity: i.quantity }))
  const view: TrackView = {
    code: order.code,
    createdAt: order.createdAt,
    material: typeof settings.material === 'string' ? settings.material : '',
    colorName: order.colorName ?? '',
    colorHex: order.colorHex ?? '',
    quantity: items.length ? items.reduce((n, i) => n + i.quantity, 0) : typeof settings.quantity === 'number' ? settings.quantity : 1,
    items,
    estimateTotal: typeof estimate.total === 'number' ? estimate.total : null,
    status: order.status as OrderStatus,
    events: events.map((e) => ({ status: e.status as OrderStatus, note: e.note, at: e.createdAt })),
  }
  return json({ ok: true, order: view })
}
