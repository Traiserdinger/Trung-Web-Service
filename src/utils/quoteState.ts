import { materials, printerConfig } from '../config/pricingConfig'
import { exceedsBed, type Dims, type MeshStats } from './meshAnalysis'
import { priceQuote, type PriceQuote } from './pricing'
import { estimatePrint, type PrintEstimate, type PrintSettings } from './slicerEstimator'

export type OrderType = 'quote' | 'consult'

export interface QuoteState {
  orderType: OrderType
  consultReasons: string[]
  estimate: PrintEstimate | null
  price: PriceQuote | null
}

/** Làm tròn LÊN 0,1 mm để không bao giờ ghi "180 mm vượt khổ 180 mm". */
function formatOversize(d: Dims): string {
  const up = (v: number) => String(Math.ceil(v * 10 - 1e-6) / 10).replace('.', ',')
  return `${up(d.length)} × ${up(d.width)} × ${up(d.height)} mm`
}

export function computeQuoteState(stats: MeshStats, s: PrintSettings): QuoteState {
  const reasons: string[] = []
  const m = materials[s.material]
  // Nhựa chỉ nhận tư vấn, hoặc chưa đặt giá trong config → không tự báo giá
  if (m.contactOnly || m.pricePerGram === null) reasons.push(s.material)
  if (exceedsBed(stats.dims, printerConfig.bed).exceeds) reasons.push(`Vượt khổ: ${formatOversize(stats.dims)}`)
  if (reasons.length > 0) return { orderType: 'consult', consultReasons: reasons, estimate: null, price: null }

  const estimate = estimatePrint(stats, s)
  return { orderType: 'quote', consultReasons: [], estimate, price: priceQuote(estimate, materials[s.material]) }
}
