import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { printerConfig } from '../config/pricingConfig'
import { makeBox } from '../../tests/fixtures/meshes'
import { orientZUpToYUp } from './meshAnalysis'
import { parse3mf } from './threeMf'
import { buildPlate3mf } from './plateFile'

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

const toBuffer = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
const bed = printerConfig.bed

describe('buildPlate3mf', () => {
  const a = orientZUpToYUp(makeBox(20, 10, 5))
  const b = orientZUpToYUp(makeBox(8, 8, 12))

  it('round-trips through parse3mf', () => {
    const placements = [
      { x: 30, y: 40, rotDeg: 0 },
      { x: 100, y: 50, rotDeg: 0 },
      { x: 60.5, y: 120, rotDeg: 0 },
    ]
    const out = parse3mf(
      toBuffer(
        buildPlate3mf(
          [
            { itemNo: 1, name: 'a.stl', positions: a, placements: placements.slice(0, 2) },
            { itemNo: 2, name: 'b.stl', positions: b, placements: placements.slice(2) },
          ],
          bed,
        ),
      ),
    )
    expect(out).toHaveLength(3)
    expect(out[0].name).toBe('1 - a.stl')
    expect(out[2].name).toBe('2 - b.stl')
    out.forEach((o, i) => {
      const bb = bbox(o.positions)
      expect((bb.min[0] + bb.max[0]) / 2).toBeCloseTo(placements[i].x, 1)
      expect((bb.min[1] + bb.max[1]) / 2).toBeCloseTo(placements[i].y, 1)
      expect(bb.min[2]).toBeCloseTo(0, 5)
    })
  })

  it('rotation of 90 degrees swaps the footprint dims', () => {
    const out = parse3mf(
      toBuffer(buildPlate3mf([{ itemNo: 1, name: 'a.stl', positions: a, placements: [{ x: 50, y: 50, rotDeg: 90 }] }], bed)),
    )
    const bb = bbox(out[0].positions)
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(10, 2)
    expect(bb.max[1] - bb.min[1]).toBeCloseTo(20, 2)
    expect((bb.min[0] + bb.max[0]) / 2).toBeCloseTo(50, 2)
  })

  it('has content types, rels, millimeter unit and deduplicated vertices', () => {
    const files = unzipSync(buildPlate3mf([{ itemNo: 1, name: 'a & <b>.stl', positions: a, placements: [{ x: 1, y: 2, rotDeg: 0 }] }], bed))
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model']))
    const xml = new TextDecoder().decode(files['3D/3dmodel.model'])
    expect(xml).toContain('unit="millimeter"')
    expect(xml).toContain('1 - a &amp; &lt;b&gt;.stl')
    expect(xml.match(/<vertex /g)).toHaveLength(8)
    expect(xml.match(/<triangle /g)).toHaveLength(12)
  })
})
