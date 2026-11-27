import { materials, multiPlate, printerConfig } from '../config/pricingConfig'
import { exceedsBed, type MeshStats } from './meshAnalysis'
import type { ArrangeResult } from './plateArrange'
import { priceCombined } from './pricing'
import { computeQuoteState, formatOversize, type QuoteState } from './quoteState'
import { estimatePlate, type ItemSettings, type SharedSettings } from './slicerEstimator'

export interface PlateItemInput {
  id: string
  name: string
  stats: MeshStats
  settings: ItemSettings
}

export interface PlateQuote extends QuoteState {
  separateTotal: number | null
  savings: number | null
  fitsOnePlate: boolean
}

/** Trạng thái báo giá cho cả bàn in: báo giá tự động hoặc chuyển Zalo tư vấn. */
export function computePlateState(a: {
  items: PlateItemInput[]
  shared: SharedSettings
  arrangement: ArrangeResult | null
  totalSourceBytes: number
}): PlateQuote {
  const { items, shared, arrangement, totalSourceBytes } = a
  const fitsOnePlate = arrangement?.fits === true

  if (items.length === 1) {
    const it = items[0]
    const q = computeQuoteState(it.stats, { ...shared, ...it.settings }, fitsOnePlate ? 1 : undefined)
    return { ...q, separateTotal: null, savings: null, fitsOnePlate }
  }

  const reasons: string[] = []
  const m = materials[shared.material]
  if (m.contactOnly || m.pricePerGram === null) reasons.push(shared.material)
  for (const it of items) {
    if (exceedsBed(it.stats.dims, printerConfig.bed).exceeds) {
      reasons.push(`${it.name}: Vượt khổ: ${formatOversize(it.stats.dims)}`)
    }
  }
  if (items.length > multiPlate.maxItems) reasons.push('Quá 10 món')
  if (totalSourceBytes > multiPlate.maxTotalBytes) reasons.push('Tổng file lớn hơn 35 MB')
  if (arrangement && !arrangement.fits) reasons.push('Không vừa một bàn in')

  const none = { separateTotal: null, savings: null, fitsOnePlate }
  if (reasons.length > 0) {
    return { orderType: 'consult', consultReasons: reasons, estimate: null, price: null, ...none }
  }
  if (arrangement === null) {
    return { orderType: 'quote', consultReasons: [], estimate: null, price: null, ...none }
  }

  const estimate = estimatePlate(items, shared)
  const price = priceCombined(estimate, m, items.length, shared.layerHeight)

  let separateTotal: number | null = 0
  for (const it of items) {
    const solo = computeQuoteState(it.stats, { ...shared, ...it.settings }).price
    if (!solo) {
      separateTotal = null
      break
    }
    separateTotal += solo.total
  }
  const diff = separateTotal !== null && price ? separateTotal - price.total : 0
  return {
    orderType: 'quote',
    consultReasons: [],
    estimate,
    price,
    separateTotal,
    savings: diff > 0 ? diff : null,
    fitsOnePlate,
  }
}
