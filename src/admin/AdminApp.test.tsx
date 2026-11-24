import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import * as api from './adminApi.ts'
import { AdminApp } from './AdminApp.tsx'

vi.mock('./adminApi.ts', async (orig) => ({ ...(await orig<typeof api>()), checkSession: vi.fn(), logout: vi.fn(), requestCode: vi.fn(), verifyCode: vi.fn(), listOrders: vi.fn(), getOrder: vi.fn(), listColors: vi.fn(), getStats: vi.fn() }))

const emptyList = { orders: [], total: 0, page: 1, pageSize: 30 }
const stats: api.Stats = {
  byStatus: { received: 3, paid: 1, printing: 2, shipping: 0, done: 12, cancelled: 1 },
  last7Days: 5, estimate30Days: 1_250_000, pendingFiles: 0, attention: [],
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getStats).mockResolvedValue(stats)
  window.location.hash = ''
})

it("checkSession false → hiện 'Đăng nhập quản trị'", async () => {
  vi.mocked(api.checkSession).mockResolvedValue(false)
  render(<AdminApp />)
  expect(await screen.findByRole('heading', { name: 'Đăng nhập quản trị' })).toBeInTheDocument()
  expect(api.listOrders).not.toHaveBeenCalled()
})

it('không có hash → mặc định là Tổng quan, menu đánh dấu đúng mục', async () => {
  vi.mocked(api.checkSession).mockResolvedValue(true)
  render(<AdminApp />)
  expect(await screen.findByRole('heading', { name: 'Tổng quan', level: 1 })).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Đã nhận đơn: 3 đơn' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page')
  expect(api.listOrders).not.toHaveBeenCalled()
})

it('#/orders → danh sách đơn, tab có số đếm từ stats', async () => {
  window.location.hash = '#/orders'
  vi.mocked(api.checkSession).mockResolvedValue(true)
  vi.mocked(api.listOrders).mockResolvedValue(emptyList)
  render(<AdminApp />)
  expect(await screen.findByText('Không có đơn nào.')).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: /^Tất cả\W+19$/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: /^Đã huỷ\W+1$/ })).toBeInTheDocument()
})

it('#/orders?status=paid → lọc sẵn theo trạng thái', async () => {
  window.location.hash = '#/orders?status=paid'
  vi.mocked(api.checkSession).mockResolvedValue(true)
  vi.mocked(api.listOrders).mockResolvedValue(emptyList)
  render(<AdminApp />)
  await vi.waitFor(() => expect(api.listOrders).toHaveBeenCalledWith({ status: 'paid', q: '', page: 1 }))
})

it('trang con gặp SESSION_EXPIRED → LoginPage, giữ hash; đăng nhập lại → chi tiết đơn đó', async () => {
  const code = 'P3D-261124-AAAA'
  window.location.hash = `#/orders/${code}`
  vi.mocked(api.checkSession).mockResolvedValue(true)
  vi.mocked(api.getOrder).mockRejectedValueOnce(new Error(api.SESSION_EXPIRED))
  vi.mocked(api.requestCode).mockResolvedValue('ok')
  vi.mocked(api.verifyCode).mockResolvedValue()
  render(<AdminApp />)
  expect(await screen.findByRole('heading', { name: 'Đăng nhập quản trị' })).toBeInTheDocument()
  expect(window.location.hash).toBe(`#/orders/${code}`)
  vi.mocked(api.getOrder).mockImplementation(() => new Promise(() => {}))
  await userEvent.click(screen.getByRole('button', { name: 'Gửi mã tới email' }))
  await userEvent.type(await screen.findByLabelText('Mã 6 số'), '123456')
  await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
  await vi.waitFor(() => expect(api.getOrder).toHaveBeenLastCalledWith(code))
  expect(screen.queryByRole('heading', { name: 'Đăng nhập quản trị' })).not.toBeInTheDocument()
})

it('Đăng xuất → logout gọi, hiện LoginPage', async () => {
  vi.mocked(api.checkSession).mockResolvedValue(true)
  vi.mocked(api.listOrders).mockResolvedValue(emptyList)
  vi.mocked(api.logout).mockResolvedValue()
  render(<AdminApp />)
  await userEvent.click(await screen.findByRole('button', { name: 'Đăng xuất' }))
  expect(api.logout).toHaveBeenCalledTimes(1)
  expect(await screen.findByRole('heading', { name: 'Đăng nhập quản trị' })).toBeInTheDocument()
})
