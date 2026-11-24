// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { insertOrder, type OrderRow } from '../shared/orderRepo.ts'
import { fakeAssets, fakeCtx, makeEnv } from '../test/env.ts'
import { createAdminHandler } from './index.ts'

const ORIGIN = 'https://admin.example.com'
const CODE = 'P3D-250101-ABCD'

const row = (over: Partial<OrderRow> = {}): OrderRow => ({
  code: CODE, createdAt: '2025-01-01T00:00:00.000Z', orderType: 'quote', consultReasons: '[]',
  customerName: 'Nguyễn An', customerPhone: '0913014605', customerEmail: 'an@example.com',
  customerNote: null, settings: null, dims: null, surfaceArea: null, volume: null, scale: 1,
  estimate: null, colorId: 3, colorName: 'Đỏ', colorHex: '#c62828', fileName: null, fileSize: null,
  fileDelivery: null, fileStatus: null, driveUrl: null, fingerprint: null, status: 'received',
  statusUpdatedAt: '2025-01-01T00:00:00.000Z', ...over,
})

const adminEnv = () =>
  makeEnv({
    ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud', ADMIN_EMAILS: 'Trung@x.com, other@x.com',
    APPS_SCRIPT_URL: 'https://script/exec', PUBLIC_SITE_URL: 'https://site',
  })

// Stub xác minh: token "good" → trung@x.com (hoa/thường khác ADMIN_EMAILS), "stranger" → email lạ.
const verify = async (t: string) =>
  t === 'good' ? { email: 'TRUNG@x.com' } : t === 'stranger' ? { email: 'who@x.com' } : null
const handler = createAdminHandler({ verify })

type Env = ReturnType<typeof adminEnv>
async function call(env: Env, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { 'Cf-Access-Jwt-Assertion': 'good', Origin: ORIGIN, ...headers }
  if (body !== undefined) h['content-type'] = 'application/json'
  const res = await handler.fetch(
    new Request(ORIGIN + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }),
    env,
    fakeCtx(),
  )
  return { res, body: (await res.clone().json().catch(() => null)) as Record<string, any> | null } // eslint-disable-line
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('xác thực', () => {
  it('không có header → 401', async () => {
    const env = adminEnv()
    const res = await handler.fetch(new Request(ORIGIN + '/api/orders'), env, fakeCtx())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false })
  })
  it('token sai → 401; email không thuộc ADMIN_EMAILS → 401', async () => {
    const env = adminEnv()
    expect((await call(env, 'GET', '/api/orders', undefined, { 'Cf-Access-Jwt-Assertion': 'bad' })).res.status).toBe(401)
    expect((await call(env, 'GET', '/api/orders', undefined, { 'Cf-Access-Jwt-Assertion': 'stranger' })).res.status).toBe(401)
  })
  it('thiếu cấu hình Access → 401 với mọi /api', async () => {
    for (const k of ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'ADMIN_EMAILS'] as const) {
      const env = adminEnv()
      env[k] = ''
      expect((await call(env, 'GET', '/api/orders')).res.status).toBe(401)
    }
  })
  it('POST thiếu Origin khớp → 403', async () => {
    const env = adminEnv()
    await insertOrder(env.DB, row())
    const bad = await call(env, 'POST', `/api/orders/${CODE}/status`, { status: 'paid' }, { Origin: 'https://evil.com' })
    expect(bad.res.status).toBe(403)
    const h = { 'Cf-Access-Jwt-Assertion': 'good', 'content-type': 'application/json' }
    const none = await handler.fetch(
      new Request(ORIGIN + `/api/orders/${CODE}/status`, { method: 'POST', headers: h, body: '{"status":"paid"}' }),
      env, fakeCtx(),
    )
    expect(none.status).toBe(403)
    expect((await env.DB.prepare('SELECT status FROM orders').first<{ status: string }>())?.status).toBe('received')
  })
  it('đường ngoài /api đi về ASSETS', async () => {
    fakeAssets.calls.length = 0
    const res = await handler.fetch(new Request(ORIGIN + '/don'), adminEnv(), fakeCtx())
    expect(await res.text()).toBe('asset')
    expect(fakeAssets.calls).toHaveLength(1)
  })
})

describe('đổi trạng thái', () => {
  it('printing có email → event mới, gửi notifyStatus, email_sent 1', async () => {
    const env = adminEnv()
    await insertOrder(env.DB, row())
    const { res, body } = await call(env, 'POST', `/api/orders/${CODE}/status`, { status: 'printing', note: 'Bắt đầu in' })
    expect(res.status).toBe(200)
    expect(body?.ok).toBe(true)
    expect(body?.event).toMatchObject({ status: 'printing', note: 'Bắt đầu in', emailSent: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sent.action).toBe('notifyStatus')
    const data = typeof sent.data === 'string' ? JSON.parse(sent.data) : sent.data
    expect(data.to).toBe('an@example.com')
    expect(data.subject).toBe(`[In 3D Trung] Đơn ${CODE}: Đang in 3D`)
    expect(data.text).toContain('Nguyễn An')
    expect(data.text).toContain('Đang in 3D')
    expect(data.text).toContain('Bắt đầu in')
    expect(data.text).toContain(`https://site/tra-cuu?ma=${CODE}`)
    expect(data.text).toContain('Liên hệ Zalo 0913014605')
    expect(data.text).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)
    const order = (await call(env, 'GET', `/api/orders/${CODE}`)).body
    expect(order?.order.status).toBe('printing')
    expect(order?.events).toHaveLength(2)
    expect(order?.events[1].emailSent).toBe(1)
  })
  it('không có ghi chú → email không có dòng ghi chú', async () => {
    const env = adminEnv()
    await insertOrder(env.DB, row())
    await call(env, 'POST', `/api/orders/${CODE}/status`, { status: 'paid' })
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    const data = typeof sent.data === 'string' ? JSON.parse(sent.data) : sent.data
    expect(data.text).not.toContain('Ghi chú')
  })
  it('Apps Script lỗi → vẫn ok, email_sent 0', async () => {
    const env = adminEnv()
    await insertOrder(env.DB, row())
    fetchMock.mockRejectedValue(new Error('boom'))
    const { res, body } = await call(env, 'POST', `/api/orders/${CODE}/status`, { status: 'printing' })
    expect(res.status).toBe(200)
    expect(body?.event.emailSent).toBe(0)
    expect((await env.DB.prepare('SELECT email_sent FROM order_events ORDER BY id DESC').first<{ email_sent: number }>())?.email_sent).toBe(0)
  })
  it('đơn không email → không gọi Apps Script, email_sent null', async () => {
    const env = adminEnv()
    await insertOrder(env.DB, row({ customerEmail: null }))
    const { body } = await call(env, 'POST', `/api/orders/${CODE}/status`, { status: 'paid' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(body?.event.emailSent).toBeNull()
  })
  it('cancelled rồi về paid → 3 event, status paid', async () => {
    const env = adminEnv()
    await insertOrder(env.DB, row())
    await call(env, 'POST', `/api/orders/${CODE}/status`, { status: 'cancelled' })
    await call(env, 'POST', `/api/orders/${CODE}/status`, { status: 'paid' })
    const o = (await call(env, 'GET', `/api/orders/${CODE}`)).body
    expect(o?.order.status).toBe('paid')
    expect(o?.events.map((e: { status: string }) => e.status)).toEqual(['received', 'cancelled', 'paid'])
  })
  it("status 'xyz' → 400; đơn không có → 404; note cắt 500", async () => {
    const env = adminEnv()
    await insertOrder(env.DB, row({ customerEmail: null }))
    expect((await call(env, 'POST', `/api/orders/${CODE}/status`, { status: 'xyz' })).res.status).toBe(400)
    expect((await call(env, 'POST', '/api/orders/P3D-250101-ZZZZ/status', { status: 'paid' })).res.status).toBe(404)
    const { body } = await call(env, 'POST', `/api/orders/${CODE}/status`, { status: 'paid', note: 'x'.repeat(600) })
    expect(body?.event.note).toHaveLength(500)
  })
})

describe('xoá đơn', () => {
  it('confirm sai → 400, đơn còn; đúng → đơn và events mất, không gửi mail', async () => {
    const env = adminEnv()
    await insertOrder(env.DB, row())
    expect((await call(env, 'DELETE', `/api/orders/${CODE}`, { confirm: 'nope' })).res.status).toBe(400)
    expect((await call(env, 'GET', `/api/orders/${CODE}`)).res.status).toBe(200)
    expect((await call(env, 'DELETE', `/api/orders/${CODE}`, { confirm: CODE })).res.status).toBe(200)
    expect((await call(env, 'GET', `/api/orders/${CODE}`)).res.status).toBe(404)
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM order_events').first<{ n: number }>())?.n).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('màu', () => {
  it('PATCH màu 3 không đổi color_hex của đơn cũ', async () => {
    const env = adminEnv()
    await insertOrder(env.DB, row())
    const p = await call(env, 'PATCH', '/api/colors/3', { hex: '#ff0000' })
    expect(p.body?.color).toMatchObject({ id: 3, hex: '#ff0000' })
    expect((await call(env, 'GET', `/api/orders/${CODE}`)).body?.order.colorHex).toBe('#c62828')
  })
  it('GET trả cả màu ẩn; POST thêm sort=max+1; hex sai / tên sai → 400', async () => {
    const env = adminEnv()
    await call(env, 'PATCH', '/api/colors/4', { active: 0 })
    const list = (await call(env, 'GET', '/api/colors')).body
    expect(list?.colors).toHaveLength(4)
    expect(list?.colors[3]).toMatchObject({ id: 4, active: 0 })
    const c = await call(env, 'POST', '/api/colors', { name: 'Xanh', hex: '#00FF00' })
    expect(c.body?.color).toMatchObject({ name: 'Xanh', hex: '#00FF00', sort: 5, active: 1 })
    expect((await call(env, 'POST', '/api/colors', { name: 'Xanh', hex: 'red' })).res.status).toBe(400)
    expect((await call(env, 'POST', '/api/colors', { name: '', hex: '#00ff00' })).res.status).toBe(400)
    expect((await call(env, 'POST', '/api/colors', { name: 'x'.repeat(31), hex: '#00ff00' })).res.status).toBe(400)
    expect((await call(env, 'PATCH', '/api/colors/2', { hex: 'zzz' })).res.status).toBe(400)
    expect((await call(env, 'PATCH', '/api/colors/99', { name: 'A' })).res.status).toBe(404)
  })
  it('không có route xoá màu', async () => {
    const { res } = await call(adminEnv(), 'DELETE', '/api/colors/1')
    expect(res.status).toBe(404)
  })
})

describe('danh sách', () => {
  it('lọc status, tìm q theo SĐT/tên/mã, phân trang', async () => {
    const env = adminEnv()
    for (let i = 0; i < 31; i++) {
      const n = String(i).padStart(2, '0')
      await insertOrder(env.DB, row({
        code: `P3D-2501${n}-AAAA`, createdAt: `2025-01-01T00:00:${n}.000Z`, status: i === 5 ? 'printing' : 'received',
        fileStatus: i === 3 ? 'pending' : null,
        customerName: i === 7 ? 'Lê Văn B' : 'Nguyễn An', customerPhone: i === 9 ? '0987654321' : '0913014605',
      }))
    }
    const printing = (await call(env, 'GET', '/api/orders?status=printing')).body
    expect(printing?.total).toBe(1)
    expect(printing?.orders[0].code).toBe('P3D-250105-AAAA')
    expect((await call(env, 'GET', '/api/orders?q=0913')).body?.total).toBe(30)
    expect((await call(env, 'GET', '/api/orders?q=%2B84987654321')).body?.total).toBe(1)
    expect((await call(env, 'GET', '/api/orders?q=Lê')).body?.total).toBe(1)
    expect((await call(env, 'GET', '/api/orders?q=250107')).body?.total).toBe(1)
    expect((await call(env, 'GET', '/api/orders?q=%25')).body?.total).toBe(0)
    expect((await call(env, 'GET', '/api/orders?q=0913&status=received')).body?.total).toBe(29)
    const p1 = (await call(env, 'GET', '/api/orders')).body
    expect(p1).toMatchObject({ total: 31, page: 1, pageSize: 30 })
    expect(p1?.orders).toHaveLength(30)
    expect(p1?.orders[0].code).toBe('P3D-250130-AAAA')
    expect(p1?.orders.find((o: { code: string }) => o.code === 'P3D-250103-AAAA')?.fileStatus).toBe('pending')
    const p2 = (await call(env, 'GET', '/api/orders?page=2')).body
    expect(p2?.orders).toHaveLength(1)
  })
})
