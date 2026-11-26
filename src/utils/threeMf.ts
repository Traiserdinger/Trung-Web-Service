// 3MF reader. Worker-safe: no DOMParser, XML is scanned with a small tag
// tokenizer. Every <build><item> becomes one ThreeMfObject whose positions are
// non-indexed triangles in Z-up millimetres (same space as a raw STL).
import { unzipSync } from 'fflate'

export class ThreeMfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ThreeMfError'
  }
}

export interface ThreeMfObject {
  name: string
  /** Non-indexed triangles (9 floats each), Z-up, millimetres. */
  positions: Float32Array
}

export interface ThreeMfLimits {
  maxUnzippedBytes: number
  maxTriangles: number
}

const DEFAULT_LIMITS: ThreeMfLimits = { maxUnzippedBytes: 300 * 1024 * 1024, maxTriangles: 3_000_000 }

const CORRUPT = 'File 3MF không hợp lệ hoặc rỗng'
const TOO_HEAVY = 'File 3MF quá nặng, gửi qua Zalo'

const UNIT_MM: Record<string, number> = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000,
}

const MAX_DEPTH = 16

/** 4x3 affine matrix in 3MF order: m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32. */
type Matrix = number[]
const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

function parseTransform(s: string | undefined): Matrix {
  if (!s) return IDENTITY
  const n = s.trim().split(/\s+/).map(Number)
  if (n.length !== 12 || n.some((v) => !Number.isFinite(v))) throw new ThreeMfError(CORRUPT)
  return n
}

/** Matrix that applies `a` first, then `b` (row-vector convention). */
function compose(a: Matrix, b: Matrix): Matrix {
  const r = new Array<number>(12)
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++)
      r[row * 3 + col] = a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col]
  for (let col = 0; col < 3; col++)
    r[9 + col] = a[9] * b[col] + a[10] * b[3 + col] + a[11] * b[6 + col] + b[9 + col]
  return r
}

interface ComponentRef {
  objectid: string
  path?: string
  transform: Matrix
}

interface ModelObject {
  name?: string
  vertices: number[]
  triangles: number[]
  components: ComponentRef[]
}

interface BuildItem {
  objectid: string
  path?: string
  transform: Matrix
}

interface ParsedModel {
  unit?: string
  objects: Map<string, ModelObject>
  items: BuildItem[]
}

const TAG_RE = /<(\/?)([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g
const ATTR_RE = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  ATTR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ATTR_RE.exec(src))) {
    const key = m[1]
    const colon = key.lastIndexOf(':')
    out[colon >= 0 ? key.slice(colon + 1) : key] = m[2] ?? m[3] ?? ''
  }
  return out
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
}

function parseModel(xml: string, limits: ThreeMfLimits): ParsedModel {
  const text = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
  const model: ParsedModel = { objects: new Map(), items: [] }
  let current: ModelObject | null = null
  let triangleCount = 0
  TAG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TAG_RE.exec(text))) {
    const closing = m[1] === '/'
    const tag = m[2].slice(m[2].lastIndexOf(':') + 1)
    if (closing) {
      if (tag === 'object') current = null
      continue
    }
    switch (tag) {
      case 'model':
        model.unit = parseAttrs(m[3]).unit
        break
      case 'object': {
        const a = parseAttrs(m[3])
        if (a.id === undefined) throw new ThreeMfError(CORRUPT)
        current = { name: a.name ? decodeEntities(a.name) : undefined, vertices: [], triangles: [], components: [] }
        model.objects.set(a.id, current)
        if (m[4] === '/') current = null
        break
      }
      case 'vertex': {
        if (!current) break
        const a = parseAttrs(m[3])
        const x = Number(a.x)
        const y = Number(a.y)
        const z = Number(a.z)
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new ThreeMfError(CORRUPT)
        current.vertices.push(x, y, z)
        break
      }
      case 'triangle': {
        if (!current) break
        const a = parseAttrs(m[3])
        const v1 = Number(a.v1)
        const v2 = Number(a.v2)
        const v3 = Number(a.v3)
        if (!Number.isInteger(v1) || !Number.isInteger(v2) || !Number.isInteger(v3)) throw new ThreeMfError(CORRUPT)
        if (++triangleCount > limits.maxTriangles) throw new ThreeMfError(TOO_HEAVY)
        current.triangles.push(v1, v2, v3)
        break
      }
      case 'component': {
        if (!current) break
        const a = parseAttrs(m[3])
        if (a.objectid === undefined) throw new ThreeMfError(CORRUPT)
        current.components.push({ objectid: a.objectid, path: a.path, transform: parseTransform(a.transform) })
        break
      }
      case 'item': {
        const a = parseAttrs(m[3])
        if (a.objectid === undefined) throw new ThreeMfError(CORRUPT)
        model.items.push({ objectid: a.objectid, path: a.path, transform: parseTransform(a.transform) })
        break
      }
    }
  }
  return model
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '')
}

function findRootModelPath(files: Record<string, Uint8Array>): string {
  const rels = files['_rels/.rels']
  if (rels) {
    const text = new TextDecoder().decode(rels)
    TAG_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = TAG_RE.exec(text))) {
      if (m[2].endsWith('Relationship') && m[1] !== '/') {
        const a = parseAttrs(m[3])
        if (a.Target && /3dmodel$/i.test(a.Type ?? '')) {
          const p = normalizePath(decodeEntities(a.Target))
          if (files[p]) return p
        }
      }
    }
  }
  return '3D/3dmodel.model'
}

export function parse3mf(buffer: ArrayBuffer, limits: ThreeMfLimits = DEFAULT_LIMITS): ThreeMfObject[] {
  try {
    return parse(buffer, limits)
  } catch (e) {
    if (e instanceof ThreeMfError) throw e
    throw new ThreeMfError(CORRUPT)
  }
}

function parse(buffer: ArrayBuffer, limits: ThreeMfLimits): ThreeMfObject[] {
  let total = 0
  const files = unzipSync(new Uint8Array(buffer), {
    filter: (file) => {
      total += file.originalSize
      if (total > limits.maxUnzippedBytes) throw new ThreeMfError(TOO_HEAVY)
      return /\.(model|rels)$/i.test(file.name)
    },
  })

  const rootPath = findRootModelPath(files)
  if (!files[rootPath]) throw new ThreeMfError(CORRUPT)

  const decoder = new TextDecoder()
  const cache = new Map<string, ParsedModel>()
  const load = (path: string): ParsedModel => {
    let model = cache.get(path)
    if (!model) {
      const bytes = files[path]
      if (!bytes) throw new ThreeMfError(CORRUPT)
      model = parseModel(decoder.decode(bytes), limits)
      cache.set(path, model)
    }
    return model
  }

  const root = load(rootPath)
  if (root.items.length === 0) throw new ThreeMfError(CORRUPT)
  const rootUnit = root.unit
  const scaleOf = (model: ParsedModel): number => UNIT_MM[model.unit ?? rootUnit ?? 'millimeter'] ?? 1

  // Pass 1: gather the transformed leaf meshes of every item and count triangles.
  interface Leaf {
    obj: ModelObject
    matrix: Matrix
    scale: number
  }
  const collect = (
    modelPath: string,
    objectid: string,
    matrix: Matrix,
    depth: number,
    out: Leaf[],
  ) => {
    if (depth > MAX_DEPTH) throw new ThreeMfError(CORRUPT)
    const model = load(modelPath)
    const obj = model.objects.get(objectid)
    if (!obj) throw new ThreeMfError(CORRUPT)
    if (obj.triangles.length > 0) out.push({ obj, matrix, scale: scaleOf(model) })
    for (const c of obj.components) {
      const childPath = c.path ? normalizePath(c.path) : modelPath
      collect(childPath, c.objectid, compose(c.transform, matrix), depth + 1, out)
    }
  }

  const results: ThreeMfObject[] = []
  const nameOf = (modelPath: string, objectid: string, index: number): string =>
    load(modelPath).objects.get(objectid)?.name || `#${index + 1}`
  let emitted = 0

  root.items.forEach((item, index) => {
    const modelPath = item.path ? normalizePath(item.path) : rootPath
    const leaves: Leaf[] = []
    collect(modelPath, item.objectid, item.transform, 0, leaves)
    let tris = 0
    for (const l of leaves) tris += l.obj.triangles.length / 3
    emitted += tris
    if (emitted > limits.maxTriangles) throw new ThreeMfError(TOO_HEAVY)
    if (tris === 0) throw new ThreeMfError(CORRUPT)

    const positions = new Float32Array(tris * 9)
    let o = 0
    for (const { obj, matrix: t, scale } of leaves) {
      const v = obj.vertices
      const nv = v.length / 3
      for (let i = 0; i < obj.triangles.length; i++) {
        const idx = obj.triangles[i]
        if (idx < 0 || idx >= nv) throw new ThreeMfError(CORRUPT)
        const x = v[idx * 3]
        const y = v[idx * 3 + 1]
        const z = v[idx * 3 + 2]
        positions[o++] = (x * t[0] + y * t[3] + z * t[6] + t[9]) * scale
        positions[o++] = (x * t[1] + y * t[4] + z * t[7] + t[10]) * scale
        positions[o++] = (x * t[2] + y * t[5] + z * t[8] + t[11]) * scale
      }
    }
    results.push({ name: nameOf(modelPath, item.objectid, index), positions })
  })

  return results
}
