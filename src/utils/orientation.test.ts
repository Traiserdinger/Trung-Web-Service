import { describe, expect, it } from 'vitest'
import { flipWinding, makeBox, makeFlare, makeTShape, makeUvSphere } from '../../tests/fixtures/meshes'
import { analyzeMesh, orientZUpToYUp } from './meshAnalysis'
import { applyDown, findBestDown, ORIGINAL_DOWN, rotationToDown, type Vec3 } from './orientation'

const yUp = (p: Float32Array) => orientZUpToYUp(p)
const autoOrient = (p: Float32Array) => applyDown(p, findBestDown(p).down)

describe('rotationToDown', () => {
  it.each<Vec3>([
    [1, 0, 0],
    [0, 0, -1],
    [0, 1, 0],
    [0.3, -0.5, 0.81],
  ])('maps %j onto −Y', (...d) => {
    const m = rotationToDown(d)
    const l = Math.hypot(...d)
    const v = d.map((c) => c / l)
    expect(m[0] * v[0] + m[1] * v[1] + m[2] * v[2]).toBeCloseTo(0, 9)
    expect(m[3] * v[0] + m[4] * v[1] + m[5] * v[2]).toBeCloseTo(-1, 9)
    expect(m[6] * v[0] + m[7] * v[1] + m[8] * v[2]).toBeCloseTo(0, 9)
  })
})

describe('findBestDown + applyDown', () => {
  it('lays a standing plate flat (the 143 × 3 × 123 mm case)', () => {
    const stats = analyzeMesh(autoOrient(yUp(makeBox(143, 3, 123))))
    expect(stats.dims.height).toBeCloseTo(3, 3)
    expect(Math.max(stats.dims.length, stats.dims.width)).toBeCloseTo(143, 3)
    expect(stats.volume).toBeCloseTo(143 * 3 * 123, 1)
  })

  it('keeps a part that already lies flat as it is', () => {
    expect(findBestDown(yUp(makeBox(143, 123, 3))).down).toEqual(ORIGINAL_DOWN)
  })

  it('works when the file has inverted winding', () => {
    const stats = analyzeMesh(autoOrient(yUp(flipWinding(makeBox(143, 3, 123)))))
    expect(stats.dims.height).toBeCloseTo(3, 3)
  })

  it('flips a T so the bar sits on the bed and needs no support', () => {
    const before = analyzeMesh(yUp(makeTShape()))
    const after = analyzeMesh(autoOrient(yUp(makeTShape())))
    expect(before.overhangArea).toBeGreaterThan(100)
    expect(after.overhangArea).toBeCloseTo(0, 3)
  })

  it('turns a flared part wide face down', () => {
    const after = analyzeMesh(autoOrient(yUp(makeFlare())))
    expect(after.overhangArea).toBeCloseTo(0, 3)
  })

  it('leaves a sphere alone', () => {
    expect(findBestDown(yUp(makeUvSphere(20, 32, 16))).down).toEqual(ORIGINAL_DOWN)
  })

  it('rests the result on y = 0, centred on the bed', () => {
    const p = applyDown(yUp(makeBox(40, 10, 20)), [1, 0, 0])
    let minY = Infinity, minX = Infinity, maxX = -Infinity
    for (let i = 0; i < p.length; i += 3) {
      minY = Math.min(minY, p[i + 1])
      minX = Math.min(minX, p[i])
      maxX = Math.max(maxX, p[i])
    }
    expect(minY).toBeCloseTo(0, 5)
    expect(minX + maxX).toBeCloseTo(0, 5)
  })
})
