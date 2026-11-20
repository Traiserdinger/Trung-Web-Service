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
  // Thể tích có dấu của từng tam giác — cộng theo từng khối liên thông ở dưới
  const triVol = new Float64Array(triangleCount)

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
    const v = (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6
    triVol[t] = v
    signed += v

    minX = Math.min(minX, ax, bx, cx)
    maxX = Math.max(maxX, ax, bx, cx)
    minY = Math.min(minY, ay, by, cy)
    maxY = Math.max(maxY, ay, by, cy)
    minZ = Math.min(minZ, az, bz, cz)
    maxZ = Math.max(maxZ, az, bz, cz)
  }

  // Topology: khối liên thông + kiểm tra mesh kín có hướng
  const topo = triangleCount > 0 ? analyzeTopology(p, triangleCount) : null

  // Thể tích từng khối lấy trị tuyệt đối rồi mới cộng: một khối bị lật mặt
  // (file CAD nhiều khối) không còn triệt tiêu thể tích của khối khác.
  let volume = Math.abs(signed)
  const compSign = new Float64Array(topo ? topo.componentCount : 0)
  if (topo) {
    const compVol = new Float64Array(topo.componentCount)
    for (let t = 0; t < triangleCount; t++) compVol[topo.triComponent[t]] += triVol[t]
    volume = 0
    for (let c = 0; c < topo.componentCount; c++) {
      volume += Math.abs(compVol[c])
      compSign[c] = compVol[c] < 0 ? -1 : 1
    }
  }

  // Pháp tuyến hướng vào trong ở khối bị đảo winding — lật lại theo từng khối.
  const threshold = -Math.cos((cfg.overhangAngleDeg * Math.PI) / 180)
  let overhangArea = 0
  for (let t = 0; t < triangleCount; t++) {
    const orientation = topo ? compSign[topo.triComponent[t]] : signed < 0 ? -1 : 1
    if (triNy[t] * orientation < threshold && triMaxY[t] > cfg.bedContactMm) overhangArea += triArea[t]
  }

  const dims: Dims =
    triangleCount > 0
      ? { length: maxX - minX, width: maxZ - minZ, height: maxY - minY }
      : { length: 0, width: 0, height: 0 }

  return {
    dims,
    surfaceArea: area,
    volume,
    signedVolume: signed,
    isWatertight: topo?.watertight ?? false,
    overhangArea,
    triangleCount,
  }
}

/**
 * Gộp đỉnh trùng (lượng tử 1e-4 mm) bằng bảng băm mở trên typed array — không tạo chuỗi,
 * đủ nhanh cho file vài triệu tam giác. Trả id đỉnh cho từng góc tam giác và số đỉnh duy nhất.
 */
function weldVertices(p: Float32Array, cornerCount: number): { ids: Int32Array; count: number } {
  const q = (v: number) => {
    const r = Math.round(v * 1e4)
    return r > 2e9 ? 2e9 : r < -2e9 ? -2e9 : r | 0
  }
  let cap = 1 << 16
  while (cap < cornerCount) cap <<= 1
  let kx = new Int32Array(cap)
  let ky = new Int32Array(cap)
  let kz = new Int32Array(cap)
  let slot = new Int32Array(cap).fill(-1) // id đỉnh, -1 = trống
  let count = 0
  const ids = new Int32Array(cornerCount)
  const hash = (x: number, y: number, z: number, mask: number) =>
    (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask

  const insert = (x: number, y: number, z: number, idIfNew: number): number => {
    const mask = cap - 1
    let h = hash(x, y, z, mask)
    while (slot[h] !== -1) {
      if (kx[h] === x && ky[h] === y && kz[h] === z) return slot[h]
      h = (h + 1) & mask
    }
    kx[h] = x
    ky[h] = y
    kz[h] = z
    slot[h] = idIfNew
    return idIfNew
  }

  for (let c = 0; c < cornerCount; c++) {
    if (count * 2 >= cap) {
      // nới bảng khi đầy quá nửa
      const ox = kx, oy = ky, oz = kz, os = slot, ocap = cap
      cap <<= 1
      kx = new Int32Array(cap)
      ky = new Int32Array(cap)
      kz = new Int32Array(cap)
      slot = new Int32Array(cap).fill(-1)
      for (let k = 0; k < ocap; k++) if (os[k] !== -1) insert(ox[k], oy[k], oz[k], os[k])
    }
    const o = c * 3
    const id = insert(q(p[o]), q(p[o + 1]), q(p[o + 2]), count)
    if (id === count) count++
    ids[c] = id
  }
  return { ids, count }
}

/**
 * Nhóm tam giác thành khối liên thông và kiểm tra mesh kín CÓ HƯỚNG: mỗi cạnh phải được đúng
 * hai tam giác dùng, theo hai chiều ngược nhau. Một mặt bị lật làm hai tam giác kề nhau đi cùng
 * chiều trên cạnh chung → không kín.
 */
function analyzeTopology(
  p: Float32Array,
  triangleCount: number,
): { watertight: boolean; triComponent: Int32Array; componentCount: number } {
  const { ids: tri, count: V } = weldVertices(p, triangleCount * 3)

  // Union-find trên đỉnh
  const parent = new Int32Array(V)
  for (let i = 0; i < V; i++) parent[i] = i
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }

  // Mỗi cạnh có hướng mã hoá thành một số: (min·V + max)·2 + (a < b ? 0 : 1) — chính xác trong float64
  const edgeKeys = new Float64Array(triangleCount * 3)
  let e = 0
  for (let t = 0; t < triangleCount; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tri[t * 3 + k]
      const b = tri[t * 3 + ((k + 1) % 3)]
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent[ra] = rb
      if (a === b) continue // tam giác suy biến
      const lo = a < b ? a : b
      const hi = a < b ? b : a
      edgeKeys[e++] = (lo * V + hi) * 2 + (a < b ? 0 : 1)
    }
  }
  const keys = edgeKeys.subarray(0, e).sort()
  let watertight = e > 0 && e % 2 === 0
  for (let i = 0; watertight && i < e; i += 2) {
    // cặp liền nhau phải cùng cạnh, khác chiều, và cạnh kế tiếp phải khác cạnh
    const und = Math.floor(keys[i] / 2)
    if (Math.floor(keys[i + 1] / 2) !== und || keys[i] === keys[i + 1]) watertight = false
    else if (i + 2 < e && Math.floor(keys[i + 2] / 2) === und) watertight = false
  }

  const compOfRoot = new Int32Array(V).fill(-1)
  let componentCount = 0
  const triComponent = new Int32Array(triangleCount)
  for (let t = 0; t < triangleCount; t++) {
    const root = find(tri[t * 3])
    if (compOfRoot[root] === -1) compOfRoot[root] = componentCount++
    triComponent[t] = compOfRoot[root]
  }
  return { watertight, triComponent, componentCount }
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
