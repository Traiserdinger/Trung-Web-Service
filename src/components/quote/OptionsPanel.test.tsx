import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PrintSettings } from '../../utils/slicerEstimator'
import { OptionsPanel } from './OptionsPanel'

const base: PrintSettings = {
  material: 'PETG',
  layerHeight: 0.2,
  infillPercent: 15,
  wallLoops: 2,
  support: false,
  quantity: 1,
}

describe('OptionsPanel', () => {
  it('does not go above 50 copies', async () => {
    const onChange = vi.fn()
    render(<OptionsPanel value={{ ...base, quantity: 50 }} onChange={onChange} supportReason={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Tăng số lượng' }))
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ quantity: 51 }))
  })

  it('does not go below 1 copy', async () => {
    const onChange = vi.fn()
    render(<OptionsPanel value={base} onChange={onChange} supportReason={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Giảm số lượng' }))
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ quantity: 0 }))
  })

  it('selects a layer height', async () => {
    const onChange = vi.fn()
    render(<OptionsPanel value={base} onChange={onChange} supportReason={null} />)
    await userEvent.click(screen.getByRole('button', { name: /0\.28/ }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ layerHeight: 0.28 }))
  })

  it('labels ABS as contact-only and shows the support reason', () => {
    render(<OptionsPanel value={base} onChange={vi.fn()} supportReason="Phát hiện ~3.0 cm² mặt treo" />)
    expect(screen.getByRole('button', { name: /ABS.*Liên hệ/ })).toBeInTheDocument()
    expect(screen.getByText('Phát hiện ~3.0 cm² mặt treo')).toBeInTheDocument()
  })
})
