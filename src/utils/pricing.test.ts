import { describe, expect, it } from 'vitest'
import { materials } from '../config/pricingConfig'
import { computeTimeFee, priceQuote } from './pricing'

describe('computeTimeFee', () => {
  it('is free up to 30 minutes, then 1.850đ per whole 30-minute block', () => {
    expect([0, 30, 31, 59, 60, 120].map((m) => computeTimeFee(m))).toEqual([0, 0, 1850, 1850, 3700, 7400])
  })
})

describe('priceQuote', () => {
  it('100 g, 2 hours of PETG', () => {
    expect(priceQuote({ grams: 100, timeSec: 7200 }, materials.PETG)).toEqual({
      materialCost: 45000,
      minutes: 120,
      timeFee: 7400,
      total: 56000,
      rangeLow: 45000,
      rangeHigh: 67000,
    })
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
