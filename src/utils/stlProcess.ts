import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { analyzeMesh, orientZUpToYUp, scalePositions, type MeshStats } from './meshAnalysis'

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

/** Parse STL (binary hoặc ASCII) → scale → đổi trục Z-up sang Y-up → phân tích. */
export function processStl(buffer: ArrayBuffer, scale = 1): { positions: Float32Array; stats: MeshStats } {
  let raw: Float32Array
  try {
    raw = parsePositions(buffer)
    if (raw.length < 9) raw = binaryFallback(buffer) ?? raw
  } catch {
    throw new StlParseError(INVALID)
  }
  if (raw.length < 9) throw new StlParseError(INVALID)
  for (let i = 0; i < raw.length; i++) if (!Number.isFinite(raw[i])) throw new StlParseError(NOT_FINITE)

  const scaled = scale === 1 ? raw : scalePositions(raw, scale)
  const positions = orientZUpToYUp(scaled)
  return { positions, stats: analyzeMesh(positions) }
}
