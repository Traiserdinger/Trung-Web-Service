// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { applyMigration, createFakeD1 } from '../test/fakeD1.ts'
import {
  aggregateFileStatus, deleteOrder, getOrder, insertOrder, listOrderFiles, listOrderItems, setFileSaved,
  type OrderFileRow, type OrderItemRow, type OrderRow,
} from './orderRepo.ts'

const CODE = 'P3D-250101-ABCD'
const row = (over: Partial<OrderRow> = {}): OrderRow => ({
  code: CODE, createdAt: '2025-01-01T00:00:00.000Z', orderType: 'quote', consultReasons: '[]',
  customerName: 'A', customerPhone: '0913014605', customerEmail: null, customerNote: null, settings: '{}',
  dims: null, surfaceArea: null, volume: null, scale: 1, estimate: null, colorId: 1, colorName: 'Đen',
  colorHex: '#1f1f1f', fileName: 'a.stl', fileSize: 1, fileDelivery: 'upload', fileStatus: 'pending',
  driveUrl: null, fingerprint: 'f', status: 'received', statusUpdatedAt: '2025-01-01T00:00:00.000Z', ...over,
})
const file = (fileNo: number, over: Partial<OrderFileRow> = {}): OrderFileRow => ({
  orderCode: CODE, fileNo, role: 'source', fileName: `f${fileNo}.stl`, fileSize: 100, fileType: 'stl',
  fileDelivery: 'upload', fileStatus: 'pending', driveUrl: null, ...over,
})
const item = (itemNo: number, fileNo: number): OrderItemRow => ({
  orderCode: CODE, itemNo, fileNo, name: `f${fileNo}.stl`, dims: '{"x":1,"y":2,"z":3}', volume: 5, surfaceArea: 6,
  scale: 1, orient: null, infillPercent: 20, wallLoops: 2, support: 0, quantity: 1, placements: null, footprint: null,
})
const twoSourcesAndPlate = () => [file(1), file(2), file(0, { role: 'plate', fileName: '00-ban-in.3mf', fileType: '3mf' })]

describe('migration 0003', () => {
  it('backfills old orders', async () => {
    const db = createFakeD1({ upTo: '0002' })
    await db
      .prepare(
        `INSERT INTO orders (code, created_at, order_type, customer_name, customer_phone, settings, dims, volume,
          surface_area, scale, file_name, file_size, file_delivery, file_status, drive_url, status, status_updated_at)
         VALUES (?, ?, 'quote', 'A', '0913014605', ?, '{"x":1}', 7, 8, 2, 'old.stl', 99, 'upload', 'saved', 'https://d/x',
          'received', ?)`,
      )
      .bind(CODE, '2025-01-01T00:00:00.000Z', '{"infillPercent":35,"wallLoops":4,"support":true,"quantity":3}', '2025-01-01T00:00:00.000Z')
      .run()
    await db
      .prepare(
        `INSERT INTO orders (code, created_at, order_type, customer_name, customer_phone, settings, status, status_updated_at)
         VALUES ('P3D-250101-BAD1', '2025-01-01T00:00:00.000Z', 'quote', 'B', '0913014605', 'không phải json', 'received', 'x')`,
      )
      .run()
    applyMigration(db, '0003')
    expect(await listOrderFiles(db, CODE)).toEqual([
      { orderCode: CODE, fileNo: 1, role: 'source', fileName: 'old.stl', fileSize: 99, fileType: 'stl',
        fileDelivery: 'upload', fileStatus: 'saved', driveUrl: 'https://d/x' },
    ])
    const items = await listOrderItems(db, CODE)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      itemNo: 1, fileNo: 1, name: 'old.stl', dims: '{"x":1}', volume: 7, surfaceArea: 8, scale: 2, orient: null,
      infillPercent: 35, wallLoops: 4, support: 1, quantity: 3, placements: null, footprint: null,
    })
    expect(await listOrderFiles(db, 'P3D-250101-BAD1')).toHaveLength(1)
    expect(await listOrderItems(db, 'P3D-250101-BAD1')).toHaveLength(1)
  })
})

describe('migration 0004', () => {
  it('backfills an order written after 0003 without child rows, and leaves the others alone', async () => {
    const db = createFakeD1({ upTo: '0003' })
    // đơn có đủ file/món (ghi bởi bản mới)
    await insertOrder(db, row(), twoSourcesAndPlate(), [item(1, 1), item(2, 2)])
    // đơn do bản Worker cũ ghi sau 0003: chỉ có dòng orders
    await db
      .prepare(
        `INSERT INTO orders (code, created_at, order_type, customer_name, customer_phone, settings, dims, volume,
          surface_area, scale, file_name, file_size, file_delivery, file_status, status, status_updated_at)
         VALUES ('P3D-250101-LATE', '2025-01-01T00:00:00.000Z', 'quote', 'B', '0913014605', ?, '{"x":1}', 7, 8, 1,
          'late.stl', 55, 'upload', 'pending', 'received', 'x')`,
      )
      .bind('{"infillPercent":30,"wallLoops":3,"support":false,"quantity":2}')
      .run()
    expect(await listOrderFiles(db, 'P3D-250101-LATE')).toHaveLength(0)
    applyMigration(db, '0004')
    expect(await listOrderFiles(db, 'P3D-250101-LATE')).toEqual([
      { orderCode: 'P3D-250101-LATE', fileNo: 1, role: 'source', fileName: 'late.stl', fileSize: 55, fileType: 'stl',
        fileDelivery: 'upload', fileStatus: 'pending', driveUrl: null },
    ])
    expect(await listOrderItems(db, 'P3D-250101-LATE')).toMatchObject([
      { itemNo: 1, fileNo: 1, name: 'late.stl', infillPercent: 30, wallLoops: 3, support: 0, quantity: 2 },
    ])
    // đơn đã có dòng: giữ nguyên
    expect((await listOrderFiles(db, CODE)).map((f) => f.fileNo)).toEqual([0, 1, 2])
    expect((await listOrderItems(db, CODE)).map((i) => i.itemNo)).toEqual([1, 2])
    // chạy lại lần nữa: không trùng
    applyMigration(db, '0004')
    expect(await listOrderFiles(db, 'P3D-250101-LATE')).toHaveLength(1)
    expect(await listOrderItems(db, 'P3D-250101-LATE')).toHaveLength(1)
  })
})

describe('orderRepo multi-file', () => {
  it('insertOrder writes files and items', async () => {
    const db = createFakeD1()
    await insertOrder(db, row(), twoSourcesAndPlate(), [item(1, 1), item(2, 2)])
    expect((await listOrderFiles(db, CODE)).map((f) => f.fileNo)).toEqual([0, 1, 2])
    expect((await listOrderItems(db, CODE)).map((i) => i.itemNo)).toEqual([1, 2])
    expect((await getOrder(db, CODE))?.code).toBe(CODE)
  })

  it('setFileSaved updates one file and the aggregate', async () => {
    const db = createFakeD1()
    await insertOrder(db, row(), twoSourcesAndPlate(), [item(1, 1), item(2, 2)])
    expect(await setFileSaved(db, CODE, 1, 'https://d/1', 'https://d/folder')).toBe(true)
    expect((await getOrder(db, CODE))?.fileStatus).toBe('pending')
    expect(await setFileSaved(db, CODE, 2, 'https://d/2', 'https://d/folder')).toBe(true)
    const o = await getOrder(db, CODE)
    expect(o?.fileStatus).toBe('saved')
    expect(o?.driveUrl).toBe('https://d/folder')
    const files = await listOrderFiles(db, CODE)
    expect(files.find((f) => f.fileNo === 1)?.driveUrl).toBe('https://d/1')
    expect(files.find((f) => f.fileNo === 0)?.fileStatus).toBe('pending')
    // gọi lại: không còn file chờ
    expect(await setFileSaved(db, CODE, 2, 'https://d/2', 'https://d/folder')).toBe(false)
    // file bàn in không đổi tổng hợp
    expect(await setFileSaved(db, CODE, 0, 'https://d/0', 'https://d/folder')).toBe(true)
    expect((await getOrder(db, CODE))?.fileStatus).toBe('saved')
  })

  it('setFileSaved: plate saved first leaves aggregate pending', async () => {
    const db = createFakeD1()
    await insertOrder(db, row(), twoSourcesAndPlate(), [item(1, 1), item(2, 2)])
    await setFileSaved(db, CODE, 0, 'https://d/0', 'https://d/folder')
    expect((await getOrder(db, CODE))?.fileStatus).toBe('pending')
  })

  it('setFileSaved: two saves in either order end saved', async () => {
    for (const order of [[1, 2], [2, 1]]) {
      const db = createFakeD1()
      await insertOrder(db, row(), twoSourcesAndPlate(), [item(1, 1), item(2, 2)])
      for (const n of order) await setFileSaved(db, CODE, n, `https://d/${n}`, 'https://d/folder')
      expect((await getOrder(db, CODE))?.fileStatus).toBe('saved')
    }
  })

  it('setFileSaved: zalo order stays zalo', async () => {
    const db = createFakeD1()
    await insertOrder(db, row({ fileStatus: 'zalo' }), [file(1, { fileDelivery: 'zalo', fileStatus: 'zalo' }), file(2)], [item(1, 1)])
    await setFileSaved(db, CODE, 2, 'https://d/2', 'https://d/folder')
    expect((await getOrder(db, CODE))?.fileStatus).toBe('zalo')
  })

  it('deleteOrder removes files and items', async () => {
    const db = createFakeD1()
    await insertOrder(db, row(), twoSourcesAndPlate(), [item(1, 1)])
    await deleteOrder(db, CODE)
    expect(await getOrder(db, CODE)).toBeNull()
    expect(await listOrderFiles(db, CODE)).toEqual([])
    expect(await listOrderItems(db, CODE)).toEqual([])
  })
})

describe('aggregateFileStatus', () => {
  const f = (role: 'source' | 'plate', fileStatus: 'pending' | 'saved' | 'zalo', fileDelivery: 'upload' | 'zalo' = 'upload') =>
    ({ role, fileStatus, fileDelivery })
  it('ignores plate', () => {
    expect(aggregateFileStatus([f('source', 'saved'), f('plate', 'pending')])).toBe('saved')
    expect(aggregateFileStatus([f('source', 'saved'), f('source', 'pending'), f('plate', 'saved')])).toBe('pending')
    expect(aggregateFileStatus([f('source', 'zalo', 'zalo'), f('source', 'zalo', 'zalo')])).toBe('zalo')
    expect(aggregateFileStatus([f('plate', 'pending')])).toBe('saved')
  })
})
