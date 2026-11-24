// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { insertOrder, type OrderRow } from '../shared/orderRepo.ts'
import { makeEnv } from '../test/env.ts'
import { handleTrack } from './track.ts'

const row: OrderRow = {
  code: 'P3D-250101-ABCD', createdAt: '2025-01-01T00:00:00.000Z', orderType: 'quote', consultReasons: '[]',
  customerName: 'Nguyen Van Secret', customerPhone: '0913014605', customerEmail: 'secret@example.com',
  customerNote: 'ghi chu rieng', settings: JSON.stringify({ material: 'PLA', quantity: 2 }), dims: null,
  surfaceArea: null, volume: null, scale: 1, estimate: JSON.stringify({ total: 123000 }), colorId: 3,
  colorName: 'Đỏ', colorHex: '#c62828', fileName: 'a.stl', fileSize: 1, fileDelivery: 'upload',
  fileStatus: 'pending', driveUrl: null, fingerprint: 'f', status: 'received', statusUpdatedAt: '2025-01-01T00:00:00.000Z',
}

const track = (env: ReturnType<typeof makeEnv>, body: unknown, ip = '1.1.1.1') =>
  handleTrack(new Request('https://site/api/track', { method: 'POST', headers: { 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env)

async function seeded() {
  const env = makeEnv()
  await insertOrder(env.DB, row)
  return env
}

describe('POST /api/track', () => {
  it('đúng mã + SĐT định dạng khác → ok, có events, không lộ thông tin khách', async () => {
    const env = await seeded()
    const res = await track(env, { code: row.code, phone: '+84 913 014 605' })
    const text = await res.text()
    const body = JSON.parse(text)
    expect(body.ok).toBe(true)
    expect(body.order).toMatchObject({ code: row.code, material: 'PLA', quantity: 2, estimateTotal: 123000, colorName: 'Đỏ', status: 'received' })
    expect(body.order.events).toHaveLength(1)
    for (const leak of ['phone', 'email', 'name', 'Secret', '0913', 'secret@', 'ghi chu']) expect(text).not.toContain(leak)
  })

  it('sai SĐT và sai mã → cùng status và cùng body', async () => {
    const env = await seeded()
    const a = await track(env, { code: row.code, phone: '0900000000' })
    const b = await track(env, { code: 'P3D-250101-ZZZZ', phone: '0913014605' })
    const c = await track(env, { nonsense: 1 })
    expect(a.status).toBe(b.status)
    expect(await a.text()).toBe(await b.text())
    expect(await c.json()).toEqual({ ok: false, error: 'Không tìm thấy đơn. Kiểm tra lại mã đơn và SĐT.' })
  })

  it('lượt thứ 11 từ cùng IP → 429', async () => {
    const env = await seeded()
    for (let i = 0; i < 10; i++) expect((await track(env, { code: 'x', phone: 'y' })).status).toBe(200)
    const res = await track(env, { code: row.code, phone: '0913014605' })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ ok: false, error: 'Bạn tra cứu quá nhiều lần, thử lại sau 10 phút' })
    expect((await track(env, { code: row.code, phone: '0913014605' }, '2.2.2.2')).status).toBe(200)
  })
})
