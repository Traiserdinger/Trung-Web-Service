import type { MeshStats } from '../utils/meshAnalysis'
import type { BedSize } from '../config/pricingConfig'
import type { Vec3 } from '../utils/orientation'
import type { ArrangeResult } from '../utils/plateArrange'
import type { PlatePart } from '../utils/plateFile'

export interface WorkerResult {
  positions: Float32Array
  stats: MeshStats
  /** Mesh đã được xoay khác hướng đầu vào */
  rotated: boolean
}

export interface ParsedPart extends WorkerResult {
  /** Tên vật thể trong 3MF (STL: ''); nơi gọi tự ghép tên file */
  name: string
  /** Y-up, scale 1, hướng như file: dùng cho prepareInWorker */
  source: Float32Array
}

export type ArrangeReply = ArrangeResult & { hulls: Record<string, [number, number][]> }

type WorkerReply = ({ id: number; ok: true } & Record<string, unknown>) | { id: number; ok: false; message: string }

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/stlWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerReply>) => {
    const job = pending.get(e.data.id)
    if (!job) return
    pending.delete(e.data.id)
    if (e.data.ok) job.resolve(e.data)
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

function call<T>(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: Record<string, unknown>) => void, reject })
    getWorker().postMessage({ id, ...msg }, transfer)
  })
}

/**
 * Đọc file STL/3MF trong Web Worker, mỗi vật thể một phần. Buffer được sao chép (không transfer)
 * để có thể đọc lại với scale khác.
 */
export function parseFileInWorker(
  buffer: ArrayBuffer,
  fileType: 'stl' | '3mf',
  scale = 1,
  autoOrient = false,
): Promise<ParsedPart[]> {
  return call<{ parts: ParsedPart[] }>({ kind: 'parseFile', buffer, fileType, scale, autoOrient }).then((r) => r.parts)
}

/** Tính lại mesh từ `source` (bản sao) với scale / tự xoay mới. */
export function prepareInWorker(source: Float32Array, scale: number, autoOrient: boolean): Promise<WorkerResult> {
  return call({ kind: 'prepare', source: source.slice(), scale, autoOrient })
}

/** Xoay mesh đang hiển thị (bản sao) để mặt có pháp tuyến `down` nằm xuống bàn, hoặc 'auto'. */
export function orientInWorker(positions: Float32Array, down: Vec3 | 'auto'): Promise<WorkerResult> {
  return call({ kind: 'orient', positions: positions.slice(), down })
}

/** Xếp các món lên bàn in; trả thêm hull từng món để vẽ. */
export function arrangeInWorker(
  inputs: { itemId: string; copies: number; positions: Float32Array; height: number }[],
  bed: BedSize,
): Promise<ArrangeReply> {
  return call({ kind: 'arrange', inputs, bed })
}

/** Dựng file 3MF của cả bàn in. */
export function buildPlateInWorker(parts: PlatePart[], bed: BedSize): Promise<Uint8Array> {
  return call<{ bytes: Uint8Array }>({ kind: 'buildPlate', parts, bed }).then((r) => r.bytes)
}
