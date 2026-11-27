import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { OrderFileRow, OrderItemRow, OrderRow } from '../adminApi.ts'
import { fileLabel } from '../format.ts'
import { PrintSheet } from './PrintSheet.tsx'

const order = {
  code: 'P3D-1', createdAt: '2026-11-24T01:00:00Z', colorName: 'Đen',
  settings: JSON.stringify({ material: 'PLA', layerHeight: 0.2 }),
  estimate: JSON.stringify({ grams: 42, timeSec: 5400 }),
} as OrderRow

const file = (o: Partial<OrderFileRow>): OrderFileRow => ({
  orderCode: 'P3D-1', fileNo: 1, role: 'source', fileName: 'a.stl', fileSize: 10, fileType: 'stl',
  fileDelivery: 'upload', fileStatus: 'saved', driveUrl: 'https://drive.google.com/a', ...o,
})
const item = (o: Partial<OrderItemRow>): OrderItemRow => ({
  orderCode: 'P3D-1', itemNo: 1, fileNo: 1, name: 'Móc', dims: JSON.stringify({ length: 20, width: 10, height: 5 }),
  volume: 1, surfaceArea: 1, scale: 1, orient: null, infillPercent: 20, wallLoops: 2, support: 0, quantity: 2,
  placements: null, footprint: null, ...o,
})
const sq = JSON.stringify([[0, 0], [20, 0], [20, 10], [0, 10]])
const pl = JSON.stringify([{ x: 10, y: 10, rotDeg: 0 }, { x: 50, y: 10, rotDeg: 90 }])

it('renders a row per item with Drive links', () => {
  const files = [file({}), file({ fileNo: 2, driveUrl: 'javascript:alert(1)' }), file({ fileNo: 0, role: 'plate', fileName: '00-ban-in.3mf', driveUrl: 'https://drive.google.com/plate' })]
  const items = [item({}), item({ itemNo: 2, fileNo: 1, name: 'Nắp' }), item({ itemNo: 3, fileNo: 2, name: 'Đế', support: 1 })]
  render(<PrintSheet order={order} files={files} items={items} />)
  expect(screen.getByText(/BÀN IN · PLA · lớp 0,2 · Đen · ~1 giờ 30 phút · 42g/)).toBeInTheDocument()
  const rows = screen.getAllByRole('row').slice(1)
  expect(rows).toHaveLength(3)
  expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', 'https://drive.google.com/a')
  expect(within(rows[1]).getByRole('link')).toHaveAttribute('href', 'https://drive.google.com/a')
  expect(within(rows[2]).queryByRole('link')).toBeNull()
  expect(within(rows[2]).getByText('Đã lưu')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Tải file bàn in .3mf' })).toHaveAttribute('href', 'https://drive.google.com/plate')
})

it('flags an inch item next to its dimensions', () => {
  render(<PrintSheet order={order} files={[file({})]} items={[item({}), item({ itemNo: 2, scale: 25.4 })]} />)
  const rows = screen.getAllByRole('row').slice(1)
  expect(within(rows[0]).queryByText(/inch/)).toBeNull()
  expect(within(rows[1]).getByText('inch×25,4')).toBeInTheDocument()
})

it('draws one hull per placement with item numbers', () => {
  const { container } = render(<PrintSheet order={order} files={[file({})]} items={[item({ placements: pl, footprint: sq })]} />)
  expect(container.querySelectorAll('svg polygon[data-hull]')).toHaveLength(2)
  expect(container.querySelectorAll('svg text')).toHaveLength(2)
})

it('old order shows table without plate svg', () => {
  const { container } = render(<PrintSheet order={order} files={[file({})]} items={[item({})]} />)
  expect(container.querySelector('svg')).toBeNull()
  expect(screen.getAllByRole('row')).toHaveLength(2)
})

it('shows Không có file bàn in when plate missing', () => {
  render(<PrintSheet order={order} files={[file({})]} items={[item({})]} />)
  expect(screen.getByText('Không có file bàn in')).toBeInTheDocument()
})

it('fileLabel turns pending into Chưa nhận file after 30 minutes', () => {
  const t0 = '2026-11-24T01:00:00Z'
  const now = Date.parse(t0)
  const p = { fileStatus: 'pending' as const, fileDelivery: 'upload' as const }
  expect(fileLabel(p, t0, now + 10 * 60_000)).toBe('Đang tải')
  expect(fileLabel(p, t0, now + 31 * 60_000)).toBe('Chưa nhận file')
  expect(fileLabel({ fileStatus: 'saved', fileDelivery: 'upload' }, t0, now)).toBe('Đã lưu')
  expect(fileLabel({ fileStatus: 'zalo', fileDelivery: 'zalo' }, t0, now)).toBe('Gửi qua Zalo')
})
