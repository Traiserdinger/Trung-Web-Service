import type { BedSize } from '../config/pricingConfig'
import { analyzeMesh, orientZUpToYUp } from '../utils/meshAnalysis'
import { applyDown, findBestDown, type Vec3 } from '../utils/orientation'
import { buildPlate3mf, type PlatePart } from '../utils/plateFile'
import { arrangePlate, footprintOf, type ArrangeInput } from '../utils/plateArrange'
import { parse3mf } from '../utils/threeMf'
import { parseStlPositions, prepareMesh, prepareYUpMesh } from '../utils/stlProcess'

export type StlWorkerRequest =
  | { id: number; kind: 'parseFile'; buffer: ArrayBuffer; fileType: 'stl' | '3mf'; scale: number; autoOrient: boolean }
  /** Chuẩn bị lại mesh từ `source` (Y-up, scale 1, hướng file): đổi inch, hoặc về "Như file" / "Tự xoay" */
  | { id: number; kind: 'prepare'; source: Float32Array; scale: number; autoOrient: boolean }
  /** Xoay mesh đang hiển thị: đặt mặt có pháp tuyến `down` xuống bàn, hoặc tự tìm hướng tốt nhất */
  | { id: number; kind: 'orient'; positions: Float32Array; down: Vec3 | 'auto' }
  | {
      id: number
      kind: 'arrange'
      inputs: { itemId: string; copies: number; positions: Float32Array; height: number }[]
      bed: BedSize
    }
  | { id: number; kind: 'buildPlate'; parts: PlatePart[]; bed: BedSize }

/** Throws errors carrying user-facing messages (StlParseError / ThreeMfError). */
export function handleRequest(req: StlWorkerRequest): { reply: unknown; transfer: Transferable[] } {
  switch (req.kind) {
    case 'parseFile': {
      const raws =
        req.fileType === '3mf'
          ? parse3mf(req.buffer).map((o) => ({ name: o.name, raw: o.positions }))
          : [{ name: '', raw: parseStlPositions(req.buffer) }]
      const transfer: Transferable[] = []
      const parts = raws.map(({ name, raw }) => {
        const source = orientZUpToYUp(raw)
        const { positions, stats, rotated } = prepareMesh(raw, req.scale, req.autoOrient)
        transfer.push(source.buffer, positions.buffer)
        return { name, source, positions, stats, rotated }
      })
      return { reply: { parts }, transfer }
    }
    case 'prepare': {
      const { positions, stats, rotated } = prepareYUpMesh(req.source, req.scale, req.autoOrient)
      return { reply: { positions, stats, rotated }, transfer: [positions.buffer] }
    }
    case 'orient': {
      const down = req.down === 'auto' ? findBestDown(req.positions).down : req.down
      const rotated = down[1] > -0.99999
      const positions = rotated ? applyDown(req.positions, down) : req.positions
      return { reply: { positions, stats: analyzeMesh(positions), rotated }, transfer: [positions.buffer] }
    }
    case 'arrange': {
      const hulls: Record<string, [number, number][]> = {}
      const inputs: ArrangeInput[] = req.inputs.map((i) => {
        const footprint = footprintOf(i.positions)
        hulls[i.itemId] = footprint.hull
        return { itemId: i.itemId, copies: i.copies, footprint, height: i.height }
      })
      return { reply: { ...arrangePlate(inputs, req.bed), hulls }, transfer: [] }
    }
    case 'buildPlate': {
      const bytes = buildPlate3mf(req.parts, req.bed)
      return { reply: { bytes }, transfer: [bytes.buffer] }
    }
  }
}
