import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PrintSettings } from '../../utils/slicerEstimator'
import { DEFAULT_COLORS } from '../../config/colorConfig'
import { OptionsPanel } from './OptionsPanel'

const base: PrintSettings = {
  material: 'PETG',
  layerHeight: 0.2,
  infillPercent: 15,
  wallLoops: 2,
  support: false,
  quantity: 1,
}

const colorProps = { colors: DEFAULT_COLORS, colorId: 1, onColorChange: () => {} }

describe('OptionsPanel', () => {
  it('shows four color buttons with aria-pressed and reports the pick', async () => {
    const onColorChange = vi.fn()
    render(<OptionsPanel value={base} onChange={vi.fn()} supportReason={null} {...colorProps} onColorChange={onColorChange} />)
    const group = screen.getByRole('group', { name: 'Màu' })
    expect(within(group).getAllByRole('button')).toHaveLength(4)
    expect(within(group).getByRole('button', { name: 'Đen' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'Nâu' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(within(group).getByRole('button', { name: 'Nâu' }))
    expect(onColorChange).toHaveBeenCalledWith(4)
  })

  it('shows the selected color name as visible caption', () => {
    render(<OptionsPanel value={base} onChange={vi.fn()} supportReason={null} {...colorProps} colorId={4} />)
    expect(screen.getByText('Màu: Nâu')).toBeInTheDocument()
  })

  it('disables the color buttons when disabled', () => {
    render(<OptionsPanel value={base} onChange={vi.fn()} supportReason={null} disabled {...colorProps} />)
    for (const b of within(screen.getByRole('group', { name: 'Màu' })).getAllByRole('button')) expect(b).toBeDisabled()
  })

  it('does not go above 50 copies', async () => {
    const onChange = vi.fn()
    render(<OptionsPanel {...colorProps} value={{ ...base, quantity: 50 }} onChange={onChange} supportReason={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Tăng số lượng' }))
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ quantity: 51 }))
  })

  it('does not go below 1 copy', async () => {
    const onChange = vi.fn()
    render(<OptionsPanel {...colorProps} value={base} onChange={onChange} supportReason={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Giảm số lượng' }))
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ quantity: 0 }))
  })

  it('selects a layer height', async () => {
    const onChange = vi.fn()
    render(<OptionsPanel {...colorProps} value={base} onChange={onChange} supportReason={null} />)
    await userEvent.click(screen.getByRole('button', { name: /0\.28/ }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ layerHeight: 0.28 }))
  })

  it('labels ABS as contact-only and shows the support reason', () => {
    render(<OptionsPanel {...colorProps} value={base} onChange={vi.fn()} supportReason="Phát hiện ~3.0 cm² mặt treo" />)
    expect(screen.getByRole('button', { name: /ABS.*Liên hệ/ })).toBeInTheDocument()
    expect(screen.getByText('Phát hiện ~3.0 cm² mặt treo')).toBeInTheDocument()
  })
})
