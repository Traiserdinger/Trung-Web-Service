import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import * as api from './adminApi.ts'
import { OrdersList } from './OrdersList.tsx'

vi.mock('./adminApi.ts')

const base = { orderType: 'print', customerPhone: '0901234567', colorName: 'Đen', colorHex: '#1f1f1f', status: 'received' as const, statusUpdatedAt: '2026-11-24T01:00:00Z', createdAt: '2026-11-24T01:00:00Z' }

it("hiện badge 'Chưa có file' cho đơn pending", async () => {
  vi.mocked(api.listOrders).mockResolvedValue({
    total: 2, page: 1, pageSize: 30,
    orders: [
      { ...base, code: 'P3D-261124-AAAA', customerName: 'An', fileStatus: 'pending' },
      { ...base, code: 'P3D-261124-BBBB', customerName: 'Bình', fileStatus: 'saved' },
    ],
  })
  render(<OrdersList />)
  expect(await screen.findByText('Chưa có file')).toBeInTheDocument()
  expect(screen.getAllByText('Chưa có file')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Tất cả' })).toBeInTheDocument()
})

it('401 → hiện "Phiên đăng nhập hết hạn"', async () => {
  vi.mocked(api.listOrders).mockRejectedValue(new Error(api.SESSION_EXPIRED))
  render(<OrdersList />)
  expect(await screen.findByText(/Phiên đăng nhập hết hạn/)).toBeInTheDocument()
})
