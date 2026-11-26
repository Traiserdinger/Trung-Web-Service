import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { printerConfig } from '../config/pricingConfig'
import { makeBox, toBinaryStl } from '../../tests/fixtures/meshes'
import { make3mf } from '../../tests/fixtures/threeMf'
import { handleRequest } from './handleRequest'

const bed = printerConfig.bed
type Part = { name: string; source: Float32Array; positions: Float32Array; stats: { dims: { length: number } } }

function parseFile(buffer: ArrayBuffer, fileType: 'stl' | '3mf', scale = 1, autoOrient = false) {
  const { reply } = handleRequest({ id: 1, kind: 'parseFile', buffer, fileType, scale, autoOrient })
  return (reply as { parts: Part[] }).parts
}

describe('handleRequest', () => {
  it('parseFile stl returns one part named after nothing', () => {
    const parts = parseFile(toBinaryStl(makeBox(10, 20, 30)), 'stl')
    expect(parts).toHaveLength(1)
    expect(parts[0].name).toBe('')
    expect(parts[0].source).not.toBe(parts[0].positions)
    expect(parts[0].source.buffer).not.toBe(parts[0].positions.buffer)
  })

  it('parseFile 3mf returns one part per build item', () => {
    const buf = make3mf({
      objects: [
        { id: 1, name: 'A', mesh: makeBox(10, 10, 10) },
        { id: 2, mesh: makeBox(5, 5, 5) },
      ],
      build: [{ objectid: 1 }, { objectid: 2 }],
    })
    const parts = parseFile(buf, '3mf')
    expect(parts.map((p) => p.name)).toEqual(['A', '#2'])
  })

  it('prepare with scale 25.4 multiplies dims', () => {
    const [part] = parseFile(toBinaryStl(makeBox(1, 1, 1)), 'stl')
    const { reply } = handleRequest({ id: 2, kind: 'prepare', source: part.source, scale: 25.4, autoOrient: false })
    expect((reply as Part).stats.dims.length).toBeCloseTo(25.4, 3)
  })

  it('arrange returns hulls per item', () => {
    const [part] = parseFile(toBinaryStl(makeBox(20, 20, 10)), 'stl')
    const { reply } = handleRequest({
      id: 3,
      kind: 'arrange',
      inputs: [{ itemId: 'a', copies: 2, positions: part.positions, height: 10 }],
      bed,
    })
    const r = reply as { fits: boolean; placements: Record<string, unknown[]>; hulls: Record<string, number[][]> }
    expect(r.fits).toBe(true)
    expect(r.placements.a).toHaveLength(2)
    expect(r.hulls.a.length).toBeGreaterThanOrEqual(3)
  })

  it('buildPlate returns zip bytes starting with PK', () => {
    const [part] = parseFile(toBinaryStl(makeBox(20, 20, 10)), 'stl')
    const { reply } = handleRequest({
      id: 4,
      kind: 'buildPlate',
      parts: [{ itemNo: 1, name: 'a', positions: part.positions, placements: [{ x: 50, y: 50, rotDeg: 0 }] }],
      bed,
    })
    const { bytes } = reply as { bytes: Uint8Array }
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
  })

  it('3mf errors keep their message', () => {
    const bad = zipSync({ '3D/3dmodel.model': strToU8('<model/>') })
    const buf = bad.buffer.slice(bad.byteOffset, bad.byteOffset + bad.byteLength) as ArrayBuffer
    expect(() => parseFile(buf, '3mf')).toThrow(/3MF/)
  })
})
