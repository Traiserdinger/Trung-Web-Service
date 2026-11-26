// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrderMeta } from '../../src/utils/orderPayload.ts'
import { signEnvelope, verifyFileTicket } from '../shared/hmac.ts'
import { getOrder, listEvents, listOrderFiles, listOrderItems } from '../shared/orderRepo.ts'
import { fakeCtx, makeEnv } from '../test/env.ts'
import { handleInternalFile } from './internal.ts'
import { handleCreateOrder } from './orders.ts'

const item = (itemNo: number, fileNo: number, over: Partial<OrderMeta['items'][number]> = {}): OrderMeta['items'][number] => ({
  itemNo, fileNo, name: `m${itemNo}.stl`, dims: { length: 10, width: 20, height: 30 }, volume: 50, surfaceArea: 100,
  scale: 1, orient: 'auto', infillPercent: 15, wallLoops: 2, support: false, quantity: 1, placements: null,
  footprint: null, ...over,
})
const src = (fileNo: number, over: Partial<OrderMeta['files'][number]> = {}): OrderMeta['files'][number] => ({
  fileNo, role: 'source', fileName: `m${fileNo}.stl`, fileSize: 1000 * fileNo, fileType: 'stl', fileDelivery: 'upload', ...over,
})
const plate = (over: Partial<OrderMeta['files'][number]> = {}) =>
  src(0, { role: 'plate', fileName: 'ban-in.3mf', fileType: '3mf', fileSize: 5000, ...over })

function meta(over: Partial<OrderMeta> = {}): OrderMeta {
  return {
    orderCode: 'P3D-250101-ABCD',
    orderType: 'quote',
    consultReasons: [],
    customer: { name: 'An', phone: '0913 014 605', email: '', note: '' },
    colorId: 3,
    shared: { material: 'PLA', layerHeight: 0.2 },
    files: [src(1)],
    items: [item(1, 1)],
    estimate: { grams: 10, timeSec: 600, total: 100000, rangeLow: 90000, rangeHigh: 110000, separateTotal: null },
    turnstileToken: null,
    honeypot: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...over,
  }
}
const two = (over: Partial<OrderMeta> = {}) =>
  meta({ files: [src(1), src(2), plate()], items: [item(1, 1, { quantity: 2 }), item(2, 2)], ...over })
type Upload = { fileNo: number; ticket: string }
const uploads = (b: Record<string, unknown>) => b.uploads as Upload[]

const req = (body: unknown) =>
  new Request('https://site/api/orders', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })

let calls: { url: string; body: string }[]
let telegramFails = false

beforeEach(() => {
  calls = []
  telegramFails = false
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') })
    if (String(url).includes('telegram') && telegramFails) throw new Error('net')
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  })
})
afterEach(() => vi.unstubAllGlobals())

const full = { APPS_SCRIPT_URL: 'https://script', TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c', ADMIN_SITE_URL: 'https://admin' }
const tg = () => calls.filter((c) => c.url.includes('telegram'))
const aps = () => calls.filter((c) => c.url === 'https://script')

async function saveFile(env: ReturnType<typeof makeEnv>, fileNo: number | undefined) {
  const data = { orderCode: 'P3D-250101-ABCD', driveUrl: 'https://drive/folder', fileUrl: `https://drive/f${fileNo}`, fileNo }
  return handleInternalFile(
    new Request('https://site/api/internal/file', { method: 'POST', body: JSON.stringify(await signEnvelope('s', 'fileSaved', data)) }),
    env,
  )
}

async function post(env: ReturnType<typeof makeEnv>, m: unknown) {
  const ctx = fakeCtx()
  const res = await handleCreateOrder(req(m), env, ctx)
  await ctx.flush()
  return { res, body: (await res.json()) as Record<string, unknown> }
}

describe('POST /api/orders', () => {
  it('tạo đơn hợp lệ: ghi orders + 1 event received, màu Đỏ, vé verify được', async () => {
    const env = makeEnv(full)
    const { res, body } = await post(env, meta())
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.trackUrl).toBe('https://site/tra-cuu?ma=P3D-250101-ABCD')
    expect(uploads(body)).toHaveLength(1)
    expect(uploads(body)[0].fileNo).toBe(1)
    expect(await verifyFileTicket('s', uploads(body)[0].ticket, 'P3D-250101-ABCD', 1, 1000)).toBe(true)
    const o = await getOrder(env.DB, 'P3D-250101-ABCD')
    expect(o?.colorName).toBe('Đỏ')
    expect(o?.status).toBe('received')
    expect(o?.fileStatus).toBe('pending')
    const ev = await listEvents(env.DB, 'P3D-250101-ABCD')
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ status: 'received', note: null, emailSent: null })
    expect(tg()).toHaveLength(1)
    expect(aps()).toHaveLength(1)
    expect(JSON.parse(tg()[0].body).text).toContain('Admin: https://admin/#/orders/P3D-250101-ABCD')
  })

  it('SĐT được chuẩn hoá khi lưu', async () => {
    const env = makeEnv(full)
    await post(env, meta({ customer: { name: 'An', phone: '+84 913.014.605', email: '', note: '' } }))
    expect((await getOrder(env.DB, 'P3D-250101-ABCD'))?.customerPhone).toBe('0913014605')
  })

  it('SĐT sai và ADMIN_SITE_URL rỗng', async () => {
    const env = makeEnv(full)
    const { body } = await post(env, meta({ customer: { name: 'An', phone: '123', email: '', note: '' } }))
    expect(body).toEqual({ ok: false, error: 'Số Zalo/SĐT không hợp lệ' })
    const env2 = makeEnv({ ...full, ADMIN_SITE_URL: undefined })
    await post(env2, meta())
    expect(JSON.parse(tg()[0].body).text).toContain('Admin: (chưa cấu hình)')
  })

  it('màu đang ẩn hoặc không có', async () => {
    const env = makeEnv(full)
    await env.DB.prepare('UPDATE colors SET active=0 WHERE id=3').run()
    const { body } = await post(env, meta())
    expect(body).toEqual({ ok: false, error: 'Màu đã chọn không còn, vui lòng chọn lại' })
    expect((await post(env, meta({ colorId: 99 }))).body.ok).toBe(false)
  })

  it('validate: mã, thiếu tên, loại đơn, colorId, file quá lớn', async () => {
    const env = makeEnv(full)
    expect((await post(env, meta({ orderCode: 'bad' }))).body.error).toBe('Mã đơn không hợp lệ')
    expect((await post(env, meta({ customer: { name: '', phone: '0913014605', email: '', note: '' } }))).body.error).toBe('Thiếu tên hoặc SĐT')
    expect((await post(env, meta({ orderType: 'x' as never }))).body.ok).toBe(false)
    expect((await post(env, meta({ colorId: 1.5 }))).body.ok).toBe(false)
    expect((await post(env, meta({ files: [src(1, { fileSize: 36 * 1024 * 1024 })] }))).body.error).toBe('File lớn hơn 35MB, vui lòng gửi qua Zalo')
    expect((await post(env, 'không phải json')).body.error).toBe('Dữ liệu đơn không hợp lệ')
  })

  it('gửi lại y hệt khi pending: ok, vé mới, không báo thêm, không tính rate limit', async () => {
    const env = makeEnv(full)
    await post(env, meta())
    const before = tg().length
    for (let i = 0; i < 5; i++) {
      const { body } = await post(env, meta())
      expect(body.ok).toBe(true)
      expect(uploads(body)).toHaveLength(1)
    }
    expect(tg()).toHaveLength(before)
    expect(aps()).toHaveLength(1)
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM rate_hits').first<{ n: number }>()
    expect(n?.n).toBe(1)
  })

  it('gửi lại y hệt sau khi màu bị ẩn: vẫn ok với vé mới', async () => {
    const env = makeEnv(full)
    await post(env, meta())
    await env.DB.prepare('UPDATE colors SET active=0 WHERE id=3').run()
    const { body } = await post(env, meta())
    expect(body.ok).toBe(true)
    expect(uploads(body)).toHaveLength(1)
  })

  it('settings có giá trị không phải số bị từ chối', async () => {
    const env = makeEnv(full)
    const items = [item(1, 1, { quantity: '1\nDrive: fake' as unknown as number })]
    expect((await post(env, meta({ items }))).body).toEqual({ ok: false, error: 'Dữ liệu đơn không hợp lệ' })
  })

  it('gửi lại cùng mã khác nội dung: lỗi', async () => {
    const env = makeEnv(full)
    await post(env, meta())
    const { body } = await post(env, meta({ items: [item(1, 1, { name: 'b.stl' })] }))
    expect(body.ok).toBe(false)
    expect(body.error).toContain('đã được gửi với nội dung khác')
  })

  it('đơn thứ 4 trong 10 phút cùng SĐT: quá nhiều đơn', async () => {
    const env = makeEnv(full)
    for (const c of ['P3D-250101-AAAA', 'P3D-250101-BBBB', 'P3D-250101-CCCC'])
      expect((await post(env, meta({ orderCode: c }))).body.ok).toBe(true)
    const { body } = await post(env, meta({ orderCode: 'P3D-250101-DDDD' }))
    expect(body).toEqual({ ok: false, error: 'Bạn đã gửi quá nhiều đơn, vui lòng thử lại sau 10 phút' })
  })

  it('honeypot: ok, không ghi gì', async () => {
    const env = makeEnv(full)
    const { body } = await post(env, meta({ honeypot: 'bot' }))
    expect(body).toMatchObject({ ok: true, orderCode: 'P3D-250101-ABCD', uploads: [] })
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM orders').first<{ n: number }>()
    expect(n?.n).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('zalo order returns no tickets', async () => {
    const env = makeEnv(full)
    const { body } = await post(env, meta({ files: [src(1, { fileDelivery: 'zalo', fileSize: 40 * 1024 * 1024 })] }))
    expect(body.ok).toBe(true)
    expect(uploads(body)).toEqual([])
    expect((await getOrder(env.DB, 'P3D-250101-ABCD'))?.fileStatus).toBe('zalo')
    expect(tg()).toHaveLength(1)
  })

  it('APPS_SCRIPT_URL rỗng: không vé, không Telegram, không Apps Script, preview=true', async () => {
    const env = makeEnv({ ...full, APPS_SCRIPT_URL: '' })
    const { body } = await post(env, meta())
    expect(body.ok).toBe(true)
    expect(uploads(body)).toEqual([])
    expect(body.preview).toBe(true)
    expect(aps()).toHaveLength(0)
    expect(tg()).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })

  it('có APPS_SCRIPT_URL: preview=false, fileStatus pending; gửi lại sau khi file đã lưu → saved', async () => {
    const env = makeEnv(full)
    const first = (await post(env, meta())).body
    expect(first).toMatchObject({ preview: false, fileStatus: 'pending' })
    await saveFile(env, 1)
    const again = (await post(env, meta())).body
    expect(again).toMatchObject({ ok: true, preview: false, fileStatus: 'saved', uploads: [] })
  })

  it('fileDelivery zalo → fileStatus zalo', async () => {
    const env = makeEnv(full)
    expect((await post(env, meta({ files: [src(1, { fileDelivery: 'zalo' })] }))).body.fileStatus).toBe('zalo')
  })

  it('Telegram trả non-2xx: ghi console.error, đơn vẫn ok', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? '') })
      return new Response('{}', { status: String(url).includes('telegram') ? 401 : 200 })
    })
    const { body } = await post(makeEnv(full), meta())
    expect(body.ok).toBe(true)
    expect(err.mock.calls.some((c) => String(c[0]).includes('telegram'))).toBe(true)
    err.mockRestore()
  })

  it('email có nhiều địa chỉ bị từ chối', async () => {
    const env = makeEnv(full)
    const bad = meta({ customer: { name: 'An', phone: '0913 014 605', email: 'a@x.com,b@y.com', note: '' } })
    expect((await post(env, bad)).body).toEqual({ ok: false, error: 'Email không hợp lệ' })
    const ok = meta({ customer: { name: 'An', phone: '0913 014 605', email: 'a@x.com', note: '' } })
    expect((await post(env, ok)).body.ok).toBe(true)
  })

  it('thiếu SHARED_SECRET: đơn vẫn ghi, không vé, không 500', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const env = makeEnv({ ...full, SHARED_SECRET: '' })
    const { res, body } = await post(env, meta())
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, uploads: [] })
    expect(await getOrder(env.DB, 'P3D-250101-ABCD')).not.toBeNull()
    err.mockRestore()
  })

  it('URL có dấu / cuối: không sinh //', async () => {
    const env = makeEnv({ ...full, PUBLIC_SITE_URL: 'https://site/', ADMIN_SITE_URL: 'https://admin/' })
    const { body } = await post(env, meta())
    expect(body.trackUrl).toBe('https://site/tra-cuu?ma=P3D-250101-ABCD')
    expect(JSON.parse(tg()[0].body).text).toContain('Admin: https://admin/#/orders/P3D-250101-ABCD')
  })

  it('Telegram lỗi: vẫn ok', async () => {
    telegramFails = true
    const env = makeEnv(full)
    const { res, body } = await post(env, meta())
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(aps()).toHaveLength(1)
  })

  it('Turnstile bật: thất bại thì báo lỗi, thành công thì ghi đơn', async () => {
    const env = makeEnv({ ...full, TURNSTILE_SECRET: 'ts' })
    let success = false
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? '') })
      return new Response(JSON.stringify({ success, ok: true }))
    })
    expect((await post(env, meta({ turnstileToken: null }))).body.error).toBe('Xác minh chống spam thất bại')
    expect((await post(env, meta({ turnstileToken: 'tok' }))).body.error).toBe('Xác minh chống spam thất bại')
    success = true
    expect((await post(env, meta({ turnstileToken: 'tok' }))).body.ok).toBe(true)
    const v = calls.find((c) => c.url.includes('siteverify'))
    expect(v?.body).toBe('secret=ts&response=tok')
  })

  it('đổi hex màu sau khi đặt: đơn vẫn giữ hex cũ', async () => {
    const env = makeEnv(full)
    await post(env, meta())
    await env.DB.prepare("UPDATE colors SET hex='#000000' WHERE id=3").run()
    expect((await getOrder(env.DB, 'P3D-250101-ABCD'))?.colorHex).toBe('#c62828')
  })

  it('lưu lỗi: hoàn lại lượt rate limit và báo lỗi máy chủ', async () => {
    const env = makeEnv(full)
    const real = env.DB.batch.bind(env.DB)
    env.DB.batch = (async () => {
      throw new Error('boom')
    }) as never
    const { body } = await post(env, meta())
    expect(body).toEqual({ ok: false, error: 'Máy chủ gặp lỗi, vui lòng gửi qua Zalo kèm mã đơn' })
    env.DB.batch = real
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM rate_hits').first<{ n: number }>()
    expect(n?.n).toBe(0)
  })

  it('creates order with files and items and one ticket per upload file', async () => {
    const env = makeEnv(full)
    const { body } = await post(env, two())
    expect(body.ok).toBe(true)
    expect(uploads(body).map((u) => u.fileNo)).toEqual([1, 2, 0])
    expect(await verifyFileTicket('s', uploads(body)[1].ticket, 'P3D-250101-ABCD', 2, 2000)).toBe(true)
    expect(await verifyFileTicket('s', uploads(body)[1].ticket, 'P3D-250101-ABCD', 1, 2000)).toBe(false)
    const files = await listOrderFiles(env.DB, 'P3D-250101-ABCD')
    expect(files.map((f) => [f.fileNo, f.role, f.fileStatus])).toEqual([[0, 'plate', 'pending'], [1, 'source', 'pending'], [2, 'source', 'pending']])
    const items = await listOrderItems(env.DB, 'P3D-250101-ABCD')
    expect(items.map((i) => [i.itemNo, i.fileNo, i.quantity, i.support])).toEqual([[1, 1, 2, 0], [2, 2, 1, 0]])
    const o = await getOrder(env.DB, 'P3D-250101-ABCD')
    expect(o).toMatchObject({ fileName: 'm1.stl +1', fileSize: 3000, fileDelivery: 'upload', fileStatus: 'pending' })
    expect(JSON.parse(o!.settings!)).toMatchObject({ material: 'PLA', layerHeight: 0.2, infillPercent: 15, wallLoops: 2, quantity: 2 })
    expect(JSON.parse(o!.estimate!).separateTotal).toBeNull()
    expect(JSON.parse(tg()[0].body).text).toContain('#2 m2.stl ×1 · đặc 15% · 2 vỏ')
  })

  it('rejects 11 items', async () => {
    const env = makeEnv(full)
    const items = Array.from({ length: 11 }, (_, i) => item(i + 1, 1))
    expect((await post(env, meta({ items }))).body.ok).toBe(false)
  })

  it('rejects item pointing to unknown file', async () => {
    const env = makeEnv(full)
    expect((await post(env, meta({ items: [item(1, 7)] }))).body.ok).toBe(false)
    // món không được trỏ vào file bàn in
    expect((await post(env, two({ items: [item(1, 0)] }))).body.ok).toBe(false)
  })

  it('rejects sources over 35 MB total', async () => {
    const env = makeEnv(full)
    const big = 20 * 1024 * 1024
    const { body } = await post(env, meta({ files: [src(1, { fileSize: big }), src(2, { fileSize: big })], items: [item(1, 1), item(2, 2)] }))
    expect(body.ok).toBe(false)
    // Zalo thì không giới hạn tổng
    const z = [src(1, { fileSize: big, fileDelivery: 'zalo' }), src(2, { fileSize: big, fileDelivery: 'zalo' })]
    expect((await post(env, meta({ files: z, items: [item(1, 1), item(2, 2)] }))).body.ok).toBe(true)
  })

  it('rejects placements length mismatch', async () => {
    const env = makeEnv(full)
    const p = [{ x: 1, y: 1, rotDeg: 0 }]
    expect((await post(env, meta({ items: [item(1, 1, { quantity: 2, placements: p })] }))).body.ok).toBe(false)
    expect((await post(env, meta({ items: [item(1, 1, { quantity: 1, placements: p })] }))).body.ok).toBe(true)
  })

  it('validate: số lượng, hạn mức, file bàn in, footprint, tên dài', async () => {
    const env = makeEnv(full)
    for (const q of [0, 51, 1.5]) expect((await post(env, meta({ items: [item(1, 1, { quantity: q })] }))).body.ok).toBe(false)
    expect((await post(env, meta({ items: [] }))).body.ok).toBe(false)
    expect((await post(env, meta({ items: [item(1, 1, { infillPercent: Infinity })] }))).body.ok).toBe(false)
    expect((await post(env, meta({ items: [item(1, 1, { footprint: Array(33).fill([0, 0]) })] }))).body.ok).toBe(false)
    expect((await post(env, meta({ files: [src(1), plate(), plate()] }))).body.ok).toBe(false)
    expect((await post(env, meta({ files: [src(1), plate({ fileNo: 3 })] }))).body.ok).toBe(false)
    expect((await post(env, meta({ files: [src(1), src(1)] }))).body.ok).toBe(false)
    expect((await post(env, meta({ files: [plate()] }))).body.ok).toBe(false)
    const long = 'x'.repeat(300)
    expect((await post(env, meta({ files: [src(1, { fileName: long })], items: [item(1, 1, { name: long })] }))).body.ok).toBe(true)
    expect((await listOrderItems(env.DB, 'P3D-250101-ABCD'))[0].name).toHaveLength(160)
  })

  it('resubmit returns tickets only for unsaved files', async () => {
    const env = makeEnv(full)
    await post(env, two())
    expect((await saveFile(env, 1)).status).toBe(200)
    const before = tg().length
    const { body } = await post(env, two())
    expect(body.ok).toBe(true)
    expect(uploads(body).map((u) => u.fileNo)).toEqual([2, 0])
    expect(body.fileStatus).toBe('pending')
    expect(tg()).toHaveLength(before)
    expect(aps()).toHaveLength(1)
  })

  it('fingerprint ignores placements', async () => {
    const env = makeEnv(full)
    const mk = (x: number) =>
      meta({ items: [item(1, 1, { placements: [{ x, y: 5, rotDeg: 0 }], footprint: [[x, 0], [1, 1], [2, 0]] })] })
    await post(env, mk(10))
    const { body } = await post(env, mk(40))
    expect(body.ok).toBe(true)
    expect(uploads(body)).toHaveLength(1)
  })

  it('đơn Zalo gửi lại: không vé, fileStatus zalo', async () => {
    const env = makeEnv(full)
    const m = meta({ files: [src(1, { fileDelivery: 'zalo' })] })
    await post(env, m)
    const { body } = await post(env, m)
    expect(body).toMatchObject({ ok: true, uploads: [], fileStatus: 'zalo' })
  })

  it('body quá 256 KB bị từ chối, 100 KB vẫn nhận', async () => {
    const env = makeEnv(full)
    const ok = meta({ customer: { name: 'An', phone: '0913014605', email: '', note: 'x'.repeat(100_000) } })
    expect((await post(env, ok)).body.ok).toBe(true)
    const bad = meta({ orderCode: 'P3D-250101-BBBB', customer: { name: 'An', phone: '0913014605', email: '', note: 'x'.repeat(300_000) } })
    expect((await post(env, bad)).body.error).toBe('Dữ liệu đơn không hợp lệ')
  })
})
