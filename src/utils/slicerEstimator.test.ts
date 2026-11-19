import { describe, expect, it } from 'vitest'
import type { MeshStats } from './meshAnalysis'
import { countLayers, estimatePrint, shouldSuggestSupport, type PrintSettings } from './slicerEstimator'

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

  it('plates: 100×100 footprint fits 2 per plate, qty 3 needs 2 plates', () => {
    const big = { ...cube, dims: { length: 100, width: 100, height: 10 } }
    const e = estimatePrint(big, { ...base, quantity: 3 })
    expect(e.copiesPerPlate).toBe(2)
    expect(e.plates).toBe(2)
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
