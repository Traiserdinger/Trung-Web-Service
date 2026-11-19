import {
  materials,
  printerConfig,
  slicerConfig,
  type BedSize,
  type LayerHeight,
  type MaterialId,
  type SlicerConfig,
} from '../config/pricingConfig'
import type { MeshStats } from './meshAnalysis'

export interface PrintSettings {
  material: MaterialId
  layerHeight: LayerHeight
  infillPercent: number
  wallLoops: number
  support: boolean
  quantity: number
}

export interface PrintEstimate {
  /** Tổng gram cho cả đơn (mọi bản + nhựa xả mỗi bàn) */
  grams: number
  /** Tổng thời gian cho cả đơn, giây */
  timeSec: number
  layers: number
  plates: number
  copiesPerPlate: number
  /** mm³ cho 1 bản */
  shellVolume: number
  infillVolume: number
  /** mm³ cho 1 bản, đã gồm support */
  partVolume: number
}

export function countLayers(height: number, layerHeight: number): number {
  return Math.max(1, Math.ceil(height / layerHeight - 1e-9))
}

export function estimatePrint(
  stats: MeshStats,
  s: PrintSettings,
  cfg: SlicerConfig = slicerConfig,
  bed: BedSize = printerConfig.bed,
): PrintEstimate {
  const material = materials[s.material]
  const supportMul = s.support ? cfg.supportFactor : 1

  const tShell = s.wallLoops * cfg.lineWidth + cfg.shellExtra
  const shellVolume = Math.min(stats.volume, stats.surfaceArea * tShell)
  const infillVolume = Math.max(0, stats.volume - shellVolume) * (s.infillPercent / 100)
  const baseVolume = shellVolume + infillVolume
  const partVolume = baseVolume * supportMul

  const layers = countLayers(stats.dims.height, s.layerHeight)
  const flow = material.flowRate[s.layerHeight]
  // Thời gian tính từ thể tích chưa nhân support, rồi nhân support đúng một lần.
  const partTimeSec = (baseVolume / flow + layers * cfg.perLayerSec) * supportMul

  const footprint = (stats.dims.length + cfg.platePaddingMm) * (stats.dims.width + cfg.platePaddingMm)
  const copiesPerPlate = Math.max(1, Math.floor((bed.x * bed.y) / footprint))
  const plates = Math.ceil(s.quantity / copiesPerPlate)

  return {
    grams: ((s.quantity * partVolume) / 1000) * material.density + cfg.purgeGrams * plates,
    timeSec: s.quantity * partTimeSec + cfg.warmupSec * plates,
    layers,
    plates,
    copiesPerPlate,
    shellVolume,
    infillVolume,
    partVolume,
  }
}

export function shouldSuggestSupport(stats: MeshStats, cfg: SlicerConfig = slicerConfig): boolean {
  return stats.overhangArea >= cfg.supportAreaThreshold
}
