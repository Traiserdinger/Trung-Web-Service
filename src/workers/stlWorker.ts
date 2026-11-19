/// <reference lib="webworker" />
import { processStl, StlParseError } from '../utils/stlProcess'

export interface StlWorkerRequest {
  id: number
  buffer: ArrayBuffer
  scale: number
}

self.onmessage = (event: MessageEvent<StlWorkerRequest>) => {
  const { id, buffer, scale } = event.data
  try {
    const { positions, stats } = processStl(buffer, scale)
    ;(self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, ok: true, positions, stats }, [positions.buffer])
  } catch (err) {
    const message = err instanceof StlParseError ? err.message : 'Không đọc được file STL'
    ;(self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, ok: false, message })
  }
}
