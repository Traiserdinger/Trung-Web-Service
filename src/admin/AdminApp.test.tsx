import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import * as api from './adminApi.ts'
import { AdminApp } from './AdminApp.tsx'

vi.mock('./adminApi.ts', async (orig) => ({ ...(await orig<typeof api>()), checkSession: vi.fn(), logout: vi.fn(), requestCode: vi.fn(), verifyCode: vi.fn(), listOrders: vi.fn(), getOrder: vi.fn(), listColors: vi.fn() }))

const emptyList = { orders: [], total: 0, page: 1, pageSize: 30 }
beforeEach(() => {
  vi.resetAllMocks()
  window.location.hash = ''
})

it("checkSession false → hiện 'Đăng nhập quản trị'", async () => {
  vi.mocked(api.checkSession).mockResolvedValue(false)
  render(<AdminApp />)
  expect(await screen.findByRole('heading', { name: 'Đăng nhập quản trị' })).toBeInTheDocument()
  expect(api.listOrders).not.toHaveBeenCalled()
})

it('checkSession true → hiện danh sách đơn', async () => {
  vi.mocked(api.checkSession).mockResolvedValue(true)
  vi.mocked(api.listOrders).mockResolvedValue(emptyList)
  render(<AdminApp />)
  expect(await screen.findByText('Không có đơn nào.')).toBeInTheDocument()
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
