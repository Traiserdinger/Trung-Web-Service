import { useCallback, useEffect, useRef, useState } from 'react'
import { printerConfig, uiOptions } from '../../config/pricingConfig'
import {
  arrangeInWorker,
  orientInWorker,
  parseFileInWorker,
  prepareInWorker,
  type ArrangeReply,
  type ParsedPart,
  type WorkerResult,
} from '../../lib/stlWorkerClient'
import type { MeshStats } from '../../utils/meshAnalysis'
import type { Vec3 } from '../../utils/orientation'
import { shouldSuggestSupport, type ItemSettings } from '../../utils/slicerEstimator'

export type OrientMode = 'auto' | 'file' | 'face'

export interface PlateFile {
  fileNo: number
  file: File
  buffer: ArrayBuffer
  fileType: 'stl' | '3mf'
}

export interface PlateItem {
  id: string
  fileNo: number
  name: string
  /** Y-up, scale 1, hướng như file */
  source: Float32Array
  /** Mesh đang hiển thị (đã scale, đã xoay) */
  positions: Float32Array
  stats: MeshStats
  scale: number
  /** auto: tự chọn hướng in; file: giữ hướng gốc của file; face: khách chọn mặt đặt xuống bàn */
  orient: OrientMode
  /** Hướng hiển thị khác hướng gốc của file */
  rotated: boolean
  settings: ItemSettings
  inchDismissed: boolean
}

/** Thời gian chờ trước khi xếp lại, để bấm số lượng liên tục không xếp mỗi lần */
export const ARRANGE_DEBOUNCE_MS = 150

export function fileTypeOf(name: string): 'stl' | '3mf' | null {
  const n = name.toLowerCase()
  if (n.endsWith('.stl')) return 'stl'
  if (n.endsWith('.3mf')) return '3mf'
  return null
}

/** STL: tên file. 3MF: "<file> · <tên vật thể>", vật thể không tên (#n): "<file> #n". */
export function itemName(fileName: string, partName: string): string {
  if (!partName) return fileName
  if (/^#\d+$/.test(partName)) return `${fileName} ${partName}`
  return `${fileName} · ${partName}`
}

const defaultSettings = (stats: MeshStats): ItemSettings => ({
  infillPercent: uiOptions.defaults.infillPercent,
  wallLoops: uiOptions.defaults.wallLoops,
  quantity: uiOptions.defaults.quantity,
  support: shouldSuggestSupport(stats),
})

const byOrder = (a: PlateItem, b: PlateItem) => a.fileNo - b.fileNo || itemIndex(a) - itemIndex(b)
const itemIndex = (it: PlateItem) => Number(it.id.slice(it.id.indexOf('-') + 1))

const reason = (e: unknown) => (e instanceof Error ? e.message : 'File không hợp lệ')

/**
 * Các món trên một bàn in: đọc file, mỗi vật thể một món, thông số riêng từng món, và tự xếp bàn
 * (chờ 150 ms, bỏ kết quả cũ) sau khi thêm, xoá, đổi số lượng, đổi hướng in hay đổi inch.
 */
export function usePlateItems() {
  const [files, setFiles] = useState<PlateFile[]>([])
  const [items, setItems] = useState<PlateItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [arrangement, setArrangement] = useState<ArrangeReply | null>(null)
  const [arranging, setArranging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState(0)
  /** Tăng khi bố cục bàn cần xếp lại */
  const [layout, setLayout] = useState(0)

  const itemsRef = useRef<PlateItem[]>([])
  useEffect(() => {
    itemsRef.current = items
  }, [items])
  const nextFileNo = useRef(1)
  /** Tăng khi thay toàn bộ file: mọi việc đang chạy của lần trước bị bỏ */
  const generation = useRef(0)
  /** Số yêu cầu mới nhất theo từng món (đổi hướng / đổi inch) */
  const itemReq = useRef(new Map<string, number>())
  const arrangeReq = useRef(0)

  /** Bố cục đổi: bỏ kết quả xếp cũ ngay (hiện "Đang xếp bàn") và hẹn xếp lại */
  const bump = useCallback(() => {
    setArrangement(null)
    setArranging(true)
    setLayout((n) => n + 1)
  }, [])
  const track = useCallback(async <T,>(p: Promise<T>): Promise<T> => {
    setJobs((n) => n + 1)
    try {
      return await p
    } finally {
      setJobs((n) => n - 1)
    }
  }, [])

  const addFiles = useCallback(
    async (list: File[]) => {
      const gen = generation.current
      setError(null)
      // Cấp số file ngay khi chọn để thứ tự món theo thứ tự chọn, dù file nào đọc xong trước
      const jobsIn = list.map((file) => ({ file, fileNo: nextFileNo.current++ }))
      const errors: string[] = []
      await Promise.all(
        jobsIn.map(({ file, fileNo }) =>
          track(
            (async () => {
              const fileType = fileTypeOf(file.name) ?? 'stl'
              let buffer: ArrayBuffer
              try {
                buffer = await file.arrayBuffer()
              } catch {
                errors.push(`Không đọc được "${file.name}" trên máy. Hãy kiểm tra file rồi chọn lại.`)
                return
              }
              if (gen !== generation.current) return
              let parts: ParsedPart[]
              try {
                parts = await parseFileInWorker(buffer, fileType, 1, true)
                if (parts.length === 0) throw new Error('File không có vật thể nào')
              } catch (e) {
                errors.push(`Không đọc được "${file.name}": ${reason(e)}`)
                return
              }
              if (gen !== generation.current) return
              const added: PlateItem[] = parts.map((p, i) => ({
                id: `${fileNo}-${i}`,
                fileNo,
                name: itemName(file.name, p.name),
                source: p.source,
                positions: p.positions,
                stats: p.stats,
                scale: 1,
                orient: 'auto',
                rotated: Boolean(p.rotated),
                settings: defaultSettings(p.stats),
                inchDismissed: false,
              }))
              setFiles((fs) => [...fs, { fileNo, file, buffer, fileType }].sort((a, b) => a.fileNo - b.fileNo))
              setItems((its) => [...its, ...added].sort(byOrder))
              setSelectedId((id) => id ?? added[0].id)
              bump()
            })(),
          ),
        ),
      )
      if (gen === generation.current && errors.length > 0) setError(errors.join(' '))
    },
    [bump, track],
  )

  /** Bỏ hết món hiện có rồi đọc các file mới (nút "Đổi file" khi chỉ có một món). */
  const replaceFiles = useCallback(
    (list: File[]) => {
      generation.current++
      itemReq.current.clear()
      nextFileNo.current = 1
      setFiles([])
      setItems([])
      setSelectedId(null)
      bump()
      return addFiles(list)
    },
    [addFiles, bump],
  )

  const removeItem = useCallback(
    (id: string) => {
      // itemsRef cập nhật ngay (không đợi render) để hai lần xoá liên tiếp cùng một nhịp đều thấy kết quả của nhau
      const cur = itemsRef.current
      const gone = cur.find((it) => it.id === id)
      if (!gone) return
      const rest = cur.filter((it) => it.id !== id)
      itemsRef.current = rest
      itemReq.current.delete(id)
      const fileGone = !rest.some((it) => it.fileNo === gone.fileNo)
      setItems((its) => its.filter((it) => it.id !== id))
      if (fileGone) setFiles((fs) => fs.filter((f) => f.fileNo !== gone.fileNo))
      if (rest.length === 0) nextFileNo.current = 1
      setSelectedId((sel) => (sel === id ? (rest[Math.max(0, cur.indexOf(gone) - 1)]?.id ?? null) : sel))
      bump()
    },
    [bump],
  )

  const patchItem = useCallback((id: string, f: (it: PlateItem) => PlateItem) => {
    setItems((its) => its.map((it) => (it.id === id ? f(it) : it)))
  }, [])

  const updateItem = useCallback(
    (id: string, patch: Partial<ItemSettings>) => {
      const cur = itemsRef.current.find((it) => it.id === id)
      if (!cur) return
      patchItem(id, (it) => ({ ...it, settings: { ...it.settings, ...patch } }))
      if (patch.quantity !== undefined && patch.quantity !== cur.settings.quantity) bump()
    },
    [bump, patchItem],
  )

  /** Chạy lại mesh của một món; kết quả của yêu cầu cũ hơn (hoặc món đã xoá) bị bỏ. */
  const rerun = useCallback(
    async (id: string, job: () => Promise<WorkerResult>, next: Pick<PlateItem, 'orient' | 'scale'>, keepRotated: boolean) => {
      const req = (itemReq.current.get(id) ?? 0) + 1
      itemReq.current.set(id, req)
      const gen = generation.current
      setError(null)
      try {
        const r = await track(job())
        if (gen !== generation.current || itemReq.current.get(id) !== req) return
        patchItem(id, (it) => ({
          ...it,
          ...next,
          positions: r.positions,
          stats: r.stats,
          rotated: keepRotated ? r.rotated || it.rotated : Boolean(r.rotated),
          settings: { ...it.settings, support: shouldSuggestSupport(r.stats) },
        }))
        bump()
      } catch (e) {
        if (gen !== generation.current || itemReq.current.get(id) !== req) return
        const it = itemsRef.current.find((x) => x.id === id)
        setError(`Không đọc được "${it?.name ?? ''}": ${reason(e)}`)
      }
    },
    [bump, patchItem, track],
  )

  const reorient = useCallback(
    (id: string, mode: OrientMode, down?: Vec3) => {
      const it = itemsRef.current.find((x) => x.id === id)
      if (!it) return
      if (mode === 'face') {
        if (!down) return
        return rerun(id, () => orientInWorker(it.positions, down), { orient: 'face', scale: it.scale }, true)
      }
      return rerun(id, () => prepareInWorker(it.source, it.scale, mode === 'auto'), { orient: mode, scale: it.scale }, false)
    },
    [rerun],
  )

  const setScale = useCallback(
    (id: string, scale: number) => {
      const it = itemsRef.current.find((x) => x.id === id)
      if (!it) return
      // Đổi đơn vị thì hướng chọn mặt không còn đúng: quay về tự xoay (trừ khi đang giữ hướng file)
      const orient: OrientMode = it.orient === 'file' ? 'file' : 'auto'
      return rerun(id, () => prepareInWorker(it.source, scale, orient === 'auto'), { orient, scale }, false)
    },
    [rerun],
  )

  const dismissInch = useCallback((id: string) => patchItem(id, (it) => ({ ...it, inchDismissed: true })), [patchItem])

  // Xếp bàn: chờ một chút sau thay đổi cuối, bỏ kết quả của lần xếp cũ hơn
  useEffect(() => {
    const req = ++arrangeReq.current
    const timer = setTimeout(() => {
      if (itemsRef.current.length === 0) {
        setArranging(false)
        return
      }
      const inputs = itemsRef.current.map((it) => ({
        itemId: it.id,
        copies: it.settings.quantity,
        positions: it.positions,
        height: it.stats.dims.height,
      }))
      arrangeInWorker(inputs, printerConfig.bed)
        .then((r) => {
          if (req !== arrangeReq.current) return
          setArrangement(r)
        })
        .catch(() => {
          // Không xếp được thì coi như không vừa: đơn chuyển tư vấn thay vì treo "Đang xếp bàn"
          if (req === arrangeReq.current) setArrangement({ fits: false, placements: {}, hulls: {} })
        })
        .finally(() => {
          if (req === arrangeReq.current) setArranging(false)
        })
    }, ARRANGE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [layout])

  return {
    files,
    items,
    selectedId,
    select: setSelectedId,
    addFiles,
    replaceFiles,
    removeItem,
    updateItem,
    reorient,
    setScale,
    dismissInch,
    /** Nút "Xếp lại" */
    rearrange: bump,
    arrangement,
    arranging,
    error,
    busy: jobs > 0,
  }
}
