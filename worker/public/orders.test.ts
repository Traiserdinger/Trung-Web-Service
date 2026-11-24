// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrderMeta } from '../../src/utils/orderPayload.ts'
import { verifyTicket } from '../shared/hmac.ts'
import { getOrder, listEvents } from '../shared/orderRepo.ts'
import { fakeCtx, makeEnv } from '../test/env.ts'
import { handleCreateOrder } from './orders.ts'

function meta(over: Partial<OrderMeta> = {}): OrderMeta {
  return {
    orderCode: 'P3D-250101-ABCD',
    orderType: 'quote',
    consultReasons: [],
    customer: { name: 'An', phone: '0913 014 605', email: '', note: '' },
    settings: { material: 'PLA', layerHeight: 0.2, infillPercent: 15, wallLoops: 2, support: false, quantity: 1 },
    dims: { length: 10, width: 20, height: 30 },
    surfaceArea: 100,
    volume: 50,
    estimate: { grams: 10, timeSec: 600, total: 100000, rangeLow: 90000, rangeHigh: 110000 },
    fileName: 'a.stl',
    fileSize: 1000,
    fileDelivery: 'upload',
    scale: 1,
    turnstileToken: null,
    honeypot: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    colorId: 3,
    ...over,
  } as OrderMeta
}

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
    expect(await verifyTicket('s', body.uploadTicket as string, 'P3D-250101-ABCD', 1000)).toBe(true)
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
    expect((await post(env, meta({ fileSize: 36 * 1024 * 1024 }))).body.error).toBe('File lớn hơn 35MB, vui lòng gửi qua Zalo')
    expect((await post(env, 'không phải json')).body.error).toBe('Dữ liệu đơn không hợp lệ')
  })

  it('gửi lại y hệt khi pending: ok, vé mới, không báo thêm, không tính rate limit', async () => {
    const env = makeEnv(full)
    await post(env, meta())
    const before = tg().length
    for (let i = 0; i < 5; i++) {
      const { body } = await post(env, meta())
      expect(body.ok).toBe(true)
      expect(typeof body.uploadTicket).toBe('string')
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
    expect(typeof body.uploadTicket).toBe('string')
  })

  it('settings có giá trị không phải số bị từ chối', async () => {
    const env = makeEnv(full)
    const settings = { ...meta().settings, quantity: '1\nDrive: fake' as unknown as number }
    expect((await post(env, meta({ settings }))).body).toEqual({ ok: false, error: 'Dữ liệu đơn không hợp lệ' })
  })

  it('gửi lại cùng mã khác nội dung: lỗi', async () => {
    const env = makeEnv(full)
    await post(env, meta())
    const { body } = await post(env, meta({ fileName: 'b.stl' }))
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
    expect(body).toMatchObject({ ok: true, orderCode: 'P3D-250101-ABCD', uploadTicket: null })
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM orders').first<{ n: number }>()
    expect(n?.n).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('fileDelivery zalo: không vé, file_status zalo, vẫn báo Trung', async () => {
    const env = makeEnv(full)
    const { body } = await post(env, meta({ fileDelivery: 'zalo', fileSize: 40 * 1024 * 1024 }))
    expect(body.ok).toBe(true)
    expect(body.uploadTicket).toBeNull()
    expect((await getOrder(env.DB, 'P3D-250101-ABCD'))?.fileStatus).toBe('zalo')
    expect(tg()).toHaveLength(1)
  })

  it('APPS_SCRIPT_URL rỗng: không vé, không gọi Apps Script', async () => {
    const env = makeEnv({ ...full, APPS_SCRIPT_URL: '' })
    const { body } = await post(env, meta())
    expect(body.ok).toBe(true)
    expect(body.uploadTicket).toBeNull()
    expect(aps()).toHaveLength(0)
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
})
