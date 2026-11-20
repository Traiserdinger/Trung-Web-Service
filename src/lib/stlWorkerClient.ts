import type { MeshStats } from '../utils/meshAnalysis'
import type { Vec3 } from '../utils/orientation'

export interface WorkerResult {
  positions: Float32Array
  stats: MeshStats
  /** Mesh đã được xoay khác hướng đầu vào */
  rotated: boolean
}

type WorkerReply = ({ id: number; ok: true } & WorkerResult) | { id: number; ok: false; message: string }

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: WorkerResult) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/stlWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerReply>) => {
    const job = pending.get(e.data.id)
    if (!job) return
    pending.delete(e.data.id)
    if (e.data.ok) job.resolve({ positions: e.data.positions, stats: e.data.stats, rotated: e.data.rotated })
    else job.reject(new Error(e.data.message))
  }
  // Kết quả không giải mã được (messageerror) cũng phải kết thúc lời gọi, nếu không giao diện treo "Đang đọc file"
  worker.onmessageerror = () => {
    for (const job of pending.values()) job.reject(new Error('Không đọc được file STL'))
    pending.clear()
  }
  worker.onerror = () => {
    for (const job of pending.values()) job.reject(new Error('Không đọc được file STL'))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

function call(msg: Record<string, unknown>): Promise<WorkerResult> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, ...msg })
  })
}

/**
 * Parse STL trong Web Worker. Buffer được sao chép (không transfer) để có thể parse lại với scale khác.
 * autoOrient: tự xoay sang hướng in tốt nhất (mặt phẳng lớn nằm xuống bàn, ít support).
 */
export function parseStlInWorker(buffer: ArrayBuffer, scale = 1, autoOrient = false): Promise<WorkerResult> {
  return call({ kind: 'parse', buffer, scale, autoOrient })
}

/** Xoay mesh đang hiển thị (bản sao) để mặt có pháp tuyến `down` nằm xuống bàn, hoặc 'auto'. */
export function orientInWorker(positions: Float32Array, down: Vec3 | 'auto'): Promise<WorkerResult> {
  return call({ kind: 'orient', positions: positions.slice(), down })
}
