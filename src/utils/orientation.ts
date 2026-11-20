import { slicerConfig, type SlicerConfig } from '../config/pricingConfig'

/** Vector đơn vị (x, y, z) trong hệ Y-up của viewer */
export type Vec3 = [number, number, number]

/** Hướng "xuống bàn" của file gốc: không xoay */
export const ORIGINAL_DOWN: Vec3 = [0, -1, 0]

export interface OrientationScore {
  down: Vec3
  /** mm² mặt nằm sát bàn in */
  contactArea: number
  /** mm² mặt treo cần support */
  overhangArea: number
  /** mm³ ước lượng thể tích vùng support (diện tích chiếu × chiều cao so với bàn) */
  supportVolume: number
  /** mm, chiều cao in */
  height: number
  cost: number
}

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/**
 * Ma trận xoay 3×3 (hàng trước) đưa vector đơn vị d về (0, −1, 0) — công thức Rodrigues.
 * d ngược hẳn hướng đích thì lật 180° quanh trục X.
 */
export function rotationToDown(d: Vec3): number[] {
  const [ax, ay, az] = norm(d)
  const b: Vec3 = [0, -1, 0]
  // trục k = a × b, cos = a · b
  const kx = ay * b[2] - az * b[1]
  const ky = az * b[0] - ax * b[2]
  const kz = ax * b[1] - ay * b[0]
  const c = ax * b[0] + ay * b[1] + az * b[2]
  if (c > 1 - 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1]
  if (c < -1 + 1e-12) return [1, 0, 0, 0, -1, 0, 0, 0, -1]
  const f = 1 / (1 + c)
  return [
    c + kx * kx * f, kx * ky * f - kz, kx * kz * f + ky,
    ky * kx * f + kz, c + ky * ky * f, ky * kz * f - kx,
    kz * kx * f - ky, kz * ky * f + kx, c + kz * kz * f,
  ]
}

/**
 * Xoay mesh để mặt có pháp tuyến `down` nằm xuống bàn, rồi xoay quanh trục đứng cho khung bao
 * trên bàn gọn nhất, đặt tâm XZ = 0 và đáy y = 0 (cùng quy ước với orientZUpToYUp).
 */
export function applyDown(p: Float32Array, down: Vec3): Float32Array {
  const m = rotationToDown(down)
  const out = new Float32Array(p.length)
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2]
    out[i] = m[0] * x + m[1] * y + m[2] * z
    out[i + 1] = m[3] * x + m[4] * y + m[5] * z
    out[i + 2] = m[6] * x + m[7] * y + m[8] * z
  }

  // Góc quay quanh Y cho diện tích khung bao XZ nhỏ nhất (thử mỗi 3°, trên tối đa ~20k đỉnh)
  const step = Math.max(3, Math.floor(out.length / 3 / 20000)) * 3
  let bestA = 0
  let bestArea = Infinity
  for (let deg = 0; deg < 90; deg += 3) {
    const a = (deg * Math.PI) / 180
    const cs = Math.cos(a), sn = Math.sin(a)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (let i = 0; i < out.length; i += step) {
      const x = cs * out[i] - sn * out[i + 2]
      const z = sn * out[i] + cs * out[i + 2]
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (z < z0) z0 = z
      if (z > z1) z1 = z
    }
    const area = (x1 - x0) * (z1 - z0)
    // ưu tiên giữ góc 0 nếu không gọn hơn rõ rệt
    if (area < bestArea * 0.995) {
      bestArea = area
      bestA = a
    }
  }
  const cs = Math.cos(bestA), sn = Math.sin(bestA)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < out.length; i += 3) {
    const x = cs * out[i] - sn * out[i + 2]
    const z = sn * out[i] + cs * out[i + 2]
    out[i] = x
    out[i + 2] = z
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (out[i + 1] < minY) minY = out[i + 1]
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

/** Pháp tuyến hướng ra ngoài của từng tam giác (lật cả mesh nếu winding bị đảo) + diện tích */
function faceData(p: Float32Array): { n: Float32Array; area: Float32Array; total: number } {
  const T = Math.floor(p.length / 9)
  const n = new Float32Array(T * 3)
  const area = new Float32Array(T)
  let signed = 0
  let total = 0
  for (let t = 0; t < T; t++) {
    const o = t * 9
    const ax = p[o], ay = p[o + 1], az = p[o + 2]
    const ux = p[o + 3] - ax, uy = p[o + 4] - ay, uz = p[o + 5] - az
    const vx = p[o + 6] - ax, vy = p[o + 7] - ay, vz = p[o + 8] - az
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    area[t] = len / 2
    total += len / 2
    if (len > 0) {
      n[t * 3] = nx / len
      n[t * 3 + 1] = ny / len
      n[t * 3 + 2] = nz / len
    }
    signed += (ax * (p[o + 4] * p[o + 8] - p[o + 5] * p[o + 7]) + ay * (p[o + 5] * p[o + 6] - p[o + 3] * p[o + 8]) + az * (p[o + 3] * p[o + 7] - p[o + 4] * p[o + 6])) / 6
  }
  if (signed < 0) for (let i = 0; i < n.length; i++) n[i] = -n[i]
  return { n, area, total }
}

/** Các hướng ứng viên: pháp tuyến của những mặt phẳng lớn nhất + 6 hướng trục */
function candidates(n: Float32Array, area: Float32Array, max = 24): Vec3[] {
  const bins = new Map<number, { a: number; x: number; y: number; z: number }>()
  const Q = 24 // lưới lượng tử ~2,4°
  for (let t = 0; t < area.length; t++) {
    const a = area[t]
    if (a === 0) continue
    const x = n[t * 3], y = n[t * 3 + 1], z = n[t * 3 + 2]
    const key = (Math.round(x * Q) + 64) * 16384 + (Math.round(y * Q) + 64) * 128 + (Math.round(z * Q) + 64)
    const b = bins.get(key)
    if (b) {
      b.a += a
      b.x += x * a
      b.y += y * a
      b.z += z * a
    } else bins.set(key, { a, x: x * a, y: y * a, z: z * a })
  }
  const list: Vec3[] = [...bins.values()].sort((u, v) => v.a - u.a).slice(0, max).map((b) => norm([b.x, b.y, b.z]))
  const axes: Vec3[] = [[0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]
  const out: Vec3[] = []
  for (const c of [...axes, ...list]) if (!out.some((o) => o[0] * c[0] + o[1] * c[1] + o[2] * c[2] > 0.9995)) out.push(c)
  return out
}

/** Chấm điểm một hướng đặt: điểm càng thấp càng dễ in */
export function scoreDown(
  p: Float32Array,
  down: Vec3,
  fd = faceData(p),
  cfg: SlicerConfig = slicerConfig,
): OrientationScore {
  const [dx, dy, dz] = norm(down)
  // trục đứng mới = −down
  const ux = -dx, uy = -dy, uz = -dz
  let minH = Infinity, maxH = -Infinity
  for (let i = 0; i < p.length; i += 3) {
    const h = p[i] * ux + p[i + 1] * uy + p[i + 2] * uz
    if (h < minH) minH = h
    if (h > maxH) maxH = h
  }
  const overhangCos = -Math.cos((cfg.overhangAngleDeg * Math.PI) / 180)
  let contact = 0, overhang = 0, support = 0
  const T = fd.area.length
  for (let t = 0; t < T; t++) {
    const a = fd.area[t]
    if (a === 0) continue
    const nUp = fd.n[t * 3] * ux + fd.n[t * 3 + 1] * uy + fd.n[t * 3 + 2] * uz
    if (nUp >= overhangCos) continue // không hướng xuống đủ dốc
    const o = t * 9
    const h0 = p[o] * ux + p[o + 1] * uy + p[o + 2] * uz - minH
    const h1 = p[o + 3] * ux + p[o + 4] * uy + p[o + 5] * uz - minH
    const h2 = p[o + 6] * ux + p[o + 7] * uy + p[o + 8] * uz - minH
    const top = Math.max(h0, h1, h2)
    if (top <= cfg.bedContactMm) {
      if (nUp < -0.999) contact += a
      continue
    }
    overhang += a
    support += a * -nUp * ((h0 + h1 + h2) / 3)
  }
  const height = maxH - minH
  const total = fd.total || 1
  // Chuẩn hoá theo diện tích bề mặt và kích thước vật để so được giữa các mô hình
  const scale = Math.sqrt(total)
  const cost =
    overhang / total + // phần cần support
    support / (total * scale) + // support càng cao càng tốn nhựa, càng xấu mặt
    0.05 * (height / scale) - // thấp hơn thì in nhanh, ít đổ
    0.6 * Math.min(contact / total, 0.5) // mặt đáy rộng thì bám bàn chắc
  return { down: [dx, dy, dz], contactArea: contact, overhangArea: overhang, supportVolume: support, height, cost }
}

/**
 * Hướng in tốt nhất kiểu "auto orient" của slicer: thử các mặt phẳng lớn nhất làm đáy,
 * chọn hướng ít support, đáy bám rộng, thấp. Hướng gốc của file được giữ nếu gần ngang điểm.
 * Mesh rất lớn thì lấy mẫu tam giác để chạy nhanh.
 */
export function findBestDown(p: Float32Array, cfg: SlicerConfig = slicerConfig): OrientationScore {
  const T = Math.floor(p.length / 9)
  const MAX = 150_000
  let sample = p
  if (T > MAX) {
    const stride = Math.ceil(T / MAX)
    const n = Math.floor(T / stride)
    sample = new Float32Array(n * 9)
    for (let i = 0; i < n; i++) sample.set(p.subarray(i * stride * 9, i * stride * 9 + 9), i * 9)
  }
  const fd = faceData(sample)
  const original = scoreDown(sample, ORIGINAL_DOWN, fd, cfg)
  let best = original
  for (const c of candidates(fd.n, fd.area)) {
    const s = scoreDown(sample, c, fd, cfg)
    if (s.cost < best.cost) best = s
  }
  // Không xoay chỉ để hơn chút xíu: tôn trọng hướng người thiết kế đã đặt
  return best.cost < original.cost - 0.02 ? best : original
}
