import { describe, expect, it } from 'vitest'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { make3mf, modelXml, type FixtureObject } from '../../tests/fixtures/threeMf'
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

  it('does not hang on unterminated tags (linear scanner)', () => {
    for (const payload of ['<a '.repeat(70_000), '<!--'.repeat(70_000), '<a b="'.repeat(70_000)]) {
      const z = zipSync({ '3D/3dmodel.model': strToU8(payload) })
      const t0 = performance.now()
      expect(() => parse3mf(toBuffer(z))).toThrow(CORRUPT)
      expect(performance.now() - t0).toBeLessThan(500)
    }
  })

  it('does not hang on a very long attribute name', () => {
    const xml = '<model><resources><object id="1" ' + 'a'.repeat(300_000) + '/></resources><build/></model>'
    const z = zipSync({ '3D/3dmodel.model': strToU8(xml) })
    const t0 = performance.now()
    expect(() => parse3mf(toBuffer(z))).toThrow(ThreeMfError)
    expect(performance.now() - t0).toBeLessThan(500)
  })

  it('bounds exponential component fan-out', () => {
    const objects: FixtureObject[] = []
    for (let k = 1; k <= 16; k++)
      objects.push({ id: k, components: Array.from({ length: 10 }, () => ({ objectid: k + 1 })) })
    objects.push({ id: 17, mesh: makeBox(1, 1, 1) })
    const buf = make3mf({ objects, build: [{ objectid: 1 }] })
    const t0 = performance.now()
    expect(() => parse3mf(buf, { maxUnzippedBytes: 1e9, maxTriangles: 20_000 })).toThrow(HEAVY)
    expect(performance.now() - t0).toBeLessThan(500)
  })

  it('rejects a component cycle', () => {
    const buf = make3mf({
      objects: [
        { id: 1, components: [{ objectid: 2 }] },
        { id: 2, components: [{ objectid: 1 }] },
      ],
      build: [{ objectid: 1 }],
    })
    expect(() => parse3mf(buf)).toThrow(CORRUPT)
    const self = make3mf({ objects: [{ id: 1, components: [{ objectid: 1 }] }], build: [{ objectid: 1 }] })
    expect(() => parse3mf(self)).toThrow(CORRUPT)
  })

  it('composes nested component transforms', () => {
    const buf = make3mf({
      objects: [
        { id: 1, mesh: makeBox(1, 1, 1) },
        { id: 2, components: [{ objectid: 1, transform: '1 0 0 0 1 0 0 0 1 10 0 0' }] },
        { id: 3, components: [{ objectid: 2, transform: '1 0 0 0 1 0 0 0 1 0 20 0' }] },
      ],
      build: [{ objectid: 3, transform: '1 0 0 0 1 0 0 0 1 0 0 30' }],
    })
    const b = bbox(parse3mf(buf)[0].positions)
    expect(b.min).toEqual([10, 20, 30])
    expect(b.max).toEqual([11, 21, 31])
  })

  it('rejects malformed numbers', () => {
    const bad = make3mf({
      objects: [{ id: 1, mesh: makeBox(1, 1, 1) }],
      build: [{ objectid: 1, transform: '1 0 0 0 1 0 0 0 1 NaN 0 0' }],
    })
    expect(() => parse3mf(bad)).toThrow(CORRUPT)
    const xml = modelXml({ objects: [{ id: 1, mesh: makeBox(1, 1, 1) }], build: [{ objectid: 1 }] }).replace(
      /x="[^"]*"/,
      'x="abc"',
    )
    const z = zipSync({ '3D/3dmodel.model': strToU8(xml) })
    expect(() => parse3mf(toBuffer(z))).toThrow(CORRUPT)
  })

  it('supports p:path on a build item', () => {
    const buf = make3mf({
      objects: [],
      build: [],
      extraModels: {
        '3D/Objects/o.model': modelXml({ objects: [{ id: 5, name: 'Far', mesh: makeBox(2, 2, 2) }] }),
      },
    })
    // Patch the root model so its build item points at the external file.
    const files = unzipSync(new Uint8Array(buf))
    files['3D/3dmodel.model'] = strToU8(
      modelXml({ objects: [] }).replace(
        '<build/>',
        '<build><item p:path="/3D/Objects/o.model" objectid="5"/></build>',
      ),
    )
    const out = parse3mf(toBuffer(zipSync(files)))
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Far')
  })

  it('catches a zip whose header under-declares the size', () => {
    const big = modelXml({ objects: [{ id: 1, mesh: makeBox(1, 1, 1) }], build: [{ objectid: 1 }] }) + ' '.repeat(200_000)
    const z = zipSync({ '3D/3dmodel.model': strToU8(big) })
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength)
    for (let i = 0; i + 30 < z.length; i++) {
      const sig = dv.getUint32(i, true)
      if (sig === 0x04034b50) dv.setUint32(i + 22, 100, true)
      if (sig === 0x02014b50) dv.setUint32(i + 24, 100, true)
    }
    expect(() => parse3mf(toBuffer(z), { maxUnzippedBytes: 50_000, maxTriangles: 1000 })).toThrow(ThreeMfError)
  })
})
