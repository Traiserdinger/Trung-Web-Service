// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { insertOrder, type OrderRow } from '../shared/orderRepo.ts'
import { fakeCtx, makeEnv } from '../test/env.ts'
import { makeSessionCookie } from './auth.ts'
import { createAdminHandler } from './index.ts'

const ORIGIN = 'https://admin.example.com'
const HOUR = 3_600_000
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString()

let n = 0
const row = (over: Partial<OrderRow> = {}): OrderRow => {
  const code = `P3D-261124-${String(n++).padStart(4, '0')}`
  const at = over.createdAt ?? ago(1)
  return {
    code, createdAt: at, orderType: 'quote', consultReasons: '[]', customerName: 'Nguyễn An',
    customerPhone: '0913014605', customerEmail: null, customerNote: null, settings: null, dims: null,
    surfaceArea: null, volume: null, scale: 1, estimate: null, colorId: 1, colorName: 'Đen', colorHex: '#1f1f1f',
    fileName: null, fileSize: null, fileDelivery: null, fileStatus: null, driveUrl: null, fingerprint: null,
    status: 'received', statusUpdatedAt: at, ...over,
  }
}

const env = () => makeEnv({ ADMIN_SESSION_SECRET: 'sess', ADMIN_EMAILS: 'trung@x.com' })
const handler = createAdminHandler()

async function getStats(e: ReturnType<typeof env>, cookie = true) {
  const c = /__Host-admin_session=[^;]*/.exec(await makeSessionCookie('sess', 'trung@x.com'))![0]
  const res = await handler.fetch(new Request(ORIGIN + '/api/stats', { headers: cookie ? { Cookie: c } : {} }), e, fakeCtx())
  return { res, body: (await res.json()) as Record<string, any> } // eslint-disable-line
}

describe('GET /api/stats', () => {
  it('không cookie → 401', async () => {
    expect((await getStats(env(), false)).res.status).toBe(401)
  })

  it('DB trống → mọi số bằng 0, attention rỗng', async () => {
    const { res, body } = await getStats(env())
    expect(res.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      byStatus: { received: 0, paid: 0, printing: 0, shipping: 0, done: 0, cancelled: 0 },
      last7Days: 0, estimate30Days: 0, pendingFiles: 0, attention: [],
    })
  })

  it('đếm theo trạng thái, 7 ngày, tạm tính 30 ngày bỏ đơn huỷ, đơn chưa có file', async () => {
    const e = env()
    const est = (total: number) => JSON.stringify({ total, grams: 10 })
    await insertOrder(e.DB, row({ status: 'received', estimate: est(100_000), createdAt: ago(2) }))
    await insertOrder(e.DB, row({ status: 'paid', estimate: est(50_000), createdAt: ago(24 * 6) }))
    await insertOrder(e.DB, row({ status: 'printing', estimate: est(25_000), createdAt: ago(24 * 20), fileStatus: 'pending' }))
    await insertOrder(e.DB, row({ status: 'cancelled', estimate: est(999_000), createdAt: ago(3), fileStatus: 'pending' }))
    await insertOrder(e.DB, row({ status: 'done', estimate: est(7_000), createdAt: ago(24 * 40) }))
    await insertOrder(e.DB, row({ status: 'done', estimate: null, createdAt: ago(5) }))
    await insertOrder(e.DB, row({ status: 'shipping', estimate: 'không phải json', createdAt: ago(6) }))
    const { body } = await getStats(e)
    expect(body.byStatus).toEqual({ received: 1, paid: 1, printing: 1, shipping: 1, done: 2, cancelled: 1 })
    expect(body.last7Days).toBe(5)
    expect(body.estimate30Days).toBe(175_000)
    expect(body.pendingFiles).toBe(1)
  })

  it('attention: chưa có file trước, rồi đã nhận quá 24 giờ; mới nhất trước; tối đa 8', async () => {
    const e = env()
    const fresh = row({ status: 'received', createdAt: ago(3) })
    const old1 = row({ status: 'received', createdAt: ago(30) })
    const old2 = row({ status: 'received', createdAt: ago(50) })
    const pendA = row({ status: 'paid', fileStatus: 'pending', createdAt: ago(100) })
    const pendB = row({ status: 'received', fileStatus: 'pending', createdAt: ago(10) })
    const pendCancelled = row({ status: 'cancelled', fileStatus: 'pending', createdAt: ago(1) })
    for (const o of [fresh, old1, old2, pendA, pendB, pendCancelled]) await insertOrder(e.DB, o)
    const { body } = await getStats(e)
    expect(body.attention.map((o: { code: string }) => o.code)).toEqual([pendB.code, pendA.code, old1.code, old2.code])
    expect(body.attention[0]).toMatchObject({ customerName: 'Nguyễn An', colorHex: '#1f1f1f', fileStatus: 'pending', status: 'received' })
    expect(body.attention[0]).not.toHaveProperty('customerEmail')

    for (let i = 0; i < 10; i++) await insertOrder(e.DB, row({ status: 'received', createdAt: ago(40 + i) }))
    const many = (await getStats(e)).body
    expect(many.attention).toHaveLength(8)
    expect(many.attention.slice(0, 2).map((o: { code: string }) => o.code)).toEqual([pendB.code, pendA.code])
  })
})
