import { describe, expect, it } from 'vitest'
import { printerConfig, slicerConfig, type BedSize } from '../config/pricingConfig'
import { makeBox, makeUvSphere } from '../../tests/fixtures/meshes'
import { orientZUpToYUp } from './meshAnalysis'
import { arrangePlate, footprintOf, type ArrangeInput, type ArrangeResult } from './plateArrange'

const bed: BedSize = printerConfig.bed

type P2 = [number, number]

/** Box l (X) × w (Y) × h (Z), as displayed (Y-up, XZ centred). */
const box = (l: number, w: number, h: number) => orientZUpToYUp(makeBox(l, w, h))

/** Right-triangle prism: legs along X and Y, extruded h along Z; as displayed. */
function rightTriangle(leg: number, h: number): Float32Array {
  const a: [number, number, number] = [0, 0, 0]
  const b: [number, number, number] = [leg, 0, 0]
  const c: [number, number, number] = [0, leg, 0]
  const up = (p: [number, number, number]): [number, number, number] => [p[0], p[1], h]
  const o: number[] = []
  const tri = (p: number[], q: number[], r: number[]) => o.push(...p, ...q, ...r)
  const quad = (p: number[], q: number[], r: number[], s: number[]) => {
    tri(p, q, r)
    tri(p, r, s)
  }
  tri(a, c, b) // bottom
  tri(up(a), up(b), up(c)) // top
  quad(a, b, up(b), up(a))
  quad(b, c, up(c), up(b))
  quad(c, a, up(a), up(c))
  return orientZUpToYUp(new Float32Array(o))
}

/** Placed hulls in bed coordinates, per the Placement contract. */
function placedHulls(r: ArrangeResult, inputs: ArrangeInput[]): { id: string; height: number; pts: P2[] }[] {
  const out: { id: string; height: number; pts: P2[] }[] = []
  for (const inp of inputs) {
    for (const p of r.placements[inp.itemId] ?? []) {
      const t = (p.rotDeg * Math.PI) / 180
      const c = Math.cos(t)
      const s = Math.sin(t)
      out.push({
        id: inp.itemId,
        height: inp.height,
        pts: inp.footprint.hull.map(([u, v]) => [p.x + u * c - v * s, p.y + u * s + v * c] as P2),
      })
    }
  }
  return out
}

function segDist(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

function convexOverlap(A: P2[], B: P2[]): boolean {
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      const n: P2 = [b[1] - a[1], a[0] - b[0]]
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity
      for (const p of A) {
        const d = p[0] * n[0] + p[1] * n[1]
        aMin = Math.min(aMin, d)
        aMax = Math.max(aMax, d)
      }
      for (const p of B) {
        const d = p[0] * n[0] + p[1] * n[1]
        bMin = Math.min(bMin, d)
        bMax = Math.max(bMax, d)
      }
      if (aMax <= bMin || bMax <= aMin) return false
    }
  }
  return true
}

function polyDist(A: P2[], B: P2[]): number {
  if (convexOverlap(A, B)) return 0
  let d = Infinity
  for (const [P, Q] of [[A, B], [B, A]]) {
    for (const p of P) for (let i = 0; i < Q.length; i++) d = Math.min(d, segDist(p, Q[i], Q[(i + 1) % Q.length]))
  }
  return d
}

function minPairDist(r: ArrangeResult, inputs: ArrangeInput[]): number {
  const hs = placedHulls(r, inputs)
  let d = Infinity
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) d = Math.min(d, polyDist(hs[i].pts, hs[j].pts))
  return d
}

function expectNoOverlap(r: ArrangeResult, inputs: ArrangeInput[], gap: number) {
  expect(minPairDist(r, inputs)).toBeGreaterThanOrEqual(gap - 1e-6)
}

function expectInside(r: ArrangeResult, inputs: ArrangeInput[], b: BedSize, margin: number) {
  for (const h of placedHulls(r, inputs)) {
    for (const [x, y] of h.pts) {
      expect(x).toBeGreaterThanOrEqual(margin - 1e-6)
      expect(x).toBeLessThanOrEqual(b.x - margin + 1e-6)
      expect(y).toBeGreaterThanOrEqual(margin - 1e-6)
      expect(y).toBeLessThanOrEqual(b.y - margin + 1e-6)
    }
  }
}

function centreDist(r: ArrangeResult, inputs: ArrangeInput[], id: string): number[] {
  return placedHulls(r, inputs)
    .filter((h) => h.id === id)
    .map((h) => {
      const xs = h.pts.map((p) => p[0])
      const ys = h.pts.map((p) => p[1])
      return Math.hypot((Math.min(...xs) + Math.max(...xs)) / 2 - bed.x / 2, (Math.min(...ys) + Math.max(...ys)) / 2 - bed.y / 2)
    })
}

const tenItemsThirtyCopies: ArrangeInput[] = Array.from({ length: 10 }, (_, i) => ({
  itemId: `item${i}`,
  copies: 3,
  footprint: i % 3 === 2 ? footprintOf(rightTriangle(14 + 2 * i, 4 + 8 * i)) : footprintOf(box(10 + 2 * i, 8 + 2 * i, 4 + 8 * i)),
  height: 4 + 8 * i,
}))

describe('footprintOf', () => {
  it('maps (threeX, -threeZ) to the bed plane and fills the triangle', () => {
    // Y-up triangle on the floor: (0,0,0), (10,0,0), (0,0,-10) -> bed (0,0), (10,0), (0,10)
    const fp = footprintOf(new Float32Array([0, 0, 0, 10, 0, 0, 0, 0, -10]))
    expect(fp.res).toBe(0.5)
    const sorted = [...fp.hull].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    expect(sorted).toEqual([
      [0, 0],
      [0, 10],
      [10, 0],
    ])
    const n = fp.cells.length / 2
    // 50 mm² triangle = 200 cells; conservative cover adds the diagonal
    expect(n).toBeGreaterThanOrEqual(200)
    expect(n).toBeLessThanOrEqual(240)
    for (let k = 0; k < fp.cells.length; k += 2) {
      expect(fp.cells[k]).toBeGreaterThanOrEqual(0)
      expect(fp.cells[k + 1]).toBeGreaterThanOrEqual(0)
      expect(fp.cells[k] + fp.cells[k + 1]).toBeLessThanOrEqual(20)
    }
  })

  it('box: exact cells and four hull corners', () => {
    const fp = footprintOf(box(40, 30, 10))
    expect(fp.cells.length / 2).toBe(80 * 60)
    const xs = fp.hull.map((p) => p[0])
    const ys = fp.hull.map((p) => p[1])
    expect(fp.hull).toHaveLength(4)
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([-20, 20, -15, 15])
  })

  it('caps the hull at 32 points and still contains every vertex', () => {
    const pos = orientZUpToYUp(makeUvSphere(20, 96, 48))
    const fp = footprintOf(pos)
    expect(fp.hull.length).toBeLessThanOrEqual(32)
    const h = fp.hull
    let worst = Infinity
    for (let i = 0; i < pos.length; i += 3) {
      const p: P2 = [pos[i], -pos[i + 2]]
      for (let k = 0; k < h.length; k++) {
        const a = h[k]
        const b = h[(k + 1) % h.length]
        worst = Math.min(worst, (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))
      }
    }
    expect(worst).toBeGreaterThanOrEqual(-1e-6)
  })
})

describe('arrangePlate', () => {
  it.each([15, 20, 17.5, 21])('packs at the exact gap: two %s mm boxes sit 5 mm apart', (w) => {
    const inputs = [{ itemId: 'a', copies: 2, footprint: footprintOf(box(w, w, 10)), height: 10 }]
    const r = arrangePlate(inputs, bed)
    const d = minPairDist(r, inputs)
    expect(d).toBeGreaterThanOrEqual(5 - 1e-6)
    expect(d).toBeLessThanOrEqual(5.5 + 1e-6) // at most one 0.5 mm grid step of slack
  })

  it('keeps 8 mm around a tall copy from short neighbours too', () => {
    const inputs = [
      { itemId: 't', copies: 1, footprint: footprintOf(box(30, 30, 80)), height: 80 },
      { itemId: 's', copies: 6, footprint: footprintOf(box(20, 20, 10)), height: 10 },
    ]
    const r = arrangePlate(inputs, bed)
    expect(r.fits).toBe(true)
    const hs = placedHulls(r, inputs)
    const tall = hs.filter((h) => h.id === 't')
    const short = hs.filter((h) => h.id === 's')
    const tallToShort = Math.min(...short.map((s) => polyDist(tall[0].pts, s.pts)))
    expect(tallToShort).toBeGreaterThanOrEqual(8 - 1e-6)
    expect(tallToShort).toBeLessThanOrEqual(8.5 + 1e-6) // still packed tight against it
    expectNoOverlap(r, inputs, 5)
    expectInside(r, inputs, bed, 3)
  })

  // the most a 5 mm-gap square grid achieves on the 174 mm usable square
  const gridMax = (w: number) => Math.floor((bed.x - 2 * 3 + 5) / (w + 5)) ** 2

  it.each([
    [20, gridMax(20)],
    [15, gridMax(15)],
  ])('packs %s mm boxes at least as densely as a grid (%s copies)', (w, n) => {
    const inputs = [{ itemId: 'a', copies: n, footprint: footprintOf(box(w, w, 10)), height: 10 }]
    const r = arrangePlate(inputs, bed)
    expect(r.fits).toBe(true)
    expect(r.placements.a).toHaveLength(n)
    expectNoOverlap(r, inputs, 5)
    expectInside(r, inputs, bed, 3)
  })

  it('rotates off-axis when only a diagonal fits, still valid', () => {
    const inputs = [{ itemId: 'rod', copies: 2, footprint: footprintOf(box(185, 12, 5)), height: 5 }]
    const r = arrangePlate(inputs, bed)
    expect(r.fits).toBe(true)
    for (const p of r.placements.rod) expect(p.rotDeg % 90).not.toBe(0)
    expectNoOverlap(r, inputs, 5)
    expectInside(r, inputs, bed, 3)
  })

  it('places copies without overlap and inside the margin', () => {
    const inputs = [{ itemId: 'a', copies: 6, footprint: footprintOf(box(40, 30, 10)), height: 10 }]
    const r = arrangePlate(inputs, bed)
    expect(r.fits).toBe(true)
    expect(r.placements.a).toHaveLength(6)
    expectNoOverlap(r, inputs, 5)
    expectInside(r, inputs, bed, 3)
  })

  it('uses 8 mm spacing around tall copies', () => {
    const inputs = [{ itemId: 't', copies: 2, footprint: footprintOf(box(30, 30, 80)), height: 80 }]
    const r = arrangePlate(inputs, bed)
    expect(r.fits).toBe(true)
    expect(r.placements.t).toHaveLength(2)
    expectNoOverlap(r, inputs, 8)
    expectInside(r, inputs, bed, 3)
  })

  it('is deterministic', () => {
    expect(arrangePlate(tenItemsThirtyCopies, bed)).toEqual(arrangePlate(tenItemsThirtyCopies, bed))
  })

  it('reports not fitting', () => {
    expect(arrangePlate([{ itemId: 'a', copies: 5, footprint: footprintOf(box(100, 100, 5)), height: 5 }], bed).fits).toBe(false)
  })

  it('reports not fitting when a single copy is bigger than the usable bed', () => {
    const r = arrangePlate([{ itemId: 'a', copies: 1, footprint: footprintOf(box(175, 175, 5)), height: 5 }], bed)
    expect(r.fits).toBe(false)
  })

  it('a too-big item plus a small item: the small item is still placed', () => {
    const inputs = [
      { itemId: 'big', copies: 1, footprint: footprintOf(box(175, 175, 5)), height: 5 },
      { itemId: 'small', copies: 3, footprint: footprintOf(box(20, 20, 10)), height: 10 },
    ]
    const r = arrangePlate(inputs, bed)
    expect(r.fits).toBe(false)
    expect(r.placements.small).toHaveLength(3)
    expect(r.placements.big.length).toBeLessThan(1)
    expect(arrangePlate(inputs, bed)).toEqual(r)
  })

  it('item A qty 1 fits, item B qty 200 does not: A is placed fully', () => {
    const inputs = [
      { itemId: 'A', copies: 1, footprint: footprintOf(box(30, 30, 10)), height: 10 },
      { itemId: 'B', copies: 200, footprint: footprintOf(box(15, 15, 10)), height: 10 },
    ]
    const t0 = performance.now()
    const r = arrangePlate(inputs, bed)
    const ms = performance.now() - t0
    expect(r.fits).toBe(false)
    expect(r.placements.A).toHaveLength(1)
    expect(r.placements.B.length).toBeLessThan(200)
    expect(ms).toBeLessThan(700)
  })

  it('a later item that does not fit is the only one short; items after it are placed', () => {
    const inputs = [
      { itemId: 'a', copies: 1, footprint: footprintOf(box(100, 100, 5)), height: 5 },
      { itemId: 'b', copies: 5, footprint: footprintOf(box(90, 90, 5)), height: 5 },
      { itemId: 'c', copies: 2, footprint: footprintOf(box(10, 10, 5)), height: 5 },
    ]
    const r = arrangePlate(inputs, bed)
    expect(r.fits).toBe(false)
    expect(r.placements.a).toHaveLength(1)
    expect(r.placements.b.length).toBeLessThan(5)
    expect(r.placements.c).toHaveLength(2)
  })

  it('nests shapes tighter than bounding boxes', () => {
    // right triangle with 120 mm legs: two bounding boxes need 245 mm, but rotated 180° into each other
    // the pair fits in about 120 + gap on the 174 mm usable bed
    const inputs = [{ itemId: 'T', copies: 2, footprint: footprintOf(rightTriangle(120, 5)), height: 5 }]
    const r = arrangePlate(inputs, bed)
    expect(r.fits).toBe(true)
    expectNoOverlap(r, inputs, 5)
    expectInside(r, inputs, bed, 3)
  })

  it('puts the tallest copy nearer the centre than short ones', () => {
    const inputs = [
      { itemId: 's', copies: 4, footprint: footprintOf(box(30, 30, 10)), height: 10 },
      { itemId: 't', copies: 1, footprint: footprintOf(box(30, 30, 80)), height: 80 },
    ]
    const r = arrangePlate(inputs, bed)
    expect(r.fits).toBe(true)
    const [tall] = centreDist(r, inputs, 't')
    expect(tall).toBeLessThan(Math.min(...centreDist(r, inputs, 's')))
    expectNoOverlap(r, inputs, 5)
    expectInside(r, inputs, bed, 3)
  })

  it('reads padding and margin from config', () => {
    const cfg = { ...slicerConfig, platePaddingMm: 12, bedMarginMm: 10 }
    const inputs = [{ itemId: 'a', copies: 4, footprint: footprintOf(box(30, 30, 10)), height: 10 }]
    const r = arrangePlate(inputs, bed, cfg)
    expect(r.fits).toBe(true)
    expectNoOverlap(r, inputs, 12)
    expectInside(r, inputs, bed, 10)
  })

  it('finishes within the budget and stays valid when the clock runs out', () => {
    let t = 0
    const r = arrangePlate(tenItemsThirtyCopies, bed, slicerConfig, () => (t += 400))
    expectNoOverlap(r, tenItemsThirtyCopies, 5)
    expectInside(r, tenItemsThirtyCopies, bed, 3)
    expect(r.fits).toBe(true)
  })

  it('the work budget, not the clock, decides how far the search goes', () => {
    const cfg = { ...slicerConfig, arrangeWorkBudget: 20_000 }
    let slow = 0
    const a = arrangePlate(tenItemsThirtyCopies, bed, cfg) // real clock
    const b = arrangePlate(tenItemsThirtyCopies, bed, cfg, () => (slow += 0.01)) // other clock, still in time
    expect(b).toEqual(a)
    // a spent budget coarsens the search: it is not the full-budget result, but it is still valid
    expect(a).not.toEqual(arrangePlate(tenItemsThirtyCopies, bed))
    expectNoOverlap(a, tenItemsThirtyCopies, 5)
    expectInside(a, tenItemsThirtyCopies, bed, 3)
    expect(a.fits).toBe(true)
  })

  it('reports 80 copies of a 15 mm box as not fitting, quickly and the same every time', () => {
    const inputs = [{ itemId: 'a', copies: 80, footprint: footprintOf(box(15, 15, 10)), height: 10 }]
    const t0 = performance.now()
    const r = arrangePlate(inputs, bed)
    // worst non-fitting case was ~800 ms; keep well clear of the 1000 ms clock backstop
    expect(performance.now() - t0).toBeLessThan(700)
    expect(r.fits).toBe(false)
    expect(arrangePlate(inputs, bed).fits).toBe(false)
  })

  it('fits ten items / thirty copies validly in under 1500 ms on the real clock', () => {
    const t0 = performance.now()
    const r = arrangePlate(tenItemsThirtyCopies, bed)
    const ms = performance.now() - t0
    expect(r.fits).toBe(true)
    for (const inp of tenItemsThirtyCopies) expect(r.placements[inp.itemId]).toHaveLength(inp.copies)
    expectNoOverlap(r, tenItemsThirtyCopies, 5)
    expectInside(r, tenItemsThirtyCopies, bed, 3)
    expect(ms).toBeLessThan(1500)
  })
})
