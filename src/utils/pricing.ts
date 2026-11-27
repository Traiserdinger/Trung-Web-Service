import { pricingRules, type LayerHeight, type MaterialConfig, type PricingRules } from '../config/pricingConfig'
import type { PrintEstimate } from './slicerEstimator'

export interface PriceQuote {
  materialCost: number
  minutes: number
  timeFee: number
  total: number
  rangeLow: number
  rangeHigh: number
}

/** In ≤ freeMinutes thì miễn phí; lâu hơn thì tính theo phút cho toàn bộ thời gian in. */
export function computeTimeFee(minutes: number, r: PricingRules = pricingRules): number {
  if (minutes <= r.freeMinutes) return 0
  return (minutes * r.timeRatePerHour) / 60
}

/** Làm tròn về bội số gần nhất của step: phần lẻ dưới một nửa thì xuống, từ một nửa trở lên thì lên. */
export function roundPrice(x: number, step: number = pricingRules.roundTo): number {
  // Bù sai số số thực để 37.499,9999… không bị đẩy lên và 37.500 luôn lên
  return Math.floor(x / step + 0.5 + 1e-9) * step
}

function quote(
  e: Pick<PrintEstimate, 'grams' | 'timeSec'>,
  m: MaterialConfig,
  layerHeight: LayerHeight,
  r: PricingRules,
  minimum: number,
  extraFee: number,
): PriceQuote | null {
  if (m.contactOnly || m.pricePerGram === null) return null
  const materialCost = e.grams * m.pricePerGram
  const minutes = Math.ceil(e.timeSec / 60)
  const timeFee = computeTimeFee(minutes, r)
  const quality = r.layerQuality[layerHeight] ?? 1
  const total = Math.max(minimum, roundPrice((materialCost + timeFee) * quality * r.safetyMargin + extraFee, r.roundTo))
  const spread = r.rangePercent / 100
  return {
    materialCost,
    minutes,
    timeFee,
    total,
    rangeLow: Math.max(minimum, roundPrice(total * (1 - spread), r.roundTo)),
    rangeHigh: roundPrice(total * (1 + spread), r.roundTo),
  }
}

export function priceQuote(
  e: Pick<PrintEstimate, 'grams' | 'timeSec'>,
  m: MaterialConfig,
  layerHeight: LayerHeight = 0.2,
  r: PricingRules = pricingRules,
): PriceQuote | null {
  return quote(e, m, layerHeight, r, r.minimumOrder, 0)
}

/** Giá cho một bàn in nhiều món: phí theo món cộng sau hệ số an toàn, mức tối thiểu riêng. */
export function priceCombined(
  e: Pick<PrintEstimate, 'grams' | 'timeSec'>,
  m: MaterialConfig,
  itemCount: number,
  layerHeight: LayerHeight = 0.2,
  r: PricingRules = pricingRules,
): PriceQuote | null {
  return quote(e, m, layerHeight, r, r.combinedMinimumOrder, Math.max(0, itemCount - 1) * r.perItemFee)
}
