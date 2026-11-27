import { normalizeVnPhone, type OrderMeta, type OrderMetaFile, type OrderMetaItem } from '../../src/utils/orderPayload.ts'
import { callAppsScript } from '../shared/appsScript.ts'
import type { Env } from '../shared/env.ts'
import { makeFileTicket } from '../shared/hmac.ts'
import { json, readJson } from '../shared/http.ts'
import {
  aggregateFileStatus, getColor, getOrder, insertOrder, listOrderFiles, type OrderFileRow, type OrderItemRow,
  type OrderRow,
} from '../shared/orderRepo.ts'
import { formatOwnerMessage } from '../shared/ownerMessage.ts'
import { hit, unhit } from '../shared/rateLimit.ts'

const MAX_FILE_BYTES = 35 * 1024 * 1024
const MAX_ITEMS = 10
const MAX_SOURCES = 10
// Đơn tư vấn toàn file Zalo (quá 10 món) không tải gì lên: nới giới hạn, body 256 KB vẫn chặn trên.
const MAX_CONSULT_ITEMS = 50
const STALE_TAB = 'Trang web vừa cập nhật, vui lòng tải lại trang rồi gửi lại'
const MAX_QUANTITY = 50
const MAX_FOOTPRINT_POINTS = 32
const MAX_BODY_BYTES = 256_000
const CODE_RE = /^P3D-\d{6}-[A-Z2-9]{4}$/
const LIMITS = { name: 120, phone: 40, email: 160, note: 1500, fileName: 160 } as const
const BAD = 'Dữ liệu đơn không hợp lệ'

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
const stripSlash = (u: string) => u.replace(/\/+$/, '')

const fail = (error: string) => json({ ok: false, error })

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function validateFiles(files: unknown, maxSources: number): string | null {
  if (!Array.isArray(files)) return BAD
  const nos = new Set<number>()
  let sources = 0
  let plates = 0
  let uploadSum = 0
  for (const f of files as Partial<OrderMetaFile>[]) {
    if (!isObj(f)) return BAD
    if (!Number.isInteger(f.fileNo) || (f.fileNo as number) < 0 || nos.has(f.fileNo as number)) return BAD
    nos.add(f.fileNo as number)
    if (f.role !== 'source' && f.role !== 'plate') return BAD
    if ((f.role === 'plate') !== (f.fileNo === 0)) return BAD
    if (typeof f.fileName !== 'string' || !f.fileName) return BAD
    if (f.fileType !== 'stl' && f.fileType !== '3mf') return BAD
    if (f.role === 'plate' && f.fileType !== '3mf') return BAD
    if (f.fileDelivery !== 'upload' && f.fileDelivery !== 'zalo') return BAD
    if (!isNum(f.fileSize) || f.fileSize < 0) return BAD
    if (f.role === 'plate') plates++
    else sources++
    if (f.fileDelivery === 'upload') {
      if (!(f.fileSize > 0)) return 'Thiếu file STL'
      if (f.fileSize > MAX_FILE_BYTES) return 'File lớn hơn 35MB, vui lòng gửi qua Zalo'
      if (f.role === 'source') uploadSum += f.fileSize
    }
  }
  if (sources < 1 || sources > maxSources || plates > 1) return BAD
  if (uploadSum > MAX_FILE_BYTES) return 'Tổng file lớn hơn 35MB, vui lòng gửi qua Zalo'
  return null
}

function validateItems(items: unknown, files: OrderMetaFile[], maxItems: number): string | null {
  if (!Array.isArray(items) || items.length < 1 || items.length > maxItems) return BAD
  const sourceNos = new Set(files.filter((f) => f.role === 'source').map((f) => f.fileNo))
  const nos = new Set<number>()
  for (const it of items as Partial<OrderMetaItem>[]) {
    if (!isObj(it)) return BAD
    if (!Number.isInteger(it.itemNo) || (it.itemNo as number) < 1 || nos.has(it.itemNo as number)) return BAD
    nos.add(it.itemNo as number)
    if (!sourceNos.has(it.fileNo as number)) return BAD
    if (typeof it.name !== 'string' || !it.name.trim()) return BAD
    const d = it.dims as Record<string, unknown> | undefined
    if (!isObj(d) || !isNum(d.length) || !isNum(d.width) || !isNum(d.height)) return BAD
    if (!isNum(it.volume) || !isNum(it.surfaceArea)) return BAD
    if (!isNum(it.scale) || !(it.scale > 0)) return BAD
    if (it.orient !== 'auto' && it.orient !== 'file' && it.orient !== 'face') return BAD
    if (!isNum(it.infillPercent) || !isNum(it.wallLoops) || typeof it.support !== 'boolean') return BAD
    const q = it.quantity
    if (!Number.isInteger(q) || (q as number) < 1 || (q as number) > MAX_QUANTITY) return BAD
    if (it.placements !== null) {
      if (!Array.isArray(it.placements) || it.placements.length !== q) return BAD
      for (const pl of it.placements) {
        if (!isObj(pl) || !isNum(pl.x) || !isNum(pl.y) || !isNum(pl.rotDeg)) return BAD
      }
    }
    if (it.footprint !== null) {
      if (!Array.isArray(it.footprint) || it.footprint.length > MAX_FOOTPRINT_POINTS) return BAD
      for (const pt of it.footprint) {
        if (!Array.isArray(pt) || pt.length !== 2 || !isNum(pt[0]) || !isNum(pt[1])) return BAD
      }
    }
  }
  return null
}

function validate(p: Partial<OrderMeta> | null): string | null {
  if (!p || typeof p !== 'object') return BAD
  // Tab mở từ trước khi cập nhật gửi dạng cũ (một file, không có files/items).
  if ('fileName' in p && !('files' in p)) return STALE_TAB
  if (typeof p.orderCode !== 'string' || !CODE_RE.test(p.orderCode)) return 'Mã đơn không hợp lệ'
  if (p.orderType !== 'quote' && p.orderType !== 'consult') return BAD
  const c = p.customer
  if (!c || typeof c.name !== 'string' || !c.name.trim() || typeof c.phone !== 'string' || !c.phone.trim()) {
    return 'Thiếu tên hoặc SĐT'
  }
  if (typeof c.email === 'string' && c.email.trim() && !EMAIL_RE.test(c.email.trim())) return 'Email không hợp lệ'
  if (!Number.isInteger(p.colorId)) return BAD
  const sh = p.shared as Record<string, unknown> | undefined
  if (!isObj(sh) || typeof sh.material !== 'string' || !isNum(sh.layerHeight)) return BAD
  const many =
    p.orderType === 'consult' &&
    Array.isArray(p.files) &&
    (p.files as Partial<OrderMetaFile>[]).every((f) => isObj(f) && (f.role === 'plate' || f.fileDelivery === 'zalo'))
  const filesErr = validateFiles(p.files, many ? MAX_CONSULT_ITEMS : MAX_SOURCES)
  if (filesErr) return filesErr
  return validateItems(p.items, p.files as OrderMetaFile[], many ? MAX_CONSULT_ITEMS : MAX_ITEMS)
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
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  })
  if (!res.ok) console.error('telegram', res.status)
}


const clamp = (v: unknown, n: number) => String(v ?? '').slice(0, n)

// Nguồn trước, file bàn in (fileNo 0) cuối: thứ tự trình duyệt tải lên.
const uploadOrder = <T extends { fileNo: number }>(a: T, b: T) => (a.fileNo || Infinity) - (b.fileNo || Infinity)

export async function handleCreateOrder(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const p = await readJson<Partial<OrderMeta>>(req, MAX_BODY_BYTES)
  if (!p || typeof p !== 'object') return fail(BAD)

  // Honeypot: bot điền trường ẩn → trả ok giả, không ghi gì.
  if (p.honeypot) return json({ ok: true, orderCode: p.orderCode, uploads: [] })

  const invalid = validate(p)
  if (invalid) return fail(invalid)
  const m = p as OrderMeta

  const customer = {
    name: clamp(m.customer.name, LIMITS.name),
    phone: clamp(m.customer.phone, LIMITS.phone),
    email: clamp(m.customer.email, LIMITS.email),
    note: clamp(m.customer.note, LIMITS.note),
  }
  const phone = normalizeVnPhone(customer.phone)
  if (!phone) return fail('Số Zalo/SĐT không hợp lệ')
  customer.phone = phone

  const code = m.orderCode
  const shared = { material: m.shared.material, layerHeight: m.shared.layerHeight }
  const files = m.files.map((f) => ({ ...f, fileName: clamp(f.fileName, LIMITS.fileName) }))
  const items = m.items.map((i) => ({ ...i, name: clamp(i.name, LIMITS.fileName) }))
  const sources = files.filter((f) => f.role === 'source').sort(uploadOrder)
  const fingerprint = JSON.stringify([
    shared,
    customer,
    m.colorId,
    sources.map((f) => [f.fileName, f.fileSize, f.fileType, f.fileDelivery, f.role]),
    items.map((i) => [i.itemNo, i.fileNo, i.name, i.scale, i.orient, i.infillPercent, i.wallLoops, i.support, i.quantity]),
  ])
  const trackUrl = `${stripSlash(env.PUBLIC_SITE_URL)}/tra-cuu?ma=${code}`
  const preview = !env.APPS_SCRIPT_URL
  // Một vé cho mỗi file còn phải tải lên (đã chọn Zalo hoặc đã lưu thì không).
  const ticketsFor = async (fs: Pick<OrderFileRow, 'fileNo' | 'fileSize' | 'fileDelivery' | 'fileStatus'>[]) => {
    if (preview) return []
    const out: { fileNo: number; ticket: string }[] = []
    for (const f of fs.filter((x) => x.fileDelivery === 'upload' && x.fileStatus === 'pending').sort(uploadOrder)) {
      try {
        out.push({ fileNo: f.fileNo, ticket: await makeFileTicket(env.SHARED_SECRET, code, f.fileNo, f.fileSize) })
      } catch (err) {
        console.error('makeFileTicket', err)
      }
    }
    return out
  }

  // Gửi lại cùng mã: y hệt → ok (kèm vé mới cho file còn chờ); khác → báo rõ.
  const existing = await getOrder(env.DB, code)
  if (existing) {
    if (existing.fingerprint === fingerprint) {
      const uploads = await ticketsFor(await listOrderFiles(env.DB, code))
      return json({ ok: true, orderCode: code, uploads, trackUrl, preview, fileStatus: existing.fileStatus })
    }
    return fail(
      `Mã đơn ${code} đã được gửi với nội dung khác. Tải lại trang để tạo đơn mới, hoặc nhắn Zalo để sửa đơn.`,
    )
  }

  const color = await getColor(env.DB, m.colorId)
  if (!color || !color.active) return fail('Màu đã chọn không còn, vui lòng chọn lại')

  if (env.TURNSTILE_SECRET && !(await verifyTurnstile(env.TURNSTILE_SECRET, m.turnstileToken))) {
    return fail('Xác minh chống spam thất bại')
  }

  const rateKey = 'order:' + phone
  if (!(await hit(env.DB, rateKey, 3, 600))) return fail('Bạn đã gửi quá nhiều đơn, vui lòng thử lại sau 10 phút')

  const now = new Date().toISOString()
  const fileRows: OrderFileRow[] = files.map((f) => ({
    orderCode: code, fileNo: f.fileNo, role: f.role, fileName: f.fileName, fileSize: f.fileSize, fileType: f.fileType,
    fileDelivery: f.fileDelivery, fileStatus: f.fileDelivery === 'zalo' ? 'zalo' : 'pending', driveUrl: null,
  }))
  const itemRows: OrderItemRow[] = items.map((i) => ({
    orderCode: code, itemNo: i.itemNo, fileNo: i.fileNo, name: i.name,
    dims: JSON.stringify({ length: i.dims.length, width: i.dims.width, height: i.dims.height }),
    volume: i.volume, surfaceArea: i.surfaceArea, scale: i.scale, orient: i.orient, infillPercent: i.infillPercent,
    wallLoops: i.wallLoops, support: i.support ? 1 : 0, quantity: i.quantity,
    placements: i.placements ? JSON.stringify(i.placements.map((q) => ({ x: q.x, y: q.y, rotDeg: q.rotDeg }))) : null,
    footprint: i.footprint ? JSON.stringify(i.footprint) : null,
  }))
  const first = itemRows[0]
  const e = m.estimate
  const estimate =
    isObj(e) && isNum(e.total)
      ? {
          grams: e.grams, timeSec: e.timeSec, total: e.total, rangeLow: e.rangeLow, rangeHigh: e.rangeHigh,
          separateTotal: isNum(e.separateTotal) ? e.separateTotal : null,
        }
      : null
  const fileStatus = aggregateFileStatus(fileRows)
  const row: OrderRow = {
    code,
    createdAt: now,
    orderType: m.orderType,
    consultReasons: JSON.stringify(Array.isArray(m.consultReasons) ? m.consultReasons.map((r) => clamp(r, 300)) : []),
    customerName: customer.name,
    customerPhone: phone,
    customerEmail: customer.email || null,
    customerNote: customer.note || null,
    // Cột cũ: thông số chung + thông số món 1; kích thước/thể tích/diện tích/hệ số của món 1.
    settings: JSON.stringify({
      ...shared,
      infillPercent: first.infillPercent, wallLoops: first.wallLoops, support: !!first.support, quantity: first.quantity,
    }),
    dims: first.dims,
    surfaceArea: first.surfaceArea,
    volume: first.volume,
    scale: first.scale,
    estimate: estimate ? JSON.stringify(estimate) : null,
    colorId: color.id,
    colorName: color.name,
    colorHex: color.hex,
    fileName: sources[0].fileName + (sources.length > 1 ? ` +${sources.length - 1}` : ''),
    fileSize: sources.reduce((n, f) => n + f.fileSize, 0),
    fileDelivery: sources.some((f) => f.fileDelivery === 'zalo') ? 'zalo' : 'upload',
    fileStatus,
    driveUrl: null,
    fingerprint,
    status: 'received',
    statusUpdatedAt: now,
  }
  try {
    await insertOrder(env.DB, row, fileRows, itemRows)
  } catch (err) {
    console.error('insertOrder', err)
    try {
      await unhit(env.DB, rateKey)
    } catch (e2) {
      console.error('unhit', e2)
    }
    return fail('Máy chủ gặp lỗi, vui lòng gửi qua Zalo kèm mã đơn')
  }

  const adminUrl = env.ADMIN_SITE_URL ? `${stripSlash(env.ADMIN_SITE_URL)}/#/orders/${code}` : '(chưa cấu hình)'
  const text = formatOwnerMessage(row, adminUrl, itemRows, fileRows)
  // Bản preview (APPS_SCRIPT_URL rỗng): không báo chủ shop qua Telegram hay email.
  if (!preview)
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

  const uploads = await ticketsFor(fileRows)
  return json({ ok: true, orderCode: code, uploads, trackUrl, preview, fileStatus })
}
