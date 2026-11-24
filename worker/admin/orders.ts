import { contactConfig } from '../../src/config/contactConfig.ts'
import { STATUS_LABEL, STATUSES, type OrderStatus } from '../../src/shared/orderStatus.ts'
import { normalizeVnPhone } from '../../src/utils/orderPayload.ts'
import { callAppsScript } from '../shared/appsScript.ts'
import type { Env } from '../shared/env.ts'
import { json, readJson } from '../shared/http.ts'
import {
  changeStatus, deleteOrder, getOrder, listEvents, listOrders, PAGE_SIZE, setEventEmailSent, type OrderRow,
} from '../shared/orderRepo.ts'

const NOTE_MAX = 500

// dd/MM/yyyy HH:mm theo giờ Việt Nam.
function vnTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
  return `${p('day')}/${p('month')}/${p('year')} ${p('hour')}:${p('minute')}`
}

function statusEmail(order: OrderRow, status: OrderStatus, note: string | null, at: string, siteUrl: string) {
  const lines = [
    `Chào ${order.customerName},`,
    '',
    `Đơn ${order.code} của bạn vừa chuyển sang trạng thái: ${STATUS_LABEL[status]}`,
    `Thời điểm: ${vnTime(at)}`,
  ]
  if (note) lines.push(`Ghi chú: ${note}`)
  lines.push('', `Xem tiến độ đơn: ${siteUrl.replace(/\/+$/, '')}/tra-cuu?ma=${order.code}`, '', `Liên hệ Zalo ${contactConfig.phone}`)
  return {
    to: order.customerEmail,
    subject: `[In 3D Trung] Đơn ${order.code}: ${STATUS_LABEL[status]}`,
    text: lines.join('\n'),
  }
}

async function handleStatus(req: Request, env: Env, code: string): Promise<Response> {
  const body = await readJson<{ status?: unknown; note?: unknown }>(req)
  if (!body || !STATUSES.includes(body.status as OrderStatus)) return json({ ok: false, error: 'Trạng thái không hợp lệ' }, 400)
  const status = body.status as OrderStatus
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, NOTE_MAX) : null
  const order = await getOrder(env.DB, code)
  if (!order) return json({ ok: false }, 404)

  // Ghi DB trước, gọi Apps Script sau: mail lỗi không làm mất thay đổi.
  const event = await changeStatus(env.DB, code, status, note, new Date().toISOString())
  if (order.customerEmail) {
    let sent = false
    try {
      sent = await callAppsScript(env, 'notifyStatus', statusEmail(order, status, note, event.createdAt, env.PUBLIC_SITE_URL))
    } catch {
      sent = false
    }
    await setEventEmailSent(env.DB, event.id, sent)
    event.emailSent = sent ? 1 : 0
  }
  return json({ ok: true, event })
}

// Trả null nếu đường dẫn không thuộc nhóm đơn hàng.
export async function handleOrders(req: Request, env: Env, url: URL): Promise<Response | null> {
  const { pathname } = url
  if (pathname === '/api/orders' && req.method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100)
    const status = url.searchParams.get('status') ?? ''
    const page = Math.max(1, Math.floor(Number(url.searchParams.get('page'))) || 1)
    if (status && !STATUSES.includes(status as OrderStatus)) return json({ ok: false, error: 'Trạng thái không hợp lệ' }, 400)
    const r = await listOrders(env.DB, { status, q, phone: q ? normalizeVnPhone(q) : null, page })
    return json({ ok: true, ...r, page, pageSize: PAGE_SIZE })
  }
  const m = /^\/api\/orders\/([^/]+)(\/status)?$/.exec(pathname)
  if (!m) return null
  const code = decodeURIComponent(m[1])
  if (m[2]) return req.method === 'POST' ? handleStatus(req, env, code) : null
  if (req.method === 'GET') {
    const order = await getOrder(env.DB, code)
    if (!order) return json({ ok: false }, 404)
    return json({ ok: true, order, events: await listEvents(env.DB, code) })
  }
  if (req.method === 'DELETE') {
    const b = await readJson<{ confirm?: unknown }>(req)
    if (!b || b.confirm !== code) return json({ ok: false, error: 'Nhập đúng mã đơn để xác nhận xoá' }, 400)
    if (!(await getOrder(env.DB, code))) return json({ ok: false }, 404)
    await deleteOrder(env.DB, code)
    return json({ ok: true })
  }
  return null
}
