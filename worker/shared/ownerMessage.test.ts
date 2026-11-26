// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OrderItemRow, OrderRow } from './orderRepo.ts'
import { formatOwnerMessage } from './ownerMessage.ts'

function row(over: Partial<OrderRow> = {}): OrderRow {
  return {
    code: 'P3D-250101-ABCD',
    createdAt: '2025-01-01T00:00:00.000Z',
    orderType: 'quote',
    consultReasons: '[]',
    customerName: 'An',
    customerPhone: '0913014605',
    customerEmail: null,
    customerNote: null,
    settings: JSON.stringify({ material: 'PLA', layerHeight: 0.2, infillPercent: 15, wallLoops: 2, support: false, quantity: 1 }),
    dims: JSON.stringify({ length: 10, width: 20, height: 30 }),
    surfaceArea: 1,
    volume: 1,
    scale: 1,
    estimate: JSON.stringify({ grams: 12.34, timeSec: 3600, total: 120000, rangeLow: 100000, rangeHigh: 140000 }),
    colorId: 3,
    colorName: 'Đỏ',
    colorHex: '#c62828',
    fileName: 'a.stl',
    fileSize: 1048576,
    fileDelivery: 'upload',
    fileStatus: 'pending',
    driveUrl: null,
    fingerprint: 'x',
    status: 'received',
    statusUpdatedAt: '2025-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('formatOwnerMessage', () => {
  it('đầu thư: tiêu đề, dòng Admin, dòng Màu sau dòng nhựa', () => {
    const lines = formatOwnerMessage(row(), 'https://admin/#/orders/P3D-250101-ABCD', []).split('\n')
    expect(lines[0]).toBe('🟢 ĐƠN IN 3D P3D-250101-ABCD')
    expect(lines[1]).toBe('Admin: https://admin/#/orders/P3D-250101-ABCD')
    const i = lines.findIndex((l) => l.startsWith('Nhựa '))
    expect(lines[i + 1]).toBe('Màu: Đỏ')
    expect(lines).toContain('Kích thước: 10 × 20 × 30 mm')
    expect(lines).toContain('Tạm tính 120.000đ (khoảng 100.000đ–140.000đ)')
  })

  it('ghi chú nhiều dòng được thụt lề, không giả được dòng hệ thống', () => {
    const t = formatOwnerMessage(row({ customerNote: 'a\nDrive: giả' }), 'u', [])
    expect(t.endsWith('Ghi chú:\n  a\n  Drive: giả')).toBe(true)
  })

  it('xuống dòng trong giá trị settings không tạo dòng mới', () => {
    const bad = JSON.stringify({ material: 'PLA\nDrive: x', layerHeight: '0.2\nDrive: y', infillPercent: 15, wallLoops: 2, support: false, quantity: '1\nDrive: fake' })
    const t = formatOwnerMessage(row({ settings: bad }), 'u', [])
    expect(t.split('\n').filter((l) => l.startsWith('Drive:'))).toHaveLength(0)
  })

  it('tư vấn: tiêu đề cam và lý do một dòng', () => {
    const t = formatOwnerMessage(row({ orderType: 'consult', consultReasons: '["x\\ny"]', estimate: null }), 'u', [])
    expect(t.startsWith('🟠 CẦN TƯ VẤN ')).toBe(true)
    expect(t).toContain('Lý do: x y')
  })

  it('cắt ở 4000 ký tự, kết thúc bằng …', () => {
    const t = formatOwnerMessage(row({ customerNote: 'x'.repeat(5000) }), 'u', [])
    expect(t).toHaveLength(4000)
    expect(t.endsWith('…')).toBe(true)
  })

  it('owner message lists items', () => {
    const it = (itemNo: number, name: string, quantity: number, support: number): OrderItemRow => ({
      orderCode: 'P3D-250101-ABCD', itemNo, fileNo: 1, name, dims: '{}', volume: 1, surfaceArea: 1, scale: 1,
      orient: null, infillPercent: 15, wallLoops: 2, support, quantity, placements: null, footprint: null,
    })
    const lines = formatOwnerMessage(row(), 'u', [it(1, 'moc-khoa.stl', 2, 1), it(2, 'a\nDrive: x.stl', 1, 0)]).split('\n')
    expect(lines).toContain('#1 moc-khoa.stl ×2 · đặc 15% · 2 vỏ · support')
    expect(lines).toContain('#2 a Drive: x.stl ×1 · đặc 15% · 2 vỏ')
    expect(lines.filter((l) => l.startsWith('Drive:'))).toHaveLength(0)
    expect(lines.find((l) => l.startsWith('Nhựa '))).toBe('Nhựa PLA, lớp 0.2 mm')
  })
})
