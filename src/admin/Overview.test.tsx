import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { OrderListItem, Stats } from './adminApi.ts'
import { Overview } from './Overview.tsx'
import { StatsContext } from './statsContext.ts'

const item = (over: Partial<OrderListItem>): OrderListItem => ({
  code: 'P3D-261124-AAAA', createdAt: '2026-11-20T01:00:00Z', orderType: 'quote', customerName: 'Nguyễn An',
  customerPhone: '0901234567', colorName: 'Đỏ', colorHex: '#c62828', fileStatus: null, status: 'received',
  statusUpdatedAt: '2026-11-20T01:00:00Z', ...over,
})

const stats: Stats = {
  byStatus: { received: 3, paid: 0, printing: 2, shipping: 0, done: 12, cancelled: 1 },
  last7Days: 7, estimate30Days: 1_250_000, pendingFiles: 2,
  attention: [
    item({ code: 'P3D-261124-FILE', fileStatus: 'pending', customerName: 'Trần Bình' }),
    item({ code: 'P3D-261120-OLD1' }),
  ],
}

const renderWith = (s: Stats | null, error = '') =>
  render(
    <StatsContext.Provider value={{ stats: s, error, refresh: () => {} }}>
      <Overview />
    </StatsContext.Provider>,
  )

it('dây chuyền hiện số đơn từng bước; bước có đơn được làm nổi, bước trống thì không', () => {
  renderWith(stats)
  const pipeline = screen.getByRole('list', { name: 'Dây chuyền đơn' })
  const steps = within(pipeline).getAllByRole('link')
  expect(steps.map((a) => a.getAttribute('aria-label'))).toEqual([
    'Đã nhận đơn: 3 đơn', 'Đã thanh toán: 0 đơn', 'Đang in 3D: 2 đơn', 'Đang giao hàng: 0 đơn', 'Hoàn tất: 12 đơn',
  ])
  expect(steps.map((a) => a.dataset.state)).toEqual(['busy', 'empty', 'busy', 'empty', 'filled'])
  expect(steps[0]).toHaveAttribute('href', '#/orders?status=received')
  expect(screen.getByRole('link', { name: 'Đã huỷ 1' })).toHaveAttribute('href', '#/orders?status=cancelled')
})

it('hàng datasheet lấy số từ stats', () => {
  renderWith(stats)
  const sheet = screen.getByText('Tạm tính 30 ngày').closest('dl')!
  expect(sheet).toHaveTextContent('1.250.000đ')
  expect(within(sheet).getByText('Đơn 7 ngày qua').nextSibling).toHaveTextContent('7')
  expect(within(sheet).getByText('Đơn chưa có file').nextSibling).toHaveTextContent('2')
  expect(within(sheet).getByText('Chờ thanh toán').nextSibling).toHaveTextContent('3')
})

it('danh sách Cần xử lý: link tới chi tiết, đơn chưa có file có badge', () => {
  renderWith(stats)
  const section = screen.getByRole('region', { name: 'Cần xử lý' })
  const links = within(section).getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('#/orders/'))
  expect(links.map((a) => a.getAttribute('href'))).toEqual(['#/orders/P3D-261124-FILE', '#/orders/P3D-261120-OLD1'])
  expect(within(links[0]).getByText('Chưa có file')).toBeInTheDocument()
  expect(within(links[1]).queryByText('Chưa có file')).toBeNull()
})

it('không còn việc tồn đọng → thông báo trống; lỗi tải → role=alert', () => {
  renderWith({ ...stats, attention: [] })
  expect(screen.getByText(/Không có việc tồn đọng/)).toBeInTheDocument()
  renderWith(null, 'Lỗi 500')
  expect(screen.getByRole('alert')).toHaveTextContent('Lỗi 500')
})
