import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import * as api from './adminApi.ts'
import { LoginPage } from './LoginPage.tsx'

vi.mock('./adminApi.ts')

beforeEach(() => vi.resetAllMocks())

it("bấm 'Gửi mã tới email' → requestCode gọi 1 lần, hiện message và ô 'Mã 6 số'", async () => {
  vi.mocked(api.requestCode).mockResolvedValue('Đã gửi mã nếu email hợp lệ')
  render(<LoginPage onLoggedIn={() => {}} />)
  expect(screen.getByRole('heading', { name: 'Đăng nhập quản trị' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Gửi mã tới email' }))
  expect(await screen.findByText('Đã gửi mã nếu email hợp lệ')).toBeInTheDocument()
  const input = screen.getByLabelText('Mã 6 số')
  expect(input).toHaveAttribute('inputmode', 'numeric')
  expect(input).toHaveAttribute('autocomplete', 'one-time-code')
  expect(api.requestCode).toHaveBeenCalledTimes(1)
})

it("nhập mã + 'Đăng nhập' → verifyCode('123456') → onLoggedIn", async () => {
  vi.mocked(api.requestCode).mockResolvedValue('ok')
  vi.mocked(api.verifyCode).mockResolvedValue()
  const onLoggedIn = vi.fn()
  render(<LoginPage onLoggedIn={onLoggedIn} />)
  await userEvent.click(screen.getByRole('button', { name: 'Gửi mã tới email' }))
  await userEvent.type(await screen.findByLabelText('Mã 6 số'), '123456')
  await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
  expect(api.verifyCode).toHaveBeenCalledWith('123456')
  await vi.waitFor(() => expect(onLoggedIn).toHaveBeenCalledTimes(1))
})

it('verifyCode lỗi → hiện trong role=alert, nút bật lại', async () => {
  vi.mocked(api.requestCode).mockResolvedValue('ok')
  vi.mocked(api.verifyCode).mockRejectedValue(new Error('Mã không đúng hoặc đã hết hạn'))
  render(<LoginPage onLoggedIn={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Gửi mã tới email' }))
  await userEvent.type(await screen.findByLabelText('Mã 6 số'), '000000')
  await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Mã không đúng hoặc đã hết hạn')
  expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeEnabled()
})

it('requestCode ném lỗi mạng → hiện lỗi, nút bật lại', async () => {
  vi.mocked(api.requestCode).mockRejectedValue(new Error('Failed to fetch'))
  render(<LoginPage onLoggedIn={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Gửi mã tới email' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch')
  expect(screen.getByRole('button', { name: 'Gửi mã tới email' })).toBeEnabled()
})

it("nhập '123 456' → verifyCode('123456')", async () => {
  vi.mocked(api.requestCode).mockResolvedValue('ok')
  vi.mocked(api.verifyCode).mockResolvedValue()
  render(<LoginPage onLoggedIn={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Gửi mã tới email' }))
  await userEvent.type(await screen.findByLabelText('Mã 6 số'), '123 456')
  await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
  expect(api.verifyCode).toHaveBeenCalledWith('123456')
})

it('nút bị khoá khi request đang chờ', async () => {
  vi.mocked(api.requestCode).mockImplementation(() => new Promise(() => {}))
  render(<LoginPage onLoggedIn={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Gửi mã tới email' }))
  expect(screen.getByRole('button', { name: 'Gửi mã tới email' })).toBeDisabled()
})
