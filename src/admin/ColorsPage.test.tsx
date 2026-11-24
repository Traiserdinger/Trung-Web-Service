import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import * as api from './adminApi.ts'
import { ColorsPage } from './ColorsPage.tsx'

vi.mock('./adminApi.ts')

const black: api.AdminColor = { id: 1, name: 'Đen', hex: '#1f1f1f', sort: 1, active: 1 }

it('đổi màu → patchColor(id,{hex}); thêm màu hợp lệ → createColor', async () => {
  vi.mocked(api.listColors).mockResolvedValue({ colors: [black] })
  vi.mocked(api.patchColor).mockResolvedValue({ color: { ...black, hex: '#112233' } })
  vi.mocked(api.createColor).mockResolvedValue({ color: { id: 5, name: 'Xanh', hex: '#0000ff', sort: 2, active: 1 } })
  const u = userEvent.setup()
  render(<ColorsPage />)
  fireEvent.input(await screen.findByLabelText('Màu Đen'), { target: { value: '#112233' } })
  expect(api.patchColor).toHaveBeenCalledWith(1, { hex: '#112233' })

  const add = screen.getByRole('button', { name: 'Thêm màu' })
  expect(add).toBeDisabled()
  await u.type(screen.getByLabelText('Tên màu'), 'Xanh')
  fireEvent.input(screen.getByLabelText('Mã màu'), { target: { value: '#0000ff' } })
  await u.click(add)
  expect(api.createColor).toHaveBeenCalledWith('Xanh', '#0000ff')
  expect(await screen.findByText('Xanh')).toBeInTheDocument()
})
