/// <reference lib="webworker" />
import { analyzeMesh } from '../utils/meshAnalysis'
import { applyDown, findBestDown, type Vec3 } from '../utils/orientation'
import { processStl, StlParseError } from '../utils/stlProcess'

export type StlWorkerRequest =
  | { id: number; kind: 'parse'; buffer: ArrayBuffer; scale: number; autoOrient: boolean }
  /** Xoay mesh đang hiển thị: đặt mặt có pháp tuyến `down` xuống bàn, hoặc tự tìm hướng tốt nhất */
  | { id: number; kind: 'orient'; positions: Float32Array; down: Vec3 | 'auto' }

const post = (msg: unknown, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer)

self.onmessage = (event: MessageEvent<StlWorkerRequest>) => {
  const req = event.data
  try {
    if (req.kind === 'parse') {
      const { positions, stats, rotated } = processStl(req.buffer, req.scale, req.autoOrient)
      post({ id: req.id, ok: true, positions, stats, rotated }, [positions.buffer])
    } else {
      const down = req.down === 'auto' ? findBestDown(req.positions).down : req.down
      const rotated = down[1] > -0.99999
      const positions = rotated ? applyDown(req.positions, down) : req.positions
      post({ id: req.id, ok: true, positions, stats: analyzeMesh(positions), rotated }, [positions.buffer])
    }
  } catch (err) {
    const message = err instanceof StlParseError ? err.message : 'Không đọc được file STL'
    post({ id: req.id, ok: false, message })
  }
}
