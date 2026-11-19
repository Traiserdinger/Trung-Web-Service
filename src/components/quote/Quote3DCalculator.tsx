import { useMemo, useRef, useState, type ReactNode } from 'react'
import { materials, printerConfig, uiOptions } from '../../config/pricingConfig'
import { parseStlInWorker } from '../../lib/stlWorkerClient'
import { formatDims } from '../../utils/format'
import { generateOrderCode } from '../../utils/orderCode'
import { exceedsBed, isSuspectedInches, type MeshStats } from '../../utils/meshAnalysis'
import { computeQuoteState } from '../../utils/quoteState'
import { shouldSuggestSupport, type PrintSettings } from '../../utils/slicerEstimator'
import { DropZone, type DropZoneHandle } from './DropZone'
import { OptionsPanel } from './OptionsPanel'
import { OrderForm } from './OrderForm'
import { QuoteResult } from './QuoteResult'
import { StlViewer, type StlViewerHandle } from './StlViewer'

const INCH = 25.4

interface Loaded {
  file: File
  buffer: ArrayBuffer
  positions: Float32Array
  stats: MeshStats
  scale: number
  /** Một mã đơn cho mỗi file nạp vào: đóng rồi mở lại form vẫn giữ mã */
  orderCode: string
}

function Notice({ tone, children }: { tone: 'alert' | 'caution'; children: ReactNode }) {
  const cls = tone === 'alert' ? 'bg-alert-tint text-alert' : 'bg-caution-tint text-caution'
  return <div className={`rounded-[14px] px-4 py-3 text-[14px] leading-[1.5] ${cls}`}>{children}</div>
}

export function Quote3DCalculator() {
  const viewerRef = useRef<StlViewerHandle>(null)
  const dropRef = useRef<DropZoneHandle>(null)
  const requestRef = useRef(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inchDismissed, setInchDismissed] = useState(false)
  const [showOrder, setShowOrder] = useState(false)
  const [sending, setSending] = useState(false)
  const [settings, setSettings] = useState<PrintSettings>({ ...uiOptions.defaults, support: false })

  const load = async (file: File, buffer: ArrayBuffer, scale: number) => {
    const req = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const { positions, stats } = await parseStlInWorker(buffer, scale)
      if (req !== requestRef.current) return // đã có file mới hơn
      setLoaded((prev) => ({
        file,
        buffer,
        positions,
        stats,
        scale,
        // đổi đơn vị inch vẫn là cùng một file → giữ mã đơn
        orderCode: prev && prev.file === file ? prev.orderCode : generateOrderCode(),
      }))
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
    stats && shouldSuggestSupport(stats) ? `Phát hiện khoảng ${(stats.overhangArea / 100).toFixed(1)} cm² mặt treo` : null
  const showInchHint = stats && loaded?.scale === 1 && !inchDismissed && isSuspectedInches(stats.dims)
  const bed = printerConfig.bed

  return (
    <div className="grid grid-cols-12 gap-x-8 gap-y-8">
      {/* Sân khấu 3D */}
      <div className="col-span-12 space-y-3 lg:col-span-7">
        <DropZone ref={dropRef} onFile={onFile} disabled={loading || sending} empty={!loaded && !loading}>
          <div className="stage-dots relative h-[380px] overflow-hidden rounded-[28px] ring-1 ring-mist sm:h-[520px] lg:h-[600px]">
            <StlViewer
              ref={viewerRef}
              positions={loaded?.positions ?? null}
              color={materials[settings.material].color}
              overflow={overflow}
              bed={bed}
            />

            {/* Thanh trên: tên file + đổi file */}
            {loaded && (
              <div className="absolute top-4 right-4 left-4 flex items-center justify-between gap-3">
                <span className="max-w-[60%] truncate rounded-full bg-paper/90 px-3 py-1.5 text-[13px] font-medium text-ink ring-1 ring-mist backdrop-blur">
                  {loaded.file.name}
                </span>
                <button
                  type="button"
                  onClick={() => dropRef.current?.openPicker()}
                  disabled={loading || sending}
                  className="rounded-full bg-paper/90 px-3 py-1.5 text-[13px] font-semibold text-ink ring-1 ring-mist backdrop-blur transition-colors hover:ring-ink disabled:opacity-60"
                >
                  Đổi file
                </button>
              </div>
            )}

            {/* Thanh dưới: kích thước + đặt lại góc nhìn */}
            <div className="absolute right-4 bottom-4 left-4 flex flex-wrap items-end justify-between gap-3">
              <div className="rounded-[14px] bg-paper/90 px-3.5 py-2 ring-1 ring-mist backdrop-blur">
                <div className="text-[12px] text-slate">{stats ? 'Kích thước mô hình' : `Bàn in ${printerConfig.name}`}</div>
                <div className={`text-[15px] font-semibold tnum ${overflow ? 'text-alert' : 'text-ink'}`}>
                  {formatDims(stats ? stats.dims : { length: bed.x, width: bed.y, height: bed.z })}
                </div>
              </div>
              {loaded && (
                <button
                  type="button"
                  onClick={() => viewerRef.current?.resetView()}
                  className="rounded-full bg-paper/90 px-3.5 py-2 text-[13px] font-semibold text-ink ring-1 ring-mist backdrop-blur transition-colors hover:ring-ink"
                >
                  Đặt lại góc nhìn
                </button>
              )}
            </div>

            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-paper/60 backdrop-blur-[2px]">
                <div className="flex items-center gap-3 rounded-full bg-paper px-5 py-3 text-[14px] font-semibold text-ink shadow ring-1 ring-mist">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-mist border-t-solder" aria-hidden="true" />
                  Đang đọc file
                </div>
              </div>
            )}
          </div>
        </DropZone>

        {error && <Notice tone="alert">{error}</Notice>}
        {overflow && (
          <Notice tone="alert">
            <strong className="font-semibold">Vượt khổ bàn in tiêu chuẩn.</strong> Cần chia mảnh hoặc liên hệ tư vấn,
            bàn in tối đa {bed.x} × {bed.y} × {bed.z} mm.
          </Notice>
        )}
        {stats && !stats.isWatertight && (
          <Notice tone="caution">Mesh của file không kín, nên số gram và giá có thể lệch nhiều hơn bình thường.</Notice>
        )}
        {showInchHint && loaded && !loading && !sending && (
          <Notice tone="caution">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span>Mô hình nhỏ bất thường. File có thể đang tính bằng inch, nhân ×25,4?</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="rounded-full bg-caution px-3 py-1 text-[13px] font-semibold text-white"
                  onClick={() => load(loaded.file, loaded.buffer, INCH)}
                >
                  Đổi sang mm
                </button>
                <button type="button" className="px-2 py-1 text-[13px] font-semibold underline" onClick={() => setInchDismissed(true)}>
                  Giữ nguyên
                </button>
              </span>
            </div>
          </Notice>
        )}
      </div>

      {/* Tuỳ chọn + phiếu tạm tính */}
      <div className="col-span-12 space-y-7 lg:col-span-5">
        <OptionsPanel value={settings} onChange={setSettings} supportReason={supportReason} />
        <QuoteResult quote={quote} stats={stats} onSubmit={() => setShowOrder(true)} />
        {showOrder && loaded && quote && (
          <OrderForm
            quote={quote}
            stats={loaded.stats}
            settings={settings}
            file={loaded.file}
            orderCode={loaded.orderCode}
            onClose={() => setShowOrder(false)}
            onBusyChange={setSending}
          />
        )}
      </div>
    </div>
  )
}
