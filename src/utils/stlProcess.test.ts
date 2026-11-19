import { describe, expect, it } from 'vitest'
import { makeBox, toAsciiStl, toBinaryStl } from '../../tests/fixtures/meshes'
import { processStl, StlParseError } from './stlProcess'

describe('processStl', () => {
  it('parses binary STL', () => {
    expect(processStl(toBinaryStl(makeBox(10, 10, 10))).stats.volume).toBeCloseTo(1000, 3)
  })

  it('parses ASCII STL', () => {
    expect(processStl(toAsciiStl(makeBox(10, 10, 10))).stats.volume).toBeCloseTo(1000, 3)
  })

  it('parses binary STL whose header starts with "solid"', () => {
    const buf = toBinaryStl(makeBox(10, 10, 10), 'solid exported by SolidWorks')
    expect(processStl(buf).stats.volume).toBeCloseTo(1000, 3)
  })

  it('applies scale (inch → mm)', () => {
    const { stats } = processStl(toBinaryStl(makeBox(1, 1, 1)), 25.4)
    expect(stats.dims.length).toBeCloseTo(25.4, 4)
  })

  it('returns oriented positions resting on y = 0', () => {
    const { positions } = processStl(toBinaryStl(makeBox(10, 10, 10, [0, 0, 5])))
    let minY = Infinity
    for (let i = 1; i < positions.length; i += 3) minY = Math.min(minY, positions[i])
    expect(minY).toBeCloseTo(0, 6)
  })

  it('throws StlParseError for an empty file', () => {
    expect(() => processStl(new ArrayBuffer(84))).toThrow(StlParseError)
  })
})
