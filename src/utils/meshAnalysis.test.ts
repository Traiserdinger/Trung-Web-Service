import { describe, expect, it } from 'vitest'
import { concat, flipWinding, makeBox, makeFlare, makeTShape, makeUvSphere, removeTriangles } from '../../tests/fixtures/meshes'
import { analyzeMesh, exceedsBed, isSuspectedInches, orientZUpToYUp } from './meshAnalysis'

const analyze = (p: Float32Array) => analyzeMesh(orientZUpToYUp(p))

describe('meshAnalysis', () => {
  it('fixture box has outward winding', () => {
    expect(analyze(makeBox(10, 10, 10)).signedVolume).toBeGreaterThan(0)
  })

  it('cube 10mm: volume, area, watertight, triangles', () => {
    const s = analyze(makeBox(10, 10, 10))
    expect(s.volume).toBeCloseTo(1000, 6)
    expect(s.surfaceArea).toBeCloseTo(600, 6)
    expect(s.isWatertight).toBe(true)
    expect(s.triangleCount).toBe(12)
  })

  it('orient: Z-up to Y-up, centred on XZ, resting on y=0', () => {
    const p = orientZUpToYUp(makeBox(20, 10, 5, [3, 4, 7]))
    const s = analyzeMesh(p)
    expect(s.dims.length).toBeCloseTo(20, 9)
    expect(s.dims.width).toBeCloseTo(10, 9)
    expect(s.dims.height).toBeCloseTo(5, 9)
    let minY = Infinity
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (let i = 0; i < p.length; i += 3) {
      minX = Math.min(minX, p[i])
      maxX = Math.max(maxX, p[i])
      minY = Math.min(minY, p[i + 1])
      minZ = Math.min(minZ, p[i + 2])
      maxZ = Math.max(maxZ, p[i + 2])
    }
    expect(minY).toBeCloseTo(0, 9)
    expect((minX + maxX) / 2).toBeCloseTo(0, 9)
    expect((minZ + maxZ) / 2).toBeCloseTo(0, 9)
  })

  it('sphere r=10 within 2% of analytic volume and area', () => {
    const s = analyze(makeUvSphere(10, 64, 32))
    expect(Math.abs(s.volume - 4188.79) / 4188.79).toBeLessThan(0.02)
    expect(Math.abs(s.surfaceArea - 1256.64) / 1256.64).toBeLessThan(0.02)
  })

  it('open mesh is not watertight', () => {
    expect(analyze(removeTriangles(makeBox(10, 10, 10), [0, 1])).isWatertight).toBe(false)
  })

  it('overhang: T shape bar underside counts, cube on bed does not', () => {
    expect(analyze(makeTShape()).overhangArea).toBeCloseTo(300, 3)
    expect(analyze(makeBox(10, 10, 10)).overhangArea).toBe(0)
  })

  it('counts overhang faces that touch the bed with one corner (CAD tessellation)', () => {
    const s = analyze(makeFlare())
    expect(s.signedVolume).toBeGreaterThan(0)
    // 4 mặt hình thang: (10 + 70) / 2 × √(30² + 20²)
    expect(s.overhangArea).toBeCloseTo(4 * 40 * Math.hypot(30, 20), 1)
  })

  it('a body with inverted winding next to a correct one keeps both volumes', () => {
    const mixed = concat(makeBox(50, 50, 50), flipWinding(makeBox(50, 50, 50, [70, 0, 0])))
    expect(analyze(mixed).volume).toBeCloseTo(250000, 0)
  })

  it('a single flipped face makes the mesh not watertight', () => {
    const box = makeBox(10, 10, 10)
    const flippedTop = concat(flipWinding(box.slice(0, 18)), box.slice(18))
    expect(analyze(flippedTop).isWatertight).toBe(false)
  })

  it('inverted winding still gives positive volume and the same overhang', () => {
    const s = analyze(flipWinding(makeTShape()))
    expect(s.signedVolume).toBeLessThan(0)
    expect(s.volume).toBeGreaterThan(0)
    expect(s.overhangArea).toBeCloseTo(300, 3)
  })

  it('suspects inches when the largest side is under 5 mm', () => {
    expect(isSuspectedInches({ length: 2, width: 1, height: 1 })).toBe(true)
    expect(isSuspectedInches({ length: 10, width: 1, height: 1 })).toBe(false)
  })

  it('exceedsBed reports the axes over the limit', () => {
    expect(exceedsBed({ length: 210, width: 90, height: 40 }, { x: 180, y: 180, z: 180 })).toEqual({
      exceeds: true,
      axes: ['length'],
    })
    expect(exceedsBed({ length: 180, width: 90, height: 40 }, { x: 180, y: 180, z: 180 }).exceeds).toBe(false)
  })
})
