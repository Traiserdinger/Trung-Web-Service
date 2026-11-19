import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MeshStats } from '../../utils/meshAnalysis'
import type { QuoteState } from '../../utils/quoteState'
import { QuoteResult } from './QuoteResult'

const stats: MeshStats = {
  dims: { length: 10, width: 10, height: 10 },
  surfaceArea: 600,
  volume: 1000,
  signedVolume: 1000,
  isWatertight: true,
  overhangArea: 0,
  triangleCount: 12,
}

const quote: QuoteState = {
  orderType: 'quote',
  consultReasons: [],
  estimate: {
    grams: 27.3,
    timeSec: 3900,
    layers: 50,
    plates: 1,
    copiesPerPlate: 1,
    shellVolume: 594,
    infillVolume: 60.9,
    partVolume: 654.9,
  },
  price: { materialCost: 12285, minutes: 65, timeFee: 3700, total: 32000, rangeLow: 26000, rangeHigh: 39000 },
}

describe('QuoteResult', () => {
  it('shows the estimate, price range and the print button for a quote', () => {
    render(<QuoteResult quote={quote} stats={stats} onSubmit={vi.fn()} />)
    expect(screen.getByText(/Tạm tính: 32\.000đ/)).toBeInTheDocument()
    expect(screen.getByText(/khoảng 26\.000đ – 39\.000đ/)).toBeInTheDocument()
    expect(screen.getByText(/1 giờ 05 phút/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu in' })).toBeInTheDocument()
  })

  it('shows reasons and the consult button, without a price, for a consult order', () => {
    const consult: QuoteState = { orderType: 'consult', consultReasons: ['ABS'], estimate: null, price: null }
    render(<QuoteResult quote={consult} stats={stats} onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu tư vấn' })).toBeInTheDocument()
    expect(screen.queryByText(/Tạm tính/)).not.toBeInTheDocument()
    expect(screen.getByText(/ABS/)).toBeInTheDocument()
  })
})
