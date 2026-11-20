import type { MeshStats } from '../utils/meshAnalysis'

type WorkerReply =
  | { id: number; ok: true; positions: Float32Array; stats: MeshStats }
  | { id: number; ok: false; message: string }

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: { positions: Float32Array; stats: MeshStats }) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/stlWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerReply>) => {
    const job = pending.get(e.data.id)
    if (!job) return
    pending.delete(e.data.id)
    if (e.data.ok) job.resolve({ positions: e.data.positions, stats: e.data.stats })
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

/** Parse STL trong Web Worker. Buffer được sao chép (không transfer) để có thể parse lại với scale khác. */
export function parseStlInWorker(buffer: ArrayBuffer, scale = 1): Promise<{ positions: Float32Array; stats: MeshStats }> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, buffer, scale })
  })
}
