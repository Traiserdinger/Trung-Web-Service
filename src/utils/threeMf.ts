// 3MF reader. Worker-safe: no DOMParser, XML is scanned with a small linear
// tag tokenizer (no backtracking regexes, so hostile input cannot hang it).
// Every <build><item> becomes one ThreeMfObject whose positions are
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

const isSpace = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r'

/** Linear attribute parser. Keys are local names (namespace prefix stripped). */
function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  const n = src.length
  let i = 0
  while (i < n) {
    while (i < n && isSpace(src[i])) i++
    const start = i
    while (i < n && !isSpace(src[i]) && src[i] !== '=' && src[i] !== '"' && src[i] !== "'") i++
    const key = src.slice(start, i)
    while (i < n && isSpace(src[i])) i++
    if (src[i] !== '=') {
      if (i === start) i++
      continue
    }
    i++
    while (i < n && isSpace(src[i])) i++
    const q = src[i]
    if (q !== '"' && q !== "'") continue
    const end = src.indexOf(q, i + 1)
    if (end < 0) break
    if (key) out[key.slice(key.lastIndexOf(':') + 1)] = src.slice(i + 1, end)
    i = end + 1
  }
  return out
}

interface Tag {
  closing: boolean
  selfClosing: boolean
  /** Local name (namespace prefix stripped). */
  name: string
  attrs: string
}

/**
 * Linear single-pass tag scanner. Skips comments, CDATA, processing
 * instructions and DOCTYPE; throws on unterminated or malformed markup.
 */
function scanTags(text: string, onTag: (t: Tag) => void): void {
  const n = text.length
  let pos = 0
  for (;;) {
    const lt = text.indexOf('<', pos)
    if (lt < 0) return
    if (text.startsWith('<!--', lt)) {
      const e = text.indexOf('-->', lt + 4)
      if (e < 0) throw new ThreeMfError(CORRUPT)
      pos = e + 3
      continue
    }
    if (text.startsWith('<![CDATA[', lt)) {
      const e = text.indexOf(']]>', lt + 9)
      if (e < 0) throw new ThreeMfError(CORRUPT)
      pos = e + 3
      continue
    }
    if (text[lt + 1] === '?' || text[lt + 1] === '!') {
      const e = text.indexOf('>', lt + 2)
      if (e < 0) throw new ThreeMfError(CORRUPT)
      pos = e + 1
      continue
    }
    let i = lt + 1
    const closing = text[i] === '/'
    if (closing) i++
    const nameStart = i
    while (i < n && !isSpace(text[i]) && text[i] !== '>' && text[i] !== '/' && text[i] !== '<') i++
    const qname = text.slice(nameStart, i)
    if (!qname) throw new ThreeMfError(CORRUPT)
    const attrStart = i
    let end = -1
    while (i < n) {
      const c = text[i]
      if (c === '>') {
        end = i
        break
      }
      if (c === '<') throw new ThreeMfError(CORRUPT)
      if (c === '"' || c === "'") {
        const q = text.indexOf(c, i + 1)
        if (q < 0) throw new ThreeMfError(CORRUPT)
        i = q + 1
      } else i++
    }
    if (end < 0) throw new ThreeMfError(CORRUPT)
    const selfClosing = end - 1 >= attrStart && text[end - 1] === '/'
    onTag({
      closing,
      selfClosing,
      name: qname.slice(qname.lastIndexOf(':') + 1),
      attrs: text.slice(attrStart, selfClosing ? end - 1 : end),
    })
    pos = end + 1
  }
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
  const model: ParsedModel = { objects: new Map(), items: [] }
  let current: ModelObject | null = null
  let triangleCount = 0
  let vertexCount = 0
  scanTags(xml, (t) => {
    if (t.closing) {
      if (t.name === 'object') current = null
      return
    }
    const a = parseAttrs(t.attrs)
    switch (t.name) {
      case 'model':
        model.unit = a.unit
        break
      case 'object':
        if (a.id === undefined) throw new ThreeMfError(CORRUPT)
        current = { name: a.name ? decodeEntities(a.name) : undefined, vertices: [], triangles: [], components: [] }
        model.objects.set(a.id, current)
        if (t.selfClosing) current = null
        break
      case 'vertex': {
        if (!current) break
        const x = Number(a.x)
        const y = Number(a.y)
        const z = Number(a.z)
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new ThreeMfError(CORRUPT)
        if (++vertexCount > limits.maxTriangles * 3) throw new ThreeMfError(TOO_HEAVY)
        current.vertices.push(x, y, z)
        break
      }
      case 'triangle': {
        if (!current) break
        const v1 = Number(a.v1)
        const v2 = Number(a.v2)
        const v3 = Number(a.v3)
        if (!Number.isInteger(v1) || !Number.isInteger(v2) || !Number.isInteger(v3)) throw new ThreeMfError(CORRUPT)
        if (++triangleCount > limits.maxTriangles) throw new ThreeMfError(TOO_HEAVY)
        current.triangles.push(v1, v2, v3)
        break
      }
      case 'component':
        if (!current) break
        if (a.objectid === undefined) throw new ThreeMfError(CORRUPT)
        current.components.push({ objectid: a.objectid, path: a.path, transform: parseTransform(a.transform) })
        break
      case 'item':
        if (a.objectid === undefined) throw new ThreeMfError(CORRUPT)
        model.items.push({ objectid: a.objectid, path: a.path, transform: parseTransform(a.transform) })
        break
    }
  })
  return model
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '')
}

function findRootModelPath(files: Record<string, Uint8Array>): string {
  const rels = files['_rels/.rels']
  if (rels) {
    let found: string | undefined
    scanTags(new TextDecoder().decode(rels), (t) => {
      if (found || t.closing || t.name !== 'Relationship') return
      const a = parseAttrs(t.attrs)
      if (a.Target && /3dmodel$/i.test(a.Type ?? '')) {
        const p = normalizePath(decodeEntities(a.Target))
        if (files[p]) found = p
      }
    })
    if (found) return found
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
  // Headers can under-declare sizes; re-check what was actually inflated.
  let actual = 0
  for (const f of Object.values(files)) actual += f.length
  if (actual > limits.maxUnzippedBytes) throw new ThreeMfError(TOO_HEAVY)

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

  interface Leaf {
    obj: ModelObject
    matrix: Matrix
    scale: number
  }
  // Budgets bound the work even for hostile component graphs (fan-out, cycles).
  const budget = { triangles: 0, visits: 0 }
  const inProgress = new Set<string>()
  const collect = (modelPath: string, objectid: string, matrix: Matrix, depth: number, out: Leaf[]) => {
    if (depth > MAX_DEPTH) throw new ThreeMfError(CORRUPT)
    if (++budget.visits > limits.maxTriangles) throw new ThreeMfError(TOO_HEAVY)
    const model = load(modelPath)
    const obj = model.objects.get(objectid)
    if (!obj) throw new ThreeMfError(CORRUPT)
    const key = `${modelPath}\n${objectid}`
    if (inProgress.has(key)) throw new ThreeMfError(CORRUPT)
    if (obj.triangles.length > 0) {
      budget.triangles += obj.triangles.length / 3
      if (budget.triangles > limits.maxTriangles) throw new ThreeMfError(TOO_HEAVY)
      out.push({ obj, matrix, scale: scaleOf(model) })
    }
    inProgress.add(key)
    for (const c of obj.components) {
      const childPath = c.path ? normalizePath(c.path) : modelPath
      collect(childPath, c.objectid, compose(c.transform, matrix), depth + 1, out)
    }
    inProgress.delete(key)
  }

  const results: ThreeMfObject[] = []
  const nameOf = (modelPath: string, objectid: string, index: number): string =>
    load(modelPath).objects.get(objectid)?.name || `#${index + 1}`

  root.items.forEach((item, index) => {
    const modelPath = item.path ? normalizePath(item.path) : rootPath
    const leaves: Leaf[] = []
    collect(modelPath, item.objectid, item.transform, 0, leaves)
    let tris = 0
    for (const l of leaves) tris += l.obj.triangles.length / 3
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
