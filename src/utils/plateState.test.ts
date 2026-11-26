import { describe, expect, it } from 'vitest'
import { multiPlate } from '../config/pricingConfig'
import type { ArrangeResult } from './plateArrange'
import type { MeshStats } from './meshAnalysis'
import { computePlateState, type PlateItemInput } from './plateState'
import { computeQuoteState } from './quoteState'
import type { SharedSettings } from './slicerEstimator'

function mesh(l: number, w: number, h: number): MeshStats {
  const v = l * w * h
  return {
    dims: { length: l, width: w, height: h },
    surfaceArea: 2 * (l * w + l * h + w * h),
    volume: v,
    signedVolume: v,
    isWatertight: true,
    overhangArea: 0,
    triangleCount: 12,
  }
}
const shared: SharedSettings = { material: 'PETG', layerHeight: 0.2 }
const itemSettings = { infillPercent: 15, wallLoops: 2, support: false, quantity: 1 }
function item(id: string, stats: MeshStats, name = id): PlateItemInput {
  return { id, name, stats, settings: itemSettings }
}
const fits: ArrangeResult = { fits: true, placements: {} }
const noFit: ArrangeResult = { fits: false, placements: {} }
const big = () => mesh(20, 20, 5)

describe('computePlateState', () => {
  it('single item equals computeQuoteState', () => {
    const it1 = item('a', mesh(30, 30, 30))
    const q = computePlateState({ items: [it1], shared, arrangement: null, totalSourceBytes: 1 })
    expect(q).toMatchObject(computeQuoteState(it1.stats, { ...shared, ...itemSettings }))
    expect(q.separateTotal).toBeNull()
    expect(q.savings).toBeNull()
  })

  it('single item uses one plate when arrangement fits', () => {
    const it1: PlateItemInput = { id: 'a', name: 'a', stats: mesh(20, 20, 5), settings: { ...itemSettings, quantity: 3 } }
    const q = computePlateState({ items: [it1], shared, arrangement: fits, totalSourceBytes: 1 })
    expect(q.estimate?.plates).toBe(1)
    expect(q.fitsOnePlate).toBe(true)
  })

  it('two items price combined and show savings', () => {
    const items = [item('a', big()), item('b', big()), item('c', big())]
    const q = computePlateState({ items, shared, arrangement: fits, totalSourceBytes: 1 })
    expect(q.orderType).toBe('quote')
    expect(q.separateTotal).toBe(60000)
    expect(q.savings).toBe(q.separateTotal! - q.price!.total)
    expect(q.savings!).toBeGreaterThan(0)
  })

  it('two items then one behaves like single item', () => {
    const a = item('a', big())
    const q = computePlateState({ items: [a], shared, arrangement: fits, totalSourceBytes: 1 })
    expect(q.price).toEqual(computeQuoteState(a.stats, { ...shared, ...itemSettings }, 1).price)
    expect(q.price?.total).toBe(20000)
    expect(q.separateTotal).toBeNull()
    expect(q.savings).toBeNull()
  })

  it('more than 10 items is consult', () => {
    const items = Array.from({ length: multiPlate.maxItems + 1 }, (_, i) => item(`i${i}`, big()))
    const q = computePlateState({ items, shared, arrangement: fits, totalSourceBytes: 1 })
    expect(q.orderType).toBe('consult')
    expect(q.consultReasons).toContain('Quá 10 món')
    expect(q.price).toBeNull()
    expect(q.estimate).toBeNull()
    expect(q.savings).toBeNull()
  })

  it('total bytes over 35 MB is consult', () => {
    const items = [item('a', big()), item('b', big())]
    const q = computePlateState({ items, shared, arrangement: fits, totalSourceBytes: multiPlate.maxTotalBytes + 1 })
    expect(q.orderType).toBe('consult')
    expect(q.consultReasons).toEqual(['Tổng file lớn hơn 35 MB'])
  })

  it('not fitting is consult', () => {
    const q = computePlateState({ items: [item('a', big()), item('b', big())], shared, arrangement: noFit, totalSourceBytes: 1 })
    expect(q.orderType).toBe('consult')
    expect(q.consultReasons).toEqual(['Không vừa một bàn in'])
    expect(q.fitsOnePlate).toBe(false)
  })

  it('oversize item reason names the item', () => {
    const items = [item('a', big()), item('b', mesh(200, 10, 10), 'khung.stl')]
    const q = computePlateState({ items, shared, arrangement: fits, totalSourceBytes: 1 })
    expect(q.orderType).toBe('consult')
    expect(q.consultReasons).toEqual(['khung.stl: Vượt khổ: 200 × 10 × 10 mm'])
    expect(q.separateTotal).toBeNull()
  })

  it('ABS is consult', () => {
    const q = computePlateState({
      items: [item('a', big()), item('b', big())],
      shared: { ...shared, material: 'ABS' },
      arrangement: fits,
      totalSourceBytes: 1,
    })
    expect(q.orderType).toBe('consult')
    expect(q.consultReasons[0]).toBe('ABS')
  })

  it('null arrangement leaves price pending', () => {
    const q = computePlateState({ items: [item('a', big()), item('b', big())], shared, arrangement: null, totalSourceBytes: 1 })
    expect(q.orderType).toBe('quote')
    expect(q.consultReasons).toEqual([])
    expect(q.estimate).toBeNull()
    expect(q.price).toBeNull()
    expect(q.savings).toBeNull()
  })
})
