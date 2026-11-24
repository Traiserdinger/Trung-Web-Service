// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { signEnvelope } from '../shared/hmac.ts'
import { getOrder, insertOrder, type OrderRow } from '../shared/orderRepo.ts'
import { makeEnv } from '../test/env.ts'
import { handleInternalFile } from './internal.ts'

const row: OrderRow = {
  code: 'P3D-250101-ABCD', createdAt: '2025-01-01T00:00:00.000Z', orderType: 'quote', consultReasons: '[]',
  customerName: 'A', customerPhone: '0913014605', customerEmail: null, customerNote: null, settings: '{}',
  dims: null, surfaceArea: null, volume: null, scale: 1, estimate: null, colorId: 1, colorName: 'Đen',
  colorHex: '#1f1f1f', fileName: 'a.stl', fileSize: 1, fileDelivery: 'upload', fileStatus: 'pending',
  driveUrl: null, fingerprint: 'f', status: 'received', statusUpdatedAt: '2025-01-01T00:00:00.000Z',
}
const post = (env: ReturnType<typeof makeEnv>, body: unknown) =>
  handleInternalFile(new Request('https://site/api/internal/file', { method: 'POST', body: JSON.stringify(body) }), env)

describe('POST /api/internal/file', () => {
  it('chữ ký đúng → saved + drive_url; gọi lại vẫn ok', async () => {
    const env = makeEnv()
    await insertOrder(env.DB, row)
    const env1 = await signEnvelope('s', 'fileSaved', { orderCode: row.code, driveUrl: 'https://drive/x' })
    expect(await (await post(env, env1)).json()).toEqual({ ok: true })
    const o = await getOrder(env.DB, row.code)
    expect(o?.fileStatus).toBe('saved')
    expect(o?.driveUrl).toBe('https://drive/x')
    const again = await post(env, env1)
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ ok: true })
  })

  it('sig sai → 401, không đổi DB', async () => {
    const env = makeEnv()
    await insertOrder(env.DB, row)
    const bad = await signEnvelope('wrong', 'fileSaved', { orderCode: row.code, driveUrl: 'https://drive/x' })
    expect((await post(env, bad)).status).toBe(401)
    expect((await getOrder(env.DB, row.code))?.fileStatus).toBe('pending')
  })

  it('action khác → 401; mã không tồn tại → 404', async () => {
    const env = makeEnv()
    const other = await signEnvelope('s', 'other', { orderCode: row.code, driveUrl: 'u' })
    expect((await post(env, other)).status).toBe(401)
    const unknown = await signEnvelope('s', 'fileSaved', { orderCode: 'P3D-250101-ZZZZ', driveUrl: 'u' })
    const res = await post(env, unknown)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ ok: false })
  })
})
