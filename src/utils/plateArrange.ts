import { slicerConfig, type BedSize, type SlicerConfig } from '../config/pricingConfig'

// Shape-based plate packing (spec §7.5).
//
// Bed plane: (u, v) = (threeX, -threeZ) of the mesh as displayed (Y-up, XZ centred at 0).
// A placement {x, y, rotDeg} puts the local origin at bed point (x, y), rotated anticlockwise
// seen from above: bed = (x + u·cosθ − v·sinθ, y + u·sinθ + v·cosθ).

export interface Placement {
  x: number
  y: number
  rotDeg: number
}

export interface Footprint {
  /** Pairs (i, j) of occupied `res`-mm cells; cell (i, j) covers [i·res, (i+1)·res] × [j·res, (j+1)·res]. */
  cells: Int16Array
  res: number
  /** Convex hull (mm, anticlockwise), ≤ 32 points; contains the whole footprint. */
  hull: [number, number][]
}

export interface ArrangeInput {
  itemId: string
  copies: number
  footprint: Footprint
  height: number
}

export interface ArrangeResult {
  fits: boolean
  /** length = copies when fits */
  placements: Record<string, Placement[]>
}

const EPS = 1e-6
const MAX_HULL = 32

type P2 = [number, number]

// ---------------------------------------------------------------- footprint

export function footprintOf(positions: Float32Array, res = 0.5): Footprint {
  const nv = Math.floor(positions.length / 9) * 3
  if (nv === 0) return { cells: new Int16Array(0), res, hull: [] }
  const us = new Float64Array(nv)
  const vs = new Float64Array(nv)
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (let k = 0; k < nv; k++) {
    const u = positions[k * 3]
    const v = 0 - positions[k * 3 + 2] // 0 - z, not -z: keep +0
    us[k] = u
    vs[k] = v
    if (u < minU) minU = u
    if (u > maxU) maxU = u
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }
  const i0 = Math.floor(minU / res) - 1
  const j0 = Math.floor(minV / res) - 1
  const W = Math.floor(maxU / res) - i0 + 2
  const H = Math.floor(maxV / res) - j0 + 2
  const grid = new Uint8Array(W * H)

  // Vertical faces project to segments that lie inside the projection of the other faces of a
  // closed mesh; skip them, and only fall back to them when nothing else is there.
  let filled = rasterize(us, vs, nv, grid, W, i0, j0, res, false)
  if (filled === 0) filled = rasterize(us, vs, nv, grid, W, i0, j0, res, true)

  const cells = new Int16Array(filled * 2)
  let n = 0
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (grid[j * W + i]) {
        cells[n++] = i + i0
        cells[n++] = j + j0
      }
    }
  }
  return { cells, res, hull: limitHull(convexHull(us, vs, nv)) }
}

function rasterize(
  us: Float64Array,
  vs: Float64Array,
  nv: number,
  grid: Uint8Array,
  W: number,
  i0: number,
  j0: number,
  res: number,
  includeFlat: boolean,
): number {
  let filled = 0
  const xs: number[] = []
  for (let t = 0; t < nv; t += 3) {
    const au = us[t], av = vs[t], bu = us[t + 1], bv = vs[t + 1], cu = us[t + 2], cv = vs[t + 2]
    const area2 = (bu - au) * (cv - av) - (bv - av) * (cu - au)
    if (!includeFlat && Math.abs(area2) < 1e-12) continue
    const vmin = Math.min(av, bv, cv)
    const vmax = Math.max(av, bv, cv)
    const jLo = Math.floor(vmin / res + EPS)
    const jHi = Math.max(jLo, Math.ceil(vmax / res - EPS) - 1)
    for (let j = jLo; j <= jHi; j++) {
      const y0 = Math.max(j * res, vmin)
      const y1 = Math.min((j + 1) * res, vmax)
      xs.length = 0
      if (av >= y0 && av <= y1) xs.push(au)
      if (bv >= y0 && bv <= y1) xs.push(bu)
      if (cv >= y0 && cv <= y1) xs.push(cu)
      edgeCross(au, av, bu, bv, y0, y1, xs)
      edgeCross(bu, bv, cu, cv, y0, y1, xs)
      edgeCross(cu, cv, au, av, y0, y1, xs)
      if (xs.length === 0) continue
      let xmin = Infinity, xmax = -Infinity
      for (const x of xs) {
        if (x < xmin) xmin = x
        if (x > xmax) xmax = x
      }
      const iLo = Math.floor(xmin / res + EPS)
      const iHi = Math.max(iLo, Math.ceil(xmax / res - EPS) - 1)
      const row = (j - j0) * W - i0
      for (let i = iLo; i <= iHi; i++) {
        if (!grid[row + i]) {
          grid[row + i] = 1
          filled++
        }
      }
    }
  }
  return filled
}

function edgeCross(pu: number, pv: number, qu: number, qv: number, y0: number, y1: number, xs: number[]) {
  if (pv === qv) return
  for (const y of [y0, y1]) {
    if ((y - pv) * (y - qv) <= 0) xs.push(pu + ((y - pv) / (qv - pv)) * (qu - pu))
  }
}

/** Monotone chain hull, anticlockwise, no collinear points. Akl–Toussaint pre-filter keeps it fast. */
function convexHull(us: Float64Array, vs: Float64Array, n: number): P2[] {
  // extreme points in 8 directions
  const dirs: P2[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
  const ext: P2[] = dirs.map(([dx, dy]) => {
    let best = -Infinity
    let bi = 0
    for (let k = 0; k < n; k++) {
      const d = us[k] * dx + vs[k] * dy
      if (d > best) {
        best = d
        bi = k
      }
    }
    return [us[bi], vs[bi]]
  })
  const seen = new Set<string>()
  const pts: P2[] = []
  for (let k = 0; k < n; k++) {
    const p: P2 = [us[k], vs[k]]
    if (strictlyInside(p, ext)) continue
    const key = `${p[0]},${p[1]}`
    if (seen.has(key)) continue
    seen.add(key)
    pts.push(p)
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length <= 2) return pts
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: P2[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: P2[] = []
  for (let k = pts.length - 1; k >= 0; k--) {
    const p = pts[k]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/** Strictly inside the (anticlockwise, possibly degenerate) polygon of extreme points. */
function strictlyInside(p: P2, poly: P2[]): boolean {
  let edges = 0
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k]
    const b = poly[(k + 1) % poly.length]
    if (a[0] === b[0] && a[1] === b[1]) continue
    edges++
    if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) <= 0) return false
  }
  return edges >= 3
}

/** A hull with more than 32 points becomes the circumscribed 32-gon (still contains the shape). */
function limitHull(h: P2[]): P2[] {
  if (h.length <= MAX_HULL) return h
  const n = MAX_HULL
  const d: P2[] = []
  const s: number[] = []
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n
    const dir: P2 = [Math.cos(a), Math.sin(a)]
    d.push(dir)
    let m = -Infinity
    for (const p of h) m = Math.max(m, p[0] * dir[0] + p[1] * dir[1])
    s.push(m)
  }
  const out: P2[] = []
  for (let k = 0; k < n; k++) {
    const [a1, b1] = d[k]
    const [a2, b2] = d[(k + 1) % n]
    const c1 = s[k]
    const c2 = s[(k + 1) % n]
    const det = a1 * b2 - a2 * b1
    const p: P2 = [(c1 * b2 - c2 * b1) / det, (a1 * c2 - a2 * c1) / det]
    const last = out[out.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-9) out.push(p)
  }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-9) out.pop()
  return out
}

// ---------------------------------------------------------------- arrangement

/** Occupancy grid cell, mm. Origins move in whole cells as well. */
const CELL = 0.5
/** Coarse pass step, cells (3 mm). */
const COARSE_STEP = 6
/** Fine pass step, cells (1 mm); a one-cell hill-climb finishes the job. */
const FINE_STEP = 2
const NEIGHBOURS: [number, number][] = [
  [0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
]
/** Corner score: top edge first, then right edge (both < this many mm). */
const CORNER_K = 1e4

/** Grown occupancy of one copy at one rotation, in CELL units, relative to the placement origin. */
interface Mask {
  offI: number
  offJ: number
  h: number
  words: number
  rows: Uint32Array // h × words
  /** Tight box of the set cells, and a rectangle fully set inside it: [i0, j0, i1, j1), mask coords. */
  bbox: [number, number, number, number]
  core: [number, number, number, number]
}

interface Rotation {
  deg: number
  // rotated hull bounding box (mm, relative to origin)
  minU: number
  maxU: number
  minV: number
  maxV: number
  /** checked against the normal layer (and written there by normal copies) */
  low: Mask
  /** checked against the tall layer (and written there by tall copies); null when nothing is tall */
  high: Mask | null
}

interface Item {
  index: number
  input: ArrangeInput
  area: number
  tall: boolean
  rotations: Rotation[]
}

interface Candidate {
  score: number
  r: number
  x: number
  y: number
}

/**
 * Every CELL-grid cell that the footprint (rotated by (c, s)) overlaps, plus every cell that may
 * come closer than `radius` to it. If two copies grown by r1 and r2 are closer than r1 + r2, the
 * cell holding the point that splits their nearest-point segment r1 : r2 is in both masks; if they
 * overlap, a shared point's cell is in both. So disjoint masks mean the copies are ≥ r1 + r2 apart.
 */
function buildMask(fp: Footprint, c: number, s: number, radius: number): RawMask {
  const res = fp.res
  const cells = fp.cells
  const n = cells.length / 2
  const half = res / 2
  const ext = half * (Math.abs(c) + Math.abs(s)) // half-size of a rotated cell's bounding box
  const cxs = new Float64Array(n)
  const cys = new Float64Array(n)
  let ci0 = Infinity, ci1 = -Infinity, cj0 = Infinity, cj1 = -Infinity
  let fi0 = Infinity, fi1 = -Infinity, fj0 = Infinity, fj1 = -Infinity
  for (let k = 0; k < n; k++) {
    const fi = cells[2 * k]
    const fj = cells[2 * k + 1]
    if (fi < fi0) fi0 = fi
    if (fi > fi1) fi1 = fi
    if (fj < fj0) fj0 = fj
    if (fj > fj1) fj1 = fj
    const u = (fi + 0.5) * res
    const v = (fj + 0.5) * res
    const x = u * c - v * s
    const y = u * s + v * c
    cxs[k] = x
    cys[k] = y
    if (x < ci0) ci0 = x
    if (x > ci1) ci1 = x
    if (y < cj0) cj0 = y
    if (y > cj1) cj1 = y
  }
  const reach = radius + ext
  const I0 = Math.floor((ci0 - reach) / CELL) - 1
  const J0 = Math.floor((cj0 - reach) / CELL) - 1
  const mW = Math.floor((ci1 + reach) / CELL) + 1 - I0 + 1
  const mH = Math.floor((cj1 + reach) / CELL) + 1 - J0 + 1
  const M = new Uint8Array(mW * mH)

  // footprint occupancy, to tell boundary cells (an empty 8-neighbour) from interior ones
  const FW = fi1 - fi0 + 3
  const FH = fj1 - fj0 + 3
  const F = new Uint8Array(FW * FH)
  for (let k = 0; k < n; k++) F[(cells[2 * k + 1] - fj0 + 1) * FW + cells[2 * k] - fi0 + 1] = 1

  for (let k = 0; k < n; k++) {
    const x = cxs[k]
    const y = cys[k]
    // cells the footprint cell overlaps (via its rotated bounding box)
    for (let j = Math.floor((y - ext) / CELL); j <= Math.floor((y + ext) / CELL); j++) {
      for (let i = Math.floor((x - ext) / CELL); i <= Math.floor((x + ext) / CELL); i++) M[(j - J0) * mW + i - I0] = 1
    }
    const fx = cells[2 * k] - fi0 + 1
    const fy = cells[2 * k + 1] - fj0 + 1
    let interior = true
    for (let dy = -1; dy <= 1 && interior; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!F[(fy + dy) * FW + fx + dx]) {
          interior = false
          break
        }
      }
    }
    if (interior) continue
    // Boundary cell: mark grid cells t whose distance to it may be < radius. With q the point of
    // t nearest the centre and n the unit vector from q to the centre, every point of the rotated
    // cell is at least |centre − q| − (half-extent along n) from t; a projection gap on any
    // separating axis is a lower bound too. Neither ever exceeds the true distance.
    for (let j = Math.floor((y - reach) / CELL); j <= Math.floor((y + reach) / CELL); j++) {
      const b0 = j * CELL
      const b1 = b0 + CELL
      const qy = Math.min(Math.max(y, b0), b1)
      const row = (j - J0) * mW - I0
      for (let i = Math.floor((x - reach) / CELL); i <= Math.floor((x + reach) / CELL); i++) {
        if (M[row + i]) continue
        const a0 = i * CELL
        const a1 = a0 + CELL
        const qx = Math.min(Math.max(x, a0), a1)
        const ddx = x - qx
        const ddy = y - qy
        const d = Math.sqrt(ddx * ddx + ddy * ddy)
        if (d === 0) {
          M[row + i] = 1
          continue
        }
        const along = (half * (Math.abs(ddx * c + ddy * s) + Math.abs(-ddx * s + ddy * c))) / d
        if (d - along >= radius) continue
        if (axisGap(x, y, half, ext, c, s, a0, a1, b0, b1) >= radius) continue
        M[row + i] = 1
      }
    }
  }

  return { M, w: mW, h: mH, i0: I0, j0: J0 }
}

/** A mask as one byte per cell, before packing into row bitmasks. */
interface RawMask {
  M: Uint8Array
  w: number
  h: number
  i0: number
  j0: number
}

/**
 * The same mask for the footprint turned a further 90° anticlockwise. The grid is symmetric
 * under quarter turns about the origin (a cell corner), and every test in buildMask is
 * rotation-equivariant, so cell (I, J) simply maps to (−J − 1, I).
 */
function rot90(r: RawMask): RawMask {
  const { M, w, h } = r
  const out = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) if (M[j * w + i]) out[i * h + (h - 1 - j)] = 1
  }
  return { M: out, w: h, h: w, i0: -r.j0 - h, j0: r.i0 }
}

function finishMask(r: RawMask): Mask {
  const { M, w, h } = r
  const words = Math.ceil(w / 32)
  const rows = new Uint32Array(h * words)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (M[j * w + i]) rows[j * words + (i >> 5)] |= 1 << (i & 31)
    }
  }
  return { offI: r.i0, offJ: r.j0, h, words, rows, bbox: setBox(M, w, h), core: largestRect(M, w, h) }
}

/**
 * Largest gap between the projections of a rotated square (centre (x, y), half side `half`, axes
 * (c, s) and (−s, c)) and the box [a0, a1] × [b0, b1], over the four edge normals. Never more
 * than their true distance.
 */
function axisGap(
  x: number,
  y: number,
  half: number,
  ext: number,
  c: number,
  s: number,
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): number {
  const g = Math.max(a0 - (x + ext), x - ext - a1, b0 - (y + ext), y - ext - b1)
  return Math.max(g, projGap(x, y, half, c, s, a0, a1, b0, b1), projGap(x, y, half, -s, c, a0, a1, b0, b1))
}

/** Gap along axis (ax, ay) between a square of half side `half` centred at (x, y) and a box. */
function projGap(x: number, y: number, half: number, ax: number, ay: number, a0: number, a1: number, b0: number, b1: number): number {
  const p = x * ax + y * ay
  const lo = Math.min(a0 * ax, a1 * ax) + Math.min(b0 * ay, b1 * ay)
  const hi = Math.max(a0 * ax, a1 * ax) + Math.max(b0 * ay, b1 * ay)
  return Math.max(lo - (p + half), p - half - hi)
}

/**
 * All rotations of one item. When the angle step divides 90°, masks are only computed for angles
 * below 90° and the rest are quarter turns of those (4× less work, and exact).
 */
function buildRotations(fp: Footprint, angles: number[], rLow: number, rHigh: number | null): Rotation[] {
  const quarter = Math.round(90 / (angles[1] ?? 360))
  const byQuarter = angles.length > 1 && Math.abs(quarter * angles[1] - 90) < EPS
  const raws: { low: RawMask; high: RawMask | null }[] = []
  return angles.map((deg, k) => {
    const t = (deg * Math.PI) / 180
    const c = Math.cos(t)
    const s = Math.sin(t)
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (const [u, v] of fp.hull) {
      const x = u * c - v * s
      const y = u * s + v * c
      if (x < minU) minU = x
      if (x > maxU) maxU = x
      if (y < minV) minV = y
      if (y > maxV) maxV = y
    }
    let raw: { low: RawMask; high: RawMask | null }
    if (byQuarter && k >= quarter) {
      const prev = raws[k - quarter]
      raw = { low: rot90(prev.low), high: prev.high && rot90(prev.high) }
    } else {
      raw = { low: buildMask(fp, c, s, rLow), high: rHigh === null ? null : buildMask(fp, c, s, rHigh) }
    }
    raws.push(raw)
    return { deg, minU, maxU, minV, maxV, low: finishMask(raw.low), high: raw.high && finishMask(raw.high) }
  })
}

function setBox(M: Uint8Array, w: number, h: number): [number, number, number, number] {
  let i0 = w, j0 = h, i1 = 0, j1 = 0
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!M[j * w + i]) continue
      if (i < i0) i0 = i
      if (i >= i1) i1 = i + 1
      if (j < j0) j0 = j
      if (j >= j1) j1 = j + 1
    }
  }
  return i0 < i1 ? [i0, j0, i1, j1] : [0, 0, 0, 0]
}

/** Largest all-set rectangle (histogram method). */
function largestRect(M: Uint8Array, w: number, h: number): [number, number, number, number] {
  const heights = new Int32Array(w + 1)
  const stack: number[] = []
  let best = 0
  let out: [number, number, number, number] = [0, 0, 0, 0]
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) heights[i] = M[j * w + i] ? heights[i] + 1 : 0
    stack.length = 0
    for (let i = 0; i <= w; i++) {
      const hi = i < w ? heights[i] : 0
      while (stack.length && heights[stack[stack.length - 1]] >= hi) {
        const top = stack.pop() as number
        const ht = heights[top]
        const left = stack.length ? stack[stack.length - 1] + 1 : 0
        const area = ht * (i - left)
        if (area > best) {
          best = area
          out = [left, j + 1 - ht, i, j + 1]
        }
      }
      stack.push(i)
    }
  }
  return out
}

class Grid {
  readonly words: number
  readonly bits: Uint32Array
  private hint = 0

  /** Summed-area table of occupied cells, (width + 1) × (height + 1). */
  private readonly sat: Int32Array

  readonly width: number
  readonly height: number
  empty = true

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.words = Math.ceil(width / 32) + 1
    this.bits = new Uint32Array(height * this.words)
    this.sat = new Int32Array((width + 1) * (height + 1))
  }

  private rectSum(i0: number, j0: number, i1: number, j1: number): number {
    const W = this.width + 1
    const s = this.sat
    return s[j1 * W + i1] - s[j0 * W + i1] - s[j1 * W + i0] + s[j0 * W + i0]
  }

  /**
   * Does the mask, with its origin at grid cell (col, row), hit anything occupied? Returns 0 when
   * it is free, otherwise how many columns to the right are certainly blocked too (≥ 1).
   */
  blocked(m: Mask, col: number, row: number): number {
    // O(1) answers first: nothing under the mask's box, or something under its solid core.
    const b = m.bbox
    if (this.rectSum(col + b[0], row + b[1], col + b[2], row + b[3]) === 0) return 0
    const c = m.core
    const j0 = row + c[1]
    const j1 = row + c[3]
    if (c[2] > c[0] && this.rectSum(col + c[0], j0, col + c[2], j1) > 0) {
      // The rightmost occupied column `occ` under the core stays under it until the core's left
      // edge passes it, so every origin up to occ - c0 is blocked as well.
      let lo = col + c[0]
      let hi = col + c[2] - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (this.rectSum(mid, j0, col + c[2], j1) > 0) lo = mid
        else hi = mid - 1
      }
      return lo - (col + c[0]) + 1
    }
    if (this.hint < m.h && this.rowHits(m, this.hint, col, row)) return 1
    for (let r = 0; r < m.h; r++) {
      if (r !== this.hint && this.rowHits(m, r, col, row)) {
        this.hint = r
        return 1
      }
    }
    return 0
  }

  private rowHits(m: Mask, r: number, col: number, row: number): boolean {
    const base = (row + r) * this.words + (col >> 5)
    const sh = col & 31
    const src = r * m.words
    let carry = 0
    for (let k = 0; k < m.words; k++) {
      const w = m.rows[src + k]
      if ((((w << sh) | carry) & this.bits[base + k]) !== 0) return true
      carry = sh ? w >>> (32 - sh) : 0
    }
    return (carry & this.bits[base + m.words]) !== 0
  }

  add(m: Mask, col: number, row: number) {
    this.empty = false
    const sh = col & 31
    for (let r = 0; r < m.h; r++) {
      const base = (row + r) * this.words + (col >> 5)
      const src = r * m.words
      let carry = 0
      for (let k = 0; k < m.words; k++) {
        const w = m.rows[src + k]
        this.bits[base + k] |= (w << sh) | carry
        carry = sh ? w >>> (32 - sh) : 0
      }
      this.bits[base + m.words] |= carry
    }
    const W = this.width + 1
    for (let j = 0; j < this.height; j++) {
      let run = 0
      for (let i = 0; i < this.width; i++) {
        run += (this.bits[j * this.words + (i >> 5)] >>> (i & 31)) & 1
        this.sat[(j + 1) * W + i + 1] = this.sat[j * W + i + 1] + run
      }
    }
  }
}

/** Lexicographic (score, angle, y, x): the tie-break that makes the result deterministic. */
function better(score: number, r: number, x: number, y: number, b: Candidate): boolean {
  if (score !== b.score) return score < b.score
  if (r !== b.r) return r < b.r
  if (y !== b.y) return y < b.y
  return x < b.x
}

function positions(lo: number, hi: number, step: number): number[] {
  const out: number[] = []
  for (let p = lo; p <= hi; p += step) out.push(p)
  if (step > 1 && out[out.length - 1] !== hi) out.push(hi)
  return out
}

const defaultClock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** 'centre': compact group + height-weighted pull to the bed centre. 'corner': bottom-left fill. */
type Mode = 'centre' | 'corner'

interface PackResult {
  fits: boolean
  placed: number
  placements: Record<string, Placement[]>
}

interface PackContext {
  inputs: ArrangeInput[]
  items: Item[]
  bed: BedSize
  margin: number
  border: number
  workBudget: number
  /** hard wall-clock backstop */
  outOfTime: () => boolean
}

function pack(ctx: PackContext, mode: Mode): PackResult {
  const { bed, margin, border, items } = ctx
  const placements: Record<string, Placement[]> = {}
  for (const inp of ctx.inputs) placements[inp.itemId] = []
  const gw = Math.ceil(bed.x / CELL) + 2 * border
  const gh = Math.ceil(bed.y / CELL) + 2 * border
  const lowGrid = new Grid(gw, gh)
  const highGrid = new Grid(gw, gh)
  const cx = bed.x / 2
  const cy = bed.y / 2
  let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity
  let fits = true
  let placed = 0
  let work = 0
  const overBudget = () => work > ctx.workBudget || ctx.outOfTime()

  /** 0 when free, otherwise how many columns to the right are certainly blocked too. */
  const blocked = (rot: Rotation, X: number, Y: number): number => {
    const a = lowGrid.empty ? 0 : lowGrid.blocked(rot.low, X + rot.low.offI + border, Y + rot.low.offJ + border)
    if (a > 0 || highGrid.empty || !rot.high) return a
    return highGrid.blocked(rot.high, X + rot.high.offI + border, Y + rot.high.offJ + border)
  }

  for (const item of items) {
    const { input } = item
    if (item.rotations.length === 0) {
      fits = false
      continue
    }
    const h = input.height
    for (let copy = 0; copy < input.copies; copy++) {
      let best: Candidate | null = null
      // Score of origin (X, Y) in cells; lower is better. Same formula as inlined in the scan.
      const scoreAt = (rot: Rotation, X: number, Y: number): number => {
        const x0 = X * CELL + rot.minU
        const x1 = X * CELL + rot.maxU
        const y0 = Y * CELL + rot.minV
        const y1 = Y * CELL + rot.maxV
        if (mode === 'corner') return y1 * CORNER_K + x1
        const empty = gx0 === Infinity
        const ySpan = empty ? y1 - y0 : Math.max(gy1, y1) - Math.min(gy0, y0)
        const area = empty ? (x1 - x0) * ySpan : (Math.max(gx1, x1) - Math.min(gx0, x0)) * ySpan
        const dx = (x0 + x1) / 2 - cx
        const dy = (y0 + y1) / 2 - cy
        return area + h * Math.sqrt(dx * dx + dy * dy)
      }
      const scan = (step: number, stoppable: boolean) => {
        const slack = (v: number) => v * (1 + 1e-12) + 1e-9
        for (let r = 0; r < item.rotations.length; r++) {
          if (stoppable && overBudget()) return
          const rot = item.rotations[r]
          const { minU, maxU, minV, maxV } = rot
          const xLo = Math.ceil((margin - minU) / CELL - 1e-9)
          const xHi = Math.floor((bed.x - margin - maxU) / CELL + 1e-9)
          const yLo = Math.ceil((margin - minV) / CELL - 1e-9)
          const yHi = Math.floor((bed.y - margin - maxV) / CELL + 1e-9)
          if (xLo > xHi || yLo > yHi) continue
          const xs = positions(xLo, xHi, step)
          const empty = gx0 === Infinity
          const xSpanMin = empty ? maxU - minU : Math.max(gx1 - gx0, maxU - minU)
          const ys = positions(yLo, yHi, step)
          // centre mode: rows nearest the bed centre first, so a good best turns up early
          if (mode === 'centre') {
            const mid = (cy - (minV + maxV) / 2) / CELL
            ys.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid) || p - q)
          }
          for (const Y of ys) {
            if (stoppable && work > ctx.workBudget) return
            const y0 = Y * CELL + minV
            const y1 = Y * CELL + maxV
            const ySpan = empty ? y1 - y0 : Math.max(gy1, y1) - Math.min(gy0, y0)
            const dy = (y0 + y1) / 2 - cy
            // Lower bound for every x on this row; skip rows that cannot beat the best.
            const bound =
              mode === 'centre' ? xSpanMin * ySpan + h * Math.abs(dy) : y1 * CORNER_K + (xLo * CELL + maxU)
            if (best && bound > slack(best.score)) continue
            let skipTo = -Infinity
            for (const X of xs) {
              if (X < skipTo) continue
              work++
              const x0 = X * CELL + minU
              const x1 = X * CELL + maxU
              let score: number
              if (mode === 'centre') {
                const area = empty ? (x1 - x0) * ySpan : (Math.max(gx1, x1) - Math.min(gx0, x0)) * ySpan
                const dx = (x0 + x1) / 2 - cx
                score = area + h * Math.sqrt(dx * dx + dy * dy)
              } else score = y1 * CORNER_K + x1
              if (best && !better(score, r, X, Y, best)) {
                if (mode === 'corner') break // the corner score only grows along a row
                continue
              }
              const skip = blocked(rot, X, Y)
              if (skip > 0) {
                skipTo = X + skip
                continue
              }
              if (best) {
                best.score = score
                best.r = r
                best.x = X
                best.y = Y
              } else best = { score, r, x: X, y: Y }
            }
          }
        }
      }

      // Slide the winner one cell at a time while a neighbouring spot is better and free, so it
      // settles into contact at full grid resolution.
      const refine = () => {
        for (;;) {
          const cur = best as Candidate
          const rot = item.rotations[cur.r]
          const xLo = Math.ceil((margin - rot.minU) / CELL - 1e-9)
          const xHi = Math.floor((bed.x - margin - rot.maxU) / CELL + 1e-9)
          const yLo = Math.ceil((margin - rot.minV) / CELL - 1e-9)
          const yHi = Math.floor((bed.y - margin - rot.maxV) / CELL + 1e-9)
          let next: Candidate | null = null
          for (const [dx, dy] of NEIGHBOURS) {
            const X = cur.x + dx
            const Y = cur.y + dy
            if (X < xLo || X > xHi || Y < yLo || Y > yHi) continue
            work++
            const score = scoreAt(rot, X, Y)
            if (!better(score, cur.r, X, Y, next ?? cur)) continue
            if (blocked(rot, X, Y) > 0) continue
            next = { score, r: cur.r, x: X, y: Y }
          }
          if (!next) return
          best = next
        }
      }

      const coarseOnly = overBudget()
      scan(COARSE_STEP, false)
      // Fine pass on a FINE_STEP lattice (the coarse best only prunes), cut short once the work
      // budget is spent, unless the coarse grid found nowhere at all; then the hill-climb.
      if (!coarseOnly || !best) scan(best ? FINE_STEP : 1, best !== null)
      if (best) refine()

      const chosen = best as Candidate | null
      if (!chosen) {
        // One copy has nowhere to go, so the plate cannot hold everything. Drop only this item's
        // remaining copies (no rescanning the bed for each) and go on, so later items still get
        // their places and the customer can see which item is the culprit.
        fits = false
        break
      }
      const rot = item.rotations[chosen.r]
      if (item.tall) {
        const m = rot.high as Mask
        highGrid.add(m, chosen.x + m.offI + border, chosen.y + m.offJ + border)
      } else lowGrid.add(rot.low, chosen.x + rot.low.offI + border, chosen.y + rot.low.offJ + border)
      const x = chosen.x * CELL
      const y = chosen.y * CELL
      gx0 = Math.min(gx0, x + rot.minU)
      gx1 = Math.max(gx1, x + rot.maxU)
      gy0 = Math.min(gy0, y + rot.minV)
      gy1 = Math.max(gy1, y + rot.maxV)
      placements[input.itemId].push({ x, y, rotDeg: rot.deg })
      placed++
    }
  }
  return { fits, placed, placements }
}

/**
 * Packs every copy onto the bed (spec §7.5).
 *
 * Spacing: copies keep `platePaddingMm` apart; a copy taller than `tallItemMm` keeps
 * `tallPaddingMm` from every neighbour. Two layers make that exact: normal copies are grown by
 * pad/2 on the normal layer, tall copies by tallPad/2 on the tall layer, and a candidate checks
 * each layer with the radius that adds up to the gap it needs.
 *
 * Search: the centre-anchored greedy first (tall copies near the middle); if it does not fit
 * everything, a bottom-left fill is tried and the better result kept. Deterministic: each copy's
 * spot is the lexicographic minimum of (score, angle, y, x) over feasible 0.5 mm origins, and the
 * search is limited by a work budget (`arrangeWorkBudget` candidates per strategy), after which
 * only the coarse grid is scanned. The wall clock (`arrangeBudgetMs`) is only a hard backstop.
 * Every placement is checked against the occupancy layers, so the result is always valid.
 */
export function arrangePlate(
  inputs: ArrangeInput[],
  bed: BedSize,
  cfg: SlicerConfig = slicerConfig,
  clock: () => number = defaultClock,
): ArrangeResult {
  const t0 = clock()
  const step = cfg.arrangeAngleStepDeg
  const angles: number[] = []
  for (let k = 0; k * step < 360 - EPS; k++) angles.push(k * step)

  const plate = cfg.platePaddingMm
  const tallGap = Math.max(cfg.tallPaddingMm, plate)
  const isTall = (inp: ArrangeInput) => inp.height > cfg.tallItemMm
  const anyTall = inputs.some((inp) => inp.copies > 0 && isTall(inp))

  const items: Item[] = inputs
    .filter((input) => input.copies > 0)
    .map((input) => {
      const tall = isTall(input)
      const fp = input.footprint
      const usable = fp.cells.length > 0 && fp.hull.length > 0
      return {
        index: inputs.indexOf(input),
        input,
        tall,
        area: (fp.cells.length / 2) * fp.res ** 2,
        rotations: usable
          ? buildRotations(fp, angles, tall ? tallGap - plate / 2 : plate / 2, anyTall ? tallGap / 2 : null)
          : [],
      }
    })
    .sort((a, b) => b.area - a.area || b.input.height - a.input.height || a.index - b.index)

  const ctx: PackContext = {
    inputs,
    items,
    bed,
    margin: cfg.bedMarginMm,
    // grid cells around the bed, so grown masks never leave the grid
    border: Math.ceil((tallGap + 2) / CELL) + 4,
    workBudget: cfg.arrangeWorkBudget,
    outOfTime: () => clock() - t0 > cfg.arrangeBudgetMs,
  }
  const centre = pack(ctx, 'centre')
  if (centre.fits) return { fits: true, placements: centre.placements }
  const corner = pack(ctx, 'corner')
  const pick = corner.fits || corner.placed > centre.placed ? corner : centre
  return { fits: pick.fits, placements: pick.placements }
}
