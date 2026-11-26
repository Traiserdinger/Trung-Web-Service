import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { analyzeMesh, orientZUpToYUp, scalePositions, type MeshStats } from './meshAnalysis'
import { applyDown, findBestDown } from './orientation'

export class StlParseError extends Error {}

const INVALID = 'File STL không hợp lệ hoặc rỗng'
const NOT_FINITE = 'File STL có toạ độ không hợp lệ (NaN hoặc vô cực). Hãy xuất lại file từ phần mềm CAD.'

function parsePositions(buffer: ArrayBuffer): Float32Array {
  const geometry = new STLLoader().parse(buffer)
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  const source = flat.getAttribute('position')
  const raw = source ? new Float32Array(source.array as ArrayLike<number>) : new Float32Array(0)
  geometry.dispose()
  return raw
}

/**
 * STL binary có header bắt đầu bằng "solid" VÀ có byte thừa ở cuối bị STLLoader đoán là ASCII.
 * Nếu số tam giác trong header khớp được với kích thước file thì cắt phần thừa và đọc lại dạng binary.
 */
function binaryFallback(buffer: ArrayBuffer): Float32Array | null {
  if (buffer.byteLength < 84 + 50) return null
  const n = new DataView(buffer).getUint32(80, true)
  const expected = 84 + 50 * n
  if (n === 0 || expected > buffer.byteLength) return null
  return parsePositions(buffer.slice(0, expected))
}

export interface ProcessedStl {
  positions: Float32Array
  stats: MeshStats
  /** true khi đã xoay khác hướng gốc của file */
  rotated: boolean
}

/** Z-up thô (mm) → scale → Y-up → (tuỳ chọn) tự xoay hướng in tốt nhất → phân tích. */
export function prepareMesh(rawZUp: Float32Array, scale: number, autoOrient: boolean): ProcessedStl {
  return prepareYUpMesh(orientZUpToYUp(scale === 1 ? rawZUp : scalePositions(rawZUp, scale)), 1, autoOrient)
}

/** Như prepareMesh nhưng đầu vào đã là Y-up (tâm XZ = 0, minY = 0, scale 1): dùng khi đổi inch / hướng. */
export function prepareYUpMesh(yUp: Float32Array, scale: number, autoOrient: boolean): ProcessedStl {
  let positions = scale === 1 ? yUp : scalePositions(yUp, scale)
  let rotated = false
  if (autoOrient) {
    const best = findBestDown(positions)
    rotated = best.down[1] > -0.99999
    if (rotated) positions = applyDown(positions, best.down)
  }
  return { positions, stats: analyzeMesh(positions), rotated }
}

/** Parse STL (binary hoặc ASCII) → toạ độ thô Z-up (mm), kiểm tra hợp lệ. */
export function parseStlPositions(buffer: ArrayBuffer): Float32Array {
  let raw: Float32Array
  try {
    raw = parsePositions(buffer)
    if (raw.length < 9) raw = binaryFallback(buffer) ?? raw
  } catch {
    throw new StlParseError(INVALID)
  }
  if (raw.length < 9) throw new StlParseError(INVALID)
  for (let i = 0; i < raw.length; i++) if (!Number.isFinite(raw[i])) throw new StlParseError(NOT_FINITE)
  return raw
}

/** Parse STL → scale → Y-up → (tuỳ chọn) tự xoay hướng in tốt nhất → phân tích. */
export function processStl(buffer: ArrayBuffer, scale = 1, autoOrient = false): ProcessedStl {
  return prepareMesh(parseStlPositions(buffer), scale, autoOrient)
}
