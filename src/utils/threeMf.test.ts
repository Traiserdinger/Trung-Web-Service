import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { make3mf, modelXml } from '../../tests/fixtures/threeMf'
import { makeBox } from '../../tests/fixtures/meshes'
import { parse3mf, ThreeMfError } from './threeMf'

const CORRUPT = 'File 3MF không hợp lệ hoặc rỗng'
const HEAVY = 'File 3MF quá nặng, gửi qua Zalo'

function bbox(p: Float32Array) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[i + k])
      max[k] = Math.max(max[k], p[i + k])
    }
  return { min, max }
}

function toBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}

describe('parse3mf', () => {
  it('reads a single mesh object', () => {
    const buf = make3mf({ objects: [{ id: 1, mesh: makeBox(10, 20, 30) }], build: [{ objectid: 1 }] })
    const out = parse3mf(buf)
    expect(out).toHaveLength(1)
    expect(out[0].positions.length / 9).toBe(12)
    const b = bbox(out[0].positions)
    expect(b.min).toEqual([0, 0, 0])
    expect(b.max).toEqual([10, 20, 30])
  })

  it('one item per build item with transforms', () => {
    const buf = make3mf({
      objects: [{ id: 1, mesh: makeBox(10, 10, 10) }],
      build: [{ objectid: 1 }, { objectid: 1, transform: '1 0 0 0 1 0 0 0 1 50 0 0' }],
    })
    const out = parse3mf(buf)
    expect(out).toHaveLength(2)
    expect(bbox(out[1].positions).min[0] - bbox(out[0].positions).min[0]).toBeCloseTo(50)
    expect(bbox(out[1].positions).max[1]).toBeCloseTo(10)
  })

  it('applies a rotation transform in 3MF column order', () => {
    // 90 deg about Z: x' = x*m00 + y*m10 = -y, y' = x*m01 + y*m11 = x
    const buf = make3mf({
      objects: [{ id: 1, mesh: makeBox(10, 20, 5) }],
      build: [{ objectid: 1, transform: '0 1 0 -1 0 0 0 0 1 0 0 0' }],
    })
    const b = bbox(parse3mf(buf)[0].positions)
    expect(b.min[0]).toBeCloseTo(-20)
    expect(b.max[0]).toBeCloseTo(0)
    expect(b.max[1]).toBeCloseTo(10)
  })

  it('reads Bambu-style component p:path', () => {
    const inner = modelXml({ objects: [{ id: 7, name: 'inner', mesh: makeBox(10, 10, 10) }] })
    const buf = make3mf({
      objects: [
        {
          id: 2,
          name: 'Cube',
          components: [{ objectid: 7, path: '/3D/Objects/object_1.model', transform: '1 0 0 0 1 0 0 0 1 5 0 0' }],
        },
      ],
      build: [{ objectid: 2, transform: '1 0 0 0 1 0 0 0 1 100 0 0' }],
      extraModels: { '3D/Objects/object_1.model': inner },
    })
    const out = parse3mf(buf)
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Cube')
    const b = bbox(out[0].positions)
    expect(b.min[0]).toBeCloseTo(105)
    expect(b.max[0]).toBeCloseTo(115)
  })

  it('converts inch units', () => {
    const buf = make3mf({ objects: [{ id: 1, mesh: makeBox(1, 1, 1) }], build: [{ objectid: 1 }], unit: 'inch' })
    const b = bbox(parse3mf(buf)[0].positions)
    for (const v of b.max) expect(v).toBeCloseTo(25.4, 3)
  })

  it('names from object name or file #n', () => {
    const buf = make3mf({
      objects: [
        { id: 1, name: 'Bracket', mesh: makeBox(1, 1, 1) },
        { id: 2, mesh: makeBox(1, 1, 1) },
      ],
      build: [{ objectid: 1 }, { objectid: 2 }],
    })
    expect(parse3mf(buf).map((o) => o.name)).toEqual(['Bracket', '#2'])
  })

  it('rejects 3mf without build items', () => {
    const buf = make3mf({ objects: [{ id: 1, mesh: makeBox(1, 1, 1) }], build: [] })
    expect(() => parse3mf(buf)).toThrow(ThreeMfError)
    expect(() => parse3mf(buf)).toThrow(CORRUPT)
  })

  it('rejects missing component path', () => {
    const buf = make3mf({
      objects: [{ id: 2, components: [{ objectid: 7, path: '/3D/Objects/missing.model' }] }],
      build: [{ objectid: 2 }],
    })
    expect(() => parse3mf(buf)).toThrow(CORRUPT)
  })

  it('rejects zip bomb by unzipped size', () => {
    const buf = make3mf({ objects: [{ id: 1, mesh: makeBox(1, 1, 1) }], build: [{ objectid: 1 }] })
    expect(() => parse3mf(buf, { maxUnzippedBytes: 1024, maxTriangles: 1000 })).toThrow(HEAVY)
  })

  it('rejects too many triangles', () => {
    const buf = make3mf({ objects: [{ id: 1, mesh: makeBox(1, 1, 1) }], build: [{ objectid: 1 }] })
    expect(() => parse3mf(buf, { maxUnzippedBytes: 1e9, maxTriangles: 11 })).toThrow(HEAVY)
  })

  it('rejects non-zip bytes', () => {
    const buf = toBuffer(strToU8('this is not a zip file at all'))
    expect(() => parse3mf(buf)).toThrow(CORRUPT)
  })

  it('falls back to 3D/3dmodel.model without rels', () => {
    const z = zipSync({
      '3D/3dmodel.model': strToU8(modelXml({ objects: [{ id: 1, mesh: makeBox(2, 2, 2) }], build: [{ objectid: 1 }] })),
    })
    expect(parse3mf(toBuffer(z))).toHaveLength(1)
  })
})
