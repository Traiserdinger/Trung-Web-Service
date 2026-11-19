import { slicerConfig, type BedSize, type SlicerConfig } from '../config/pricingConfig'

/** Kích thước bao sau khi đổi trục: length = X, width = Z, height = Y (mm). */
export interface Dims {
  length: number
  width: number
  height: number
}

export interface MeshStats {
  dims: Dims
  /** mm² */
  surfaceArea: number
  /** mm³, luôn dương */
  volume: number
  /** mm³, âm khi winding của file bị đảo */
  signedVolume: number
  isWatertight: boolean
  /** mm² mặt treo cần support */
  overhangArea: number
  triangleCount: number
}

/** STL Z-up → three.js Y-up: (x, y, z) → (x, z, −y); sau đó tâm XZ = 0 và minY = 0. */
export function orientZUpToYUp(p: Float32Array): Float32Array {
  const out = new Float32Array(p.length)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]
    const y = p[i + 2]
    const z = -p[i + 1]
    out[i] = x
    out[i + 1] = y
    out[i + 2] = z
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  for (let i = 0; i < out.length; i += 3) {
    out[i] -= cx
    out[i + 1] -= minY
    out[i + 2] -= cz
  }
  return out
}

export function scalePositions(p: Float32Array, factor: number): Float32Array {
  const out = new Float32Array(p.length)
  for (let i = 0; i < p.length; i++) out[i] = p[i] * factor
  return out
}

export function analyzeMesh(p: Float32Array, cfg: SlicerConfig = slicerConfig): MeshStats {
  const triangleCount = Math.floor(p.length / 9)
  let area = 0
  let signed = 0
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity

  // Diện tích từng tam giác + pháp tuyến (chưa chuẩn hoá theo chiều winding) để tính mặt treo sau.
  const triArea = new Float64Array(triangleCount)
  const triNy = new Float64Array(triangleCount)
  // Đỉnh cao nhất của tam giác: mặt chỉ bị loại khi NẰM HẲN sát bàn in (max y ≤ bedContactMm),
  // vì tam giác CAD dài thường có một góc chạm bàn mà vẫn là mặt treo.
  const triMaxY = new Float64Array(triangleCount)

  for (let t = 0; t < triangleCount; t++) {
    const o = t * 9
    const ax = p[o], ay = p[o + 1], az = p[o + 2]
    const bx = p[o + 3], by = p[o + 4], bz = p[o + 5]
    const cx = p[o + 6], cy = p[o + 7], cz = p[o + 8]

    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    const a = len / 2
    area += a
    triArea[t] = a
    triNy[t] = len > 0 ? ny / len : 0
    triMaxY[t] = Math.max(ay, by, cy)

    // a · (b × c) / 6
    signed += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6

    minX = Math.min(minX, ax, bx, cx)
    maxX = Math.max(maxX, ax, bx, cx)
    minY = Math.min(minY, ay, by, cy)
    maxY = Math.max(maxY, ay, by, cy)
    minZ = Math.min(minZ, az, bz, cz)
    maxZ = Math.max(maxZ, az, bz, cz)
  }

  // Nếu winding của cả file bị đảo thì pháp tuyến hướng vào trong — lật lại.
  const orientation = signed < 0 ? -1 : 1
  const threshold = -Math.cos((cfg.overhangAngleDeg * Math.PI) / 180)
  let overhangArea = 0
  for (let t = 0; t < triangleCount; t++) {
    if (triNy[t] * orientation < threshold && triMaxY[t] > cfg.bedContactMm) overhangArea += triArea[t]
  }

  const dims: Dims =
    triangleCount > 0
      ? { length: maxX - minX, width: maxZ - minZ, height: maxY - minY }
      : { length: 0, width: 0, height: 0 }

  return {
    dims,
    surfaceArea: area,
    volume: Math.abs(signed),
    signedVolume: signed,
    isWatertight: triangleCount > 0 && checkWatertight(p, triangleCount),
    overhangArea,
    triangleCount,
  }
}

/** Mỗi cạnh (sau khi gộp đỉnh trùng, sai số 1e-4 mm) phải thuộc đúng 2 tam giác. */
function checkWatertight(p: Float32Array, triangleCount: number): boolean {
  const vertexIds = new Map<string, number>()
  const idOf = (i: number) => {
    const key = `${Math.round(p[i] * 1e4)},${Math.round(p[i + 1] * 1e4)},${Math.round(p[i + 2] * 1e4)}`
    let id = vertexIds.get(key)
    if (id === undefined) {
      id = vertexIds.size
      vertexIds.set(key, id)
    }
    return id
  }
  const edges = new Map<string, number>()
  for (let t = 0; t < triangleCount; t++) {
    const ids = [idOf(t * 9), idOf(t * 9 + 3), idOf(t * 9 + 6)]
    for (let k = 0; k < 3; k++) {
      const a = ids[k]
      const b = ids[(k + 1) % 3]
      if (a === b) continue // tam giác suy biến
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      edges.set(key, (edges.get(key) ?? 0) + 1)
    }
  }
  for (const n of edges.values()) if (n !== 2) return false
  return edges.size > 0
}

export function isSuspectedInches(d: Dims, cfg: SlicerConfig = slicerConfig): boolean {
  return Math.max(d.length, d.width, d.height) < cfg.inchSuspectMaxMm
}

export function exceedsBed(d: Dims, bed: BedSize): { exceeds: boolean; axes: (keyof Dims)[] } {
  const axes: (keyof Dims)[] = []
  if (d.length > bed.x) axes.push('length')
  if (d.width > bed.y) axes.push('width')
  if (d.height > bed.z) axes.push('height')
  return { exceeds: axes.length > 0, axes }
}
