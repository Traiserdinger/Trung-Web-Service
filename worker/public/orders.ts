import { normalizeVnPhone, type OrderMeta } from '../../src/utils/orderPayload.ts'
import { callAppsScript } from '../shared/appsScript.ts'
import type { Env } from '../shared/env.ts'
import { makeTicket } from '../shared/hmac.ts'
import { json, readJson } from '../shared/http.ts'
import { getColor, getOrder, insertOrder, type OrderRow } from '../shared/orderRepo.ts'
import { formatOwnerMessage } from '../shared/ownerMessage.ts'
import { hit, unhit } from '../shared/rateLimit.ts'

const MAX_FILE_BYTES = 35 * 1024 * 1024
const CODE_RE = /^P3D-\d{6}-[A-Z2-9]{4}$/
const LIMITS = { name: 120, phone: 40, email: 160, note: 1500 } as const

const fail = (error: string) => json({ ok: false, error })

function validate(p: Partial<OrderMeta> | null): string | null {
  if (!p || typeof p !== 'object') return 'Dữ liệu đơn không hợp lệ'
  if (typeof p.orderCode !== 'string' || !CODE_RE.test(p.orderCode)) return 'Mã đơn không hợp lệ'
  if (p.orderType !== 'quote' && p.orderType !== 'consult') return 'Dữ liệu đơn không hợp lệ'
  const c = p.customer
  if (!c || typeof c.name !== 'string' || !c.name.trim() || typeof c.phone !== 'string' || !c.phone.trim()) {
    return 'Thiếu tên hoặc SĐT'
  }
  if (!Number.isInteger(p.colorId)) return 'Dữ liệu đơn không hợp lệ'
  if (p.fileDelivery !== 'zalo') {
    if (typeof p.fileName !== 'string' || !p.fileName) return 'Thiếu file STL'
    if (typeof p.fileSize !== 'number' || !(p.fileSize > 0)) return 'Thiếu file STL'
    if (p.fileSize > MAX_FILE_BYTES) return 'File lớn hơn 35MB, vui lòng gửi qua Zalo'
  }
  return null
}

async function verifyTurnstile(secret: string, token: string | null): Promise<boolean> {
  if (!token) return false
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
    })
    return ((await res.json()) as { success?: unknown }).success === true
  } catch {
    return false
  }
}

async function sendTelegram(env: Env, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  })
}

export async function handleCreateOrder(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const p = await readJson<Partial<OrderMeta>>(req)
  if (!p || typeof p !== 'object') return fail('Dữ liệu đơn không hợp lệ')

  // Honeypot: bot điền trường ẩn → trả ok giả, không ghi gì.
  if (p.honeypot) return json({ ok: true, orderCode: p.orderCode, uploadTicket: null })

  const invalid = validate(p)
  if (invalid) return fail(invalid)
  const m = p as OrderMeta

  const customer = {
    name: String(m.customer.name).slice(0, LIMITS.name),
    phone: String(m.customer.phone).slice(0, LIMITS.phone),
    email: String(m.customer.email ?? '').slice(0, LIMITS.email),
    note: String(m.customer.note ?? '').slice(0, LIMITS.note),
  }
  const fileName = String(m.fileName || 'model.stl').slice(0, 160)
  const phone = normalizeVnPhone(customer.phone)
  if (!phone) return fail('Số Zalo/SĐT không hợp lệ')
  customer.phone = phone

  const color = await getColor(env.DB, m.colorId)
  if (!color || !color.active) return fail('Màu đã chọn không còn, vui lòng chọn lại')

  const code = m.orderCode
  const scale = m.scale || 1
  const fileDelivery = m.fileDelivery === 'zalo' ? 'zalo' : 'upload'
  const fingerprint = JSON.stringify([m.settings, customer, fileName, m.fileSize, scale, fileDelivery, m.colorId])
  const trackUrl = `${env.PUBLIC_SITE_URL}/tra-cuu?ma=${code}`
  const ticketFor = (size: number) =>
    env.APPS_SCRIPT_URL ? makeTicket(env.SHARED_SECRET, code, size) : Promise.resolve(null)

  // Gửi lại cùng mã: y hệt → ok (kèm vé mới nếu file còn chờ); khác → báo rõ.
  const existing = await getOrder(env.DB, code)
  if (existing) {
    if (existing.fingerprint === fingerprint) {
      const uploadTicket = existing.fileStatus === 'pending' ? await ticketFor(existing.fileSize ?? 0) : null
      return json({ ok: true, orderCode: code, uploadTicket, trackUrl })
    }
    return fail(
      `Mã đơn ${code} đã được gửi với nội dung khác. Tải lại trang để tạo đơn mới, hoặc nhắn Zalo để sửa đơn.`,
    )
  }

  if (env.TURNSTILE_SECRET && !(await verifyTurnstile(env.TURNSTILE_SECRET, m.turnstileToken))) {
    return fail('Xác minh chống spam thất bại')
  }

  const rateKey = 'order:' + phone
  if (!(await hit(env.DB, rateKey, 3, 600))) return fail('Bạn đã gửi quá nhiều đơn, vui lòng thử lại sau 10 phút')

  const now = new Date().toISOString()
  const row: OrderRow = {
    code,
    createdAt: now,
    orderType: m.orderType,
    consultReasons: JSON.stringify(Array.isArray(m.consultReasons) ? m.consultReasons : []),
    customerName: customer.name,
    customerPhone: phone,
    customerEmail: customer.email || null,
    customerNote: customer.note || null,
    settings: JSON.stringify(m.settings ?? null),
    dims: JSON.stringify(m.dims ?? null),
    surfaceArea: m.surfaceArea ?? null,
    volume: m.volume ?? null,
    scale,
    estimate: m.estimate ? JSON.stringify(m.estimate) : null,
    colorId: color.id,
    colorName: color.name,
    colorHex: color.hex,
    fileName,
    fileSize: m.fileSize ?? null,
    fileDelivery,
    fileStatus: fileDelivery === 'zalo' ? 'zalo' : 'pending',
    driveUrl: null,
    fingerprint,
    status: 'received',
    statusUpdatedAt: now,
  }
  try {
    await insertOrder(env.DB, row)
  } catch (err) {
    console.error('insertOrder', err)
    try {
      await unhit(env.DB, rateKey)
    } catch (e) {
      console.error('unhit', e)
    }
    return fail('Máy chủ gặp lỗi, vui lòng gửi qua Zalo kèm mã đơn')
  }

  const adminUrl = env.ADMIN_SITE_URL ? `${env.ADMIN_SITE_URL}/#/orders/${code}` : '(chưa cấu hình)'
  const text = formatOwnerMessage(row, adminUrl)
  ctx.waitUntil(
    (async () => {
      try {
        await sendTelegram(env, text)
      } catch (err) {
        console.error('telegram', err)
      }
      try {
        await callAppsScript(env, 'notifyOwner', { subject: '[Đơn in 3D] ' + code, text })
      } catch (err) {
        console.error('notifyOwner', err)
      }
    })(),
  )

  const uploadTicket = fileDelivery === 'upload' ? await ticketFor(m.fileSize) : null
  return json({ ok: true, orderCode: code, uploadTicket, trackUrl })
}
