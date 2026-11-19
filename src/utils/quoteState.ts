import { materials, printerConfig } from '../config/pricingConfig'
import { formatDims } from './format'
import { exceedsBed, type MeshStats } from './meshAnalysis'
import { priceQuote, type PriceQuote } from './pricing'
import { estimatePrint, type PrintEstimate, type PrintSettings } from './slicerEstimator'

export type OrderType = 'quote' | 'consult'

export interface QuoteState {
  orderType: OrderType
  consultReasons: string[]
  estimate: PrintEstimate | null
  price: PriceQuote | null
}

export function computeQuoteState(stats: MeshStats, s: PrintSettings): QuoteState {
  const reasons: string[] = []
  if (materials[s.material].contactOnly) reasons.push(s.material)
  if (exceedsBed(stats.dims, printerConfig.bed).exceeds) reasons.push(`Vượt khổ: ${formatDims(stats.dims)}`)
  if (reasons.length > 0) return { orderType: 'consult', consultReasons: reasons, estimate: null, price: null }

  const estimate = estimatePrint(stats, s)
  return { orderType: 'quote', consultReasons: [], estimate, price: priceQuote(estimate, materials[s.material]) }
}
