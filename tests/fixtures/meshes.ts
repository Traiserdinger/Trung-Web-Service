// Test-only mesh builders. Coordinates are STL-style (Z-up), non-indexed
// triangles (9 floats each), wound counter-clockwise when seen from outside.

type V3 = [number, number, number]

function pushQuad(out: number[], a: V3, b: V3, c: V3, d: V3) {
  out.push(...a, ...b, ...c, ...a, ...c, ...d)
}

export function makeBox(w: number, d: number, h: number, origin: V3 = [0, 0, 0]): Float32Array {
  const [x0, y0, z0] = origin
  const x1 = x0 + w
  const y1 = y0 + d
  const z1 = z0 + h
  const o: number[] = []
  pushQuad(o, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]) // top +z
  pushQuad(o, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]) // bottom -z
  pushQuad(o, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]) // front -y
  pushQuad(o, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]) // back +y
  pushQuad(o, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]) // left -x
  pushQuad(o, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]) // right +x
  return new Float32Array(o)
}

export function makeUvSphere(r: number, segments = 64, rings = 32): Float32Array {
  const p = (i: number, j: number): V3 => {
    const theta = (Math.PI * i) / rings
    const phi = (2 * Math.PI * j) / segments
    return [r * Math.sin(theta) * Math.cos(phi), r * Math.sin(theta) * Math.sin(phi), r * Math.cos(theta)]
  }
  const o: number[] = []
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      pushQuad(o, p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1))
    }
  }
  return new Float32Array(o)
}

export function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

export function flipWinding(p: Float32Array): Float32Array {
  const out = new Float32Array(p)
  for (let t = 0; t < p.length; t += 9) {
    for (let k = 0; k < 3; k++) {
      out[t + 3 + k] = p[t + 6 + k]
      out[t + 6 + k] = p[t + 3 + k]
    }
  }
  return out
}

export function removeTriangles(p: Float32Array, indices: number[]): Float32Array {
  const drop = new Set(indices)
  const kept: number[] = []
  for (let t = 0; t < p.length / 9; t++) {
    if (!drop.has(t)) kept.push(...p.subarray(t * 9, t * 9 + 9))
  }
  return new Float32Array(kept)
}

/** T shape: 10×10×20 stem with a 30×10×5 bar on top (bar underside = 300 mm² overhang). */
export function makeTShape(): Float32Array {
  return concat(makeBox(10, 10, 20, [10, 0, 0]), makeBox(30, 10, 5, [0, 0, 20]))
}

/** Binary STL: 80-byte header, uint32 count, 50 bytes per triangle. */
export function toBinaryStl(p: Float32Array, header = 'binary test stl'): ArrayBuffer {
  const n = p.length / 9
  const buf = new ArrayBuffer(84 + n * 50)
  const view = new DataView(buf)
  const bytes = new TextEncoder().encode(header.slice(0, 80))
  new Uint8Array(buf, 0, bytes.length).set(bytes)
  view.setUint32(80, n, true)
  for (let t = 0; t < n; t++) {
    const off = 84 + t * 50 + 12 // skip normal (left as 0,0,0)
    for (let k = 0; k < 9; k++) view.setFloat32(off + k * 4, p[t * 9 + k], true)
  }
  return buf
}

export function toAsciiStl(p: Float32Array): ArrayBuffer {
  const lines = ['solid test']
  for (let t = 0; t < p.length; t += 9) {
    lines.push('  facet normal 0 0 0', '    outer loop')
    for (let k = 0; k < 9; k += 3) lines.push(`      vertex ${p[t + k]} ${p[t + k + 1]} ${p[t + k + 2]}`)
    lines.push('    endloop', '  endfacet')
  }
  lines.push('endsolid test')
  return new TextEncoder().encode(lines.join('\n')).buffer as ArrayBuffer
}
