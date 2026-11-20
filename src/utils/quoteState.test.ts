import { describe, expect, it } from 'vitest'
import type { MeshStats } from './meshAnalysis'
import { computeQuoteState } from './quoteState'
import type { PrintSettings } from './slicerEstimator'

const cube: MeshStats = {
  dims: { length: 10, width: 10, height: 10 },
  surfaceArea: 600,
  volume: 1000,
  signedVolume: 1000,
  isWatertight: true,
  overhangArea: 0,
  triangleCount: 12,
}
const settings: PrintSettings = {
  material: 'PETG',
  layerHeight: 0.2,
  infillPercent: 15,
  wallLoops: 2,
  support: false,
  quantity: 1,
}

describe('computeQuoteState', () => {
  it('PETG cube is a priced quote at the minimum order', () => {
    const q = computeQuoteState(cube, settings)
    expect(q.orderType).toBe('quote')
    expect(q.consultReasons).toEqual([])
    expect(q.price?.total).toBe(20000)
  })

  it('ABS becomes a consult order with no estimate or price', () => {
    expect(computeQuoteState(cube, { ...settings, material: 'ABS' })).toEqual({
      orderType: 'consult',
      consultReasons: ['ABS'],
      estimate: null,
      price: null,
    })
  })

  it('oversized model becomes a consult order naming its size', () => {
    const big = { ...cube, dims: { length: 210, width: 90, height: 40 } }
    const q = computeQuoteState(big, settings)
    expect(q.orderType).toBe('consult')
    expect(q.consultReasons).toEqual(['Vượt khổ: 210 × 90 × 40 mm'])
    expect(q.price).toBeNull()
  })

  it('oversize reason rounds up so 180.3 mm never reads as 180', () => {
    const q = computeQuoteState({ ...cube, dims: { length: 180.3, width: 90, height: 40 } }, settings)
    expect(q.consultReasons).toEqual(['Vượt khổ: 180,3 × 90 × 40 mm'])
  })
})
