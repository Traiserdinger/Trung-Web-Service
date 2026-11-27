import { describe, expect, it } from 'vitest'
import { materials } from '../config/pricingConfig'
import { computeTimeFee, priceCombined, priceQuote, roundPrice } from './pricing'

describe('computeTimeFee', () => {
  it('is free up to 30 minutes, then 5.000đ per hour for the whole print, by the minute', () => {
    const fees = [0, 30, 31, 60, 90, 120].map((m) => computeTimeFee(m))
    expect(fees[0]).toBe(0)
    expect(fees[1]).toBe(0)
    expect(fees[2]).toBeCloseTo((31 * 5000) / 60)
    expect(fees.slice(3)).toEqual([5000, 7500, 10000])
  })
})

describe('roundPrice', () => {
  it('rounds to the nearest thousand: under 500đ down, 500đ and up up', () => {
    expect([37_000, 37_499, 37_499.99, 37_500, 37_501, 37_999].map((x) => roundPrice(x))).toEqual([
      37_000, 37_000, 37_000, 38_000, 38_000, 38_000,
    ])
  })
})

describe('priceQuote', () => {
  it('100 g, 2 hours of PETG at 0.20 mm', () => {
    // (45.000 + 10.000) × 1,05 = 57.750 → 58.000
    expect(priceQuote({ grams: 100, timeSec: 7200 }, materials.PETG)).toEqual({
      materialCost: 45000,
      minutes: 120,
      timeFee: 10000,
      total: 58000,
      rangeLow: 46000,
      rangeHigh: 70000,
    })
  })

  it('applies the layer-height quality tier on top of material and time', () => {
    const e = { grams: 100, timeSec: 7200 }
    const total = (h: 0.08 | 0.12 | 0.16 | 0.2 | 0.28) => priceQuote(e, materials.PETG, h)!.total
    expect(total(0.28)).toBe(52000) // 55.000 × 0,9 × 1,05 = 51.975
    expect(total(0.2)).toBe(58000) // × 1
    expect(total(0.16)).toBe(65000) // × 1,12 → 64.680
    expect(total(0.12)).toBe(69000) // × 1,2 → 69.300
    expect(total(0.08)).toBe(75000) // × 1,3 → 75.075
  })

  it('shows a 1.000đ step for a 2 g difference', () => {
    const a = priceQuote({ grams: 60, timeSec: 1500 }, materials.PETG)!.total
    const b = priceQuote({ grams: 62, timeSec: 1500 }, materials.PETG)!.total
    expect([a, b]).toEqual([28000, 29000])
  })

  it('small part hits the minimum order', () => {
    const q = priceQuote({ grams: 1.6317, timeSec: 569.54 }, materials.PETG)
    expect(q?.total).toBe(20000)
    expect(q?.rangeLow).toBe(20000)
    expect(q?.rangeHigh).toBe(24000)
  })

  it('contact-only material has no price', () => {
    expect(priceQuote({ grams: 100, timeSec: 7200 }, materials.ABS)).toBeNull()
  })
})

describe('priceCombined', () => {
  it('adds per-item fee after margin and uses combined minimum', () => {
    // (18.000 + 100 phút × 5.000/60) × 1,05 + 7.000 = 34.650 → 35.000
    const q = priceCombined({ grams: 40, timeSec: 6000 }, materials.PETG, 3)!
    expect(q.total).toBe(35000)
    expect(q.rangeLow).toBe(30000)
    expect(q.rangeHigh).toBe(42000)
    expect(priceCombined({ grams: 5, timeSec: 600 }, materials.PETG, 2)!.total).toBe(30000)
    expect(priceCombined({ grams: 5, timeSec: 600 }, materials.ABS, 2)).toBeNull()
  })

  it('applies the shared layer-height tier', () => {
    const e = { grams: 40, timeSec: 6000 }
    expect(priceCombined(e, materials.PETG, 3, 0.12)!.total).toBe(40000) // 26.333 × 1,2 × 1,05 + 7.000 = 40.180
  })
})
