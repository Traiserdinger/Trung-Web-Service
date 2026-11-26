import { describe, expect, it } from 'vitest'
import type { MeshStats } from './meshAnalysis'
import { printerConfig, slicerConfig } from '../config/pricingConfig'
import {
  countLayers,
  estimatePart,
  estimatePlate,
  estimatePrint,
  shouldSuggestSupport,
  type PrintSettings,
} from './slicerEstimator'

const cube: MeshStats = {
  dims: { length: 10, width: 10, height: 10 },
  surfaceArea: 600,
  volume: 1000,
  signedVolume: 1000,
  isWatertight: true,
  overhangArea: 0,
  triangleCount: 12,
}

const base: PrintSettings = {
  material: 'PETG',
  layerHeight: 0.2,
  infillPercent: 15,
  wallLoops: 2,
  support: false,
  quantity: 1,
}

describe('estimatePrint', () => {
  it('cube 10mm PETG, no support, qty 1', () => {
    const e = estimatePrint(cube, base)
    expect(e.shellVolume).toBeCloseTo(594, 6)
    expect(e.infillVolume).toBeCloseTo(60.9, 6)
    expect(e.partVolume).toBeCloseTo(654.9, 6)
    expect(e.grams).toBeCloseTo(1.6317, 3)
    expect(e.layers).toBe(50)
    expect(e.timeSec).toBeCloseTo(569.54, 2)
    expect(e.copiesPerPlate).toBe(144)
    expect(e.plates).toBe(1)
  })

  it('support applies 1.15 once to grams and once to time, qty 3', () => {
    const e = estimatePrint(cube, { ...base, support: true, quantity: 3 })
    expect(e.partVolume).toBeCloseTo(753.135, 6)
    expect(e.grams).toBeCloseTo(3.6694, 3)
    expect(e.timeSec).toBeCloseTo(1082.9, 1)
  })

  it('thin shell is clamped to the part volume', () => {
    const e = estimatePrint({ ...cube, surfaceArea: 5000 }, base)
    expect(e.shellVolume).toBe(1000)
    expect(e.infillVolume).toBe(0)
  })

  it('plates: parts are packed on a grid, not by area (100×100 → 1 per plate)', () => {
    const big = { ...cube, dims: { length: 100, width: 100, height: 10 } }
    const e = estimatePrint(big, { ...base, quantity: 3 })
    expect(e.copiesPerPlate).toBe(1)
    expect(e.plates).toBe(3)
  })

  it('plates: counts whole rows × columns that fit on the bed', () => {
    // (120+5)×(50+5) trên 180×180: 1 × 3 = 3; (30+5)×(80+5): 5 × 2 = 10
    expect(estimatePrint({ ...cube, dims: { length: 120, width: 50, height: 10 } }, base).copiesPerPlate).toBe(3)
    expect(estimatePrint({ ...cube, dims: { length: 30, width: 80, height: 10 } }, base).copiesPerPlate).toBe(10)
  })
})

describe('countLayers', () => {
  it('does not add a layer for float error', () => {
    expect(countLayers(30, 0.2)).toBe(150)
    expect(countLayers(10, 0.12)).toBe(84)
  })
})

describe('shouldSuggestSupport', () => {
  it('suggests support at or above 100 mm² of overhang', () => {
    expect(shouldSuggestSupport({ ...cube, overhangArea: 300 })).toBe(true)
    expect(shouldSuggestSupport({ ...cube, overhangArea: 50 })).toBe(false)
  })
})

const box = (l: number, w: number, h: number): MeshStats => ({
  dims: { length: l, width: w, height: h },
  surfaceArea: 2 * (l * w + l * h + w * h),
  volume: l * w * h,
  signedVolume: l * w * h,
  isWatertight: true,
  overhangArea: 0,
  triangleCount: 12,
})

describe('multi-file plate estimates', () => {
  it('estimatePrint with platesOverride=1 drops one warmup and purge', () => {
    const stats = box(50, 50, 10) // grid fits 9 per plate
    const s = { ...base, quantity: 10 }
    const grid = estimatePrint(stats, s)
    const one = estimatePrint(stats, s, slicerConfig, printerConfig.bed, 1)
    expect(grid.plates).toBe(2)
    expect(one.plates).toBe(1)
    expect(grid.timeSec - one.timeSec).toBeCloseTo(slicerConfig.warmupSec)
    expect(grid.grams - one.grams).toBeCloseTo(slicerConfig.purgeGrams)
  })

  it('estimatePlate sums parts and adds one warmup and purge', () => {
    const a = { stats: box(20, 20, 10), settings: { infillPercent: 15, wallLoops: 2, support: false, quantity: 2 } }
    const b = { stats: box(30, 10, 40), settings: { infillPercent: 50, wallLoops: 3, support: true, quantity: 1 } }
    const shared = { material: 'PETG' as const, layerHeight: 0.2 as const }
    const pa = estimatePart(a.stats, { ...shared, ...a.settings })
    const pb = estimatePart(b.stats, { ...shared, ...b.settings })
    const e = estimatePlate([a, b], shared)
    expect(e.timeSec).toBeCloseTo(2 * pa.partTimeSec + pb.partTimeSec + slicerConfig.warmupSec)
    expect(e.grams).toBeCloseTo(((2 * pa.partVolume + pb.partVolume) / 1000) * 1.27 + slicerConfig.purgeGrams)
    expect(e.plates).toBe(1)
    expect(e.copiesPerPlate).toBe(3)
  })
})
