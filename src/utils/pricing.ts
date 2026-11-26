import { pricingRules, type MaterialConfig, type PricingRules } from '../config/pricingConfig'
import type { PrintEstimate } from './slicerEstimator'

export interface PriceQuote {
  materialCost: number
  minutes: number
  timeFee: number
  total: number
  rangeLow: number
  rangeHigh: number
}

export function computeTimeFee(minutes: number, r: PricingRules = pricingRules): number {
  if (minutes <= r.freeMinutes) return 0
  return Math.floor(minutes / r.blockMinutes) * r.pricePerBlock
}

const ceilTo = (x: number, step: number) => Math.ceil(x / step - 1e-9) * step
const roundTo = (x: number, step: number) => Math.round(x / step) * step

function quote(
  e: Pick<PrintEstimate, 'grams' | 'timeSec'>,
  m: MaterialConfig,
  r: PricingRules,
  minimum: number,
  extraFee: number,
): PriceQuote | null {
  if (m.contactOnly || m.pricePerGram === null) return null
  const materialCost = e.grams * m.pricePerGram
  const minutes = Math.ceil(e.timeSec / 60)
  const timeFee = computeTimeFee(minutes, r)
  const total = Math.max(minimum, ceilTo((materialCost + timeFee) * r.safetyMargin + extraFee, r.roundTo))
  const spread = r.rangePercent / 100
  return {
    materialCost,
    minutes,
    timeFee,
    total,
    rangeLow: Math.max(minimum, roundTo(total * (1 - spread), r.roundTo)),
    rangeHigh: roundTo(total * (1 + spread), r.roundTo),
  }
}

export function priceQuote(
  e: Pick<PrintEstimate, 'grams' | 'timeSec'>,
  m: MaterialConfig,
  r: PricingRules = pricingRules,
): PriceQuote | null {
  return quote(e, m, r, r.minimumOrder, 0)
}

/** Giá cho một bàn in nhiều món: phí theo món cộng sau hệ số an toàn, mức tối thiểu riêng. */
export function priceCombined(
  e: Pick<PrintEstimate, 'grams' | 'timeSec'>,
  m: MaterialConfig,
  itemCount: number,
  r: PricingRules = pricingRules,
): PriceQuote | null {
  return quote(e, m, r, r.combinedMinimumOrder, Math.max(0, itemCount - 1) * r.perItemFee)
}
