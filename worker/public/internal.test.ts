// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { signEnvelope } from '../shared/hmac.ts'
import { getOrder, insertOrder, listOrderFiles, type OrderFileRow, type OrderRow } from '../shared/orderRepo.ts'
import { makeEnv } from '../test/env.ts'
import { handleInternalFile } from './internal.ts'

const row: OrderRow = {
  code: 'P3D-250101-ABCD', createdAt: '2025-01-01T00:00:00.000Z', orderType: 'quote', consultReasons: '[]',
  customerName: 'A', customerPhone: '0913014605', customerEmail: null, customerNote: null, settings: '{}',
  dims: null, surfaceArea: null, volume: null, scale: 1, estimate: null, colorId: 1, colorName: 'Đen',
  colorHex: '#1f1f1f', fileName: 'a.stl', fileSize: 1, fileDelivery: 'upload', fileStatus: 'pending',
  driveUrl: null, fingerprint: 'f', status: 'received', statusUpdatedAt: '2025-01-01T00:00:00.000Z',
}
const fileRow: OrderFileRow = {
  orderCode: row.code, fileNo: 1, role: 'source', fileName: 'a.stl', fileSize: 1, fileType: 'stl',
  fileDelivery: 'upload', fileStatus: 'pending', driveUrl: null,
}
const post = (env: ReturnType<typeof makeEnv>, body: unknown) =>
  handleInternalFile(new Request('https://site/api/internal/file', { method: 'POST', body: JSON.stringify(body) }), env)

describe('POST /api/internal/file', () => {
  it('chữ ký đúng → saved + drive_url; gọi lại vẫn ok', async () => {
    const env = makeEnv()
    await insertOrder(env.DB, row, [fileRow], [])
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
    await insertOrder(env.DB, row, [fileRow], [])
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

  const file2: OrderFileRow = { ...fileRow, fileNo: 2, fileName: 'b.stl' }

  it('internal fileSaved with fileNo updates that file', async () => {
    const env = makeEnv()
    await insertOrder(env.DB, row, [fileRow, file2], [])
    const e = await signEnvelope('s', 'fileSaved', { orderCode: row.code, fileNo: 2, driveUrl: 'https://drive/folder', fileUrl: 'https://drive/b' })
    expect(await (await post(env, e)).json()).toEqual({ ok: true })
    const files = await listOrderFiles(env.DB, row.code)
    expect(files.find((f) => f.fileNo === 2)).toMatchObject({ fileStatus: 'saved', driveUrl: 'https://drive/b' })
    expect(files.find((f) => f.fileNo === 1)?.fileStatus).toBe('pending')
    const o = await getOrder(env.DB, row.code)
    expect(o).toMatchObject({ fileStatus: 'pending', driveUrl: 'https://drive/folder' })
  })

  it('internal fileSaved without fileNo updates file 1', async () => {
    const env = makeEnv()
    await insertOrder(env.DB, row, [fileRow, file2], [])
    const e = await signEnvelope('s', 'fileSaved', { orderCode: row.code, driveUrl: 'https://drive/folder' })
    expect((await post(env, e)).status).toBe(200)
    const files = await listOrderFiles(env.DB, row.code)
    expect(files.find((f) => f.fileNo === 1)).toMatchObject({ fileStatus: 'saved', driveUrl: 'https://drive/folder' })
    expect(files.find((f) => f.fileNo === 2)?.fileStatus).toBe('pending')
  })

  it('fileNo không hợp lệ → 400; fileNo không tồn tại → ok nhưng không đổi gì', async () => {
    const env = makeEnv()
    await insertOrder(env.DB, row, [fileRow], [])
    const bad = await signEnvelope('s', 'fileSaved', { orderCode: row.code, fileNo: 'x', driveUrl: 'u' })
    expect((await post(env, bad)).status).toBe(400)
    const none = await signEnvelope('s', 'fileSaved', { orderCode: row.code, fileNo: 9, driveUrl: 'u' })
    expect((await post(env, none)).status).toBe(200)
    expect((await getOrder(env.DB, row.code))?.fileStatus).toBe('pending')
  })

  it('đơn do Worker cũ ghi (không có dòng file/món): fileSaved không fileNo vẫn đánh dấu saved', async () => {
    const env = makeEnv()
    await insertOrder(env.DB, row)
    expect(await listOrderFiles(env.DB, row.code)).toHaveLength(0)
    const e = await signEnvelope('s', 'fileSaved', { orderCode: row.code, driveUrl: 'https://drive/x' })
    expect(await (await post(env, e)).json()).toEqual({ ok: true })
    expect((await listOrderFiles(env.DB, row.code))[0]).toMatchObject({ fileNo: 1, fileStatus: 'saved' })
    expect((await getOrder(env.DB, row.code))?.fileStatus).toBe('saved')
  })
})
