/// <reference lib="webworker" />
import { ThreeMfError } from '../utils/threeMf'
import { StlParseError } from '../utils/stlProcess'
import { handleRequest, type StlWorkerRequest } from './handleRequest'

export type { StlWorkerRequest }

const post = (msg: unknown, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer)

self.onmessage = (event: MessageEvent<StlWorkerRequest>) => {
  const req = event.data
  try {
    const { reply, transfer } = handleRequest(req)
    post({ id: req.id, ok: true, ...(reply as object) }, transfer)
  } catch (err) {
    const known = err instanceof StlParseError || err instanceof ThreeMfError
    post({ id: req.id, ok: false, message: known ? err.message : 'Không đọc được file STL' })
  }
}
