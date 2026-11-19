import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { analyzeMesh, orientZUpToYUp, scalePositions, type MeshStats } from './meshAnalysis'

export class StlParseError extends Error {}

const INVALID = 'File STL không hợp lệ hoặc rỗng'

/** Parse STL (binary hoặc ASCII) → scale → đổi trục Z-up sang Y-up → phân tích. */
export function processStl(buffer: ArrayBuffer, scale = 1): { positions: Float32Array; stats: MeshStats } {
  let raw: Float32Array
  try {
    const geometry = new STLLoader().parse(buffer)
    const flat = geometry.index ? geometry.toNonIndexed() : geometry
    const source = flat.getAttribute('position')
    raw = source ? new Float32Array(source.array as ArrayLike<number>) : new Float32Array(0)
    geometry.dispose()
  } catch {
    throw new StlParseError(INVALID)
  }
  if (raw.length < 9) throw new StlParseError(INVALID)

  const scaled = scale === 1 ? raw : scalePositions(raw, scale)
  const positions = orientZUpToYUp(scaled)
  return { positions, stats: analyzeMesh(positions) }
}
