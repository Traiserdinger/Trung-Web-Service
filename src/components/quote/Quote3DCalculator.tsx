import { useMemo, useRef, useState } from 'react'
import { materials, printerConfig, uiOptions } from '../../config/pricingConfig'
import { parseStlInWorker } from '../../lib/stlWorkerClient'
import { formatDims } from '../../utils/format'
import { exceedsBed, isSuspectedInches, type MeshStats } from '../../utils/meshAnalysis'
import { computeQuoteState } from '../../utils/quoteState'
import { shouldSuggestSupport, type PrintSettings } from '../../utils/slicerEstimator'
import { DropZone } from './DropZone'
import { OptionsPanel } from './OptionsPanel'
import { QuoteResult } from './QuoteResult'
import { StlViewer, type StlViewerHandle } from './StlViewer'

const INCH = 25.4

interface Loaded {
  file: File
  buffer: ArrayBuffer
  positions: Float32Array
  stats: MeshStats
  scale: number
}

export function Quote3DCalculator() {
  const viewerRef = useRef<StlViewerHandle>(null)
  const requestRef = useRef(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inchDismissed, setInchDismissed] = useState(false)
  const [showOrder, setShowOrder] = useState(false)
  const [settings, setSettings] = useState<PrintSettings>({ ...uiOptions.defaults, support: false })

  const load = async (file: File, buffer: ArrayBuffer, scale: number) => {
    const req = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const { positions, stats } = await parseStlInWorker(buffer, scale)
      if (req !== requestRef.current) return // đã có file mới hơn
      setLoaded({ file, buffer, positions, stats, scale })
      setSettings((s) => ({ ...s, support: shouldSuggestSupport(stats) }))
    } catch (e) {
      if (req !== requestRef.current) return
      setError(e instanceof Error ? e.message : 'Không đọc được file STL')
    } finally {
      if (req === requestRef.current) setLoading(false)
    }
  }

  const onFile = async (file: File) => {
    setInchDismissed(false)
    setShowOrder(false)
    await load(file, await file.arrayBuffer(), 1)
  }

  const stats = loaded?.stats ?? null
  const quote = useMemo(() => (stats ? computeQuoteState(stats, settings) : null), [stats, settings])
  const overflow = stats ? exceedsBed(stats.dims, printerConfig.bed).exceeds : false
  const supportReason =
    stats && shouldSuggestSupport(stats) ? `Phát hiện ~${(stats.overhangArea / 100).toFixed(1)} cm² mặt treo` : null
  const showInchHint = stats && loaded?.scale === 1 && !inchDismissed && isSuspectedInches(stats.dims)

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <DropZone onFile={onFile} disabled={loading} fileName={loaded?.file.name ?? null} />

        <div className="relative h-[360px] overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-100 to-slate-200 sm:h-[460px]">
          <StlViewer
            ref={viewerRef}
            positions={loaded?.positions ?? null}
            color={materials[settings.material].color}
            overflow={overflow}
            bed={printerConfig.bed}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-sm font-semibold text-slate-700">
              Đang đọc file…
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-mono text-slate-700">
            {stats ? `D×R×C: ${formatDims(stats.dims)}` : `Bàn in ${formatDims({ length: printerConfig.bed.x, width: printerConfig.bed.y, height: printerConfig.bed.z })}`}
          </span>
          <button
            type="button"
            onClick={() => viewerRef.current?.resetView()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-slate-700 hover:border-sky-400"
          >
            Reset góc nhìn
          </button>
        </div>

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {overflow && (
          <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
            Vượt khổ bàn in tiêu chuẩn - Cần chia mảnh hoặc liên hệ tư vấn
          </p>
        )}
        {stats && !stats.isWatertight && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Mesh không kín – giá có thể sai</p>
        )}
        {showInchHint && loaded && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <span>File có thể tính bằng inch, nhân ×25,4?</span>
            <button
              type="button"
              className="rounded-md bg-amber-600 px-2 py-1 font-semibold text-white hover:bg-amber-700"
              onClick={() => load(loaded.file, loaded.buffer, INCH)}
            >
              Áp dụng
            </button>
            <button type="button" className="underline" onClick={() => setInchDismissed(true)}>
              Không, giữ nguyên
            </button>
          </div>
        )}
      </div>

      <div className="space-y-5">
        <OptionsPanel value={settings} onChange={setSettings} supportReason={supportReason} />
        <QuoteResult quote={quote} stats={stats} onSubmit={() => setShowOrder(true)} />
        {showOrder && loaded && quote && (
          <div data-order-placeholder className="text-sm text-slate-500">
            {/* OrderForm được gắn ở Task 9 */}
          </div>
        )}
      </div>
    </section>
  )
}
