import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import * as api from './adminApi.ts'
import { OrderDetail } from './OrderDetail.tsx'

vi.mock('./adminApi.ts')

const order: api.OrderRow = {
  code: 'P3D-261124-AAAA', createdAt: '2026-11-24T01:00:00Z', orderType: 'print', consultReasons: null,
  customerName: 'An', customerPhone: '0901234567', customerEmail: 'an@example.com', customerNote: null,
  settings: null, dims: null, surfaceArea: null, volume: null, scale: null, estimate: null, colorId: 1,
  colorName: 'Đen', colorHex: '#1f1f1f', fileName: 'a.stl', fileSize: 10, fileDelivery: 'drive', fileStatus: 'saved',
  driveUrl: 'javascript:alert(1)', fingerprint: null, status: 'received', statusUpdatedAt: '2026-11-24T01:00:00Z',
}
const ev0: api.OrderEvent = { id: 1, orderCode: order.code, status: 'received', note: null, createdAt: '2026-11-24T01:00:00Z', emailSent: null }

it("đổi sang 'Đang giao hàng' + ghi chú → setStatus và timeline thêm dòng", async () => {
  vi.mocked(api.getOrder).mockResolvedValue({ order, events: [ev0], files: [], items: [] })
  vi.mocked(api.setStatus).mockResolvedValue({ event: { ...ev0, id: 2, status: 'shipping', note: 'GHN 123', emailSent: 1 } })
  const u = userEvent.setup()
  render(<OrderDetail code={order.code} />)
  await screen.findByText('Dòng thời gian')
  await u.selectOptions(screen.getByLabelText('Trạng thái mới'), 'shipping')
  await u.type(screen.getByLabelText('Ghi chú'), 'GHN 123')
  await u.click(screen.getByRole('button', { name: 'Cập nhật' }))
  expect(api.setStatus).toHaveBeenCalledWith(order.code, 'shipping', 'GHN 123')
  expect(await screen.findByText('GHN 123')).toBeInTheDocument()
  expect(screen.getByText('Email đã gửi')).toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByText(/khách sẽ thấy/)).toBeInTheDocument()
})

it('nút xoá chỉ bật khi gõ đúng mã', async () => {
  vi.mocked(api.getOrder).mockResolvedValue({ order, events: [ev0], files: [], items: [] })
  const u = userEvent.setup()
  render(<OrderDetail code={order.code} />)
  await u.click(await screen.findByRole('button', { name: 'Xoá đơn rác' }))
  const del = screen.getByRole('button', { name: 'Xoá đơn' })
  expect(del).toBeDisabled()
  await u.type(screen.getByLabelText('Mã đơn xác nhận'), 'P3D-261124-AAA')
  expect(del).toBeDisabled()
  await u.type(screen.getByLabelText('Mã đơn xác nhận'), 'A')
  expect(del).toBeEnabled()
})

it('driveUrl không phải https thì không thành link', async () => {
  vi.mocked(api.getOrder).mockResolvedValue({ order, events: [ev0], files: [], items: [] })
  render(<OrderDetail code={order.code} />)
  await screen.findByText('Dòng thời gian')
  expect(screen.queryByRole('link', { name: /javascript/ })).toBeNull()
})

it('đổi code mà tải lỗi → không còn hiện đơn cũ', async () => {
  vi.mocked(api.getOrder).mockReset().mockResolvedValueOnce({ order, events: [ev0], files: [], items: [] }).mockRejectedValueOnce(new Error('Lỗi 404'))
  const { rerender } = render(<OrderDetail code={order.code} />)
  await screen.findByText('Dòng thời gian')
  rerender(<OrderDetail code="P3D-261124-ZZZZ" />)
  expect(await screen.findByText('Lỗi 404')).toBeInTheDocument()
  expect(screen.queryByText('Dòng thời gian')).toBeNull()
  expect(screen.queryByText(order.code)).toBeNull()
})
