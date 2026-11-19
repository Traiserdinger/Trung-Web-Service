import { formatDuration, formatVnd } from '../../utils/format'
import type { MeshStats } from '../../utils/meshAnalysis'
import type { QuoteState } from '../../utils/quoteState'

interface Props {
  quote: QuoteState | null
  stats: MeshStats | null
  onSubmit(): void
}

const fmt = (n: number, digits = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: digits })

export function QuoteResult({ quote, stats, onSubmit }: Props) {
  if (!quote || !stats) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
        Thả file STL để xem giá tạm tính.
      </div>
    )
  }

  const isQuote = quote.orderType === 'quote' && quote.estimate && quote.price

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {isQuote ? (
        <>
          <div className="font-mono text-sm text-slate-600">
            ~{fmt(quote.estimate!.grams, 1)} g · ~{formatDuration(quote.estimate!.timeSec)}
          </div>
          <div className="text-2xl font-bold text-slate-900">Tạm tính: {formatVnd(quote.price!.total)}</div>
          <div className="text-sm text-slate-600">
            (khoảng {formatVnd(quote.price!.rangeLow)} – {formatVnd(quote.price!.rangeHigh)})
          </div>
          <p className="text-xs text-slate-500">
            Giá tạm tính, sai số khoảng ±20%. Giá chính xác sau khi slice.
          </p>
        </>
      ) : (
        <div className="space-y-1">
          <div className="font-semibold text-amber-700">Cần tư vấn trước khi báo giá</div>
          <ul className="list-disc pl-5 text-sm text-slate-700">
            {quote.consultReasons.map((r) => (
              <li key={r}>{r === 'ABS' ? 'ABS – máy A1 Mini khung hở, cần tư vấn trước khi in' : r}</li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">Bạn vẫn gửi file được — Trung sẽ xem và báo lại qua Zalo.</p>
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        className="w-full rounded-lg bg-sky-600 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-sky-700"
      >
        {isQuote ? 'Gửi yêu cầu in' : 'Gửi yêu cầu tư vấn'}
      </button>

      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer select-none">Chi tiết kỹ thuật</summary>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
          <dt>Diện tích S</dt>
          <dd>{fmt(stats.surfaceArea, 1)} mm²</dd>
          <dt>Thể tích V</dt>
          <dd>{fmt(stats.volume, 1)} mm³</dd>
          <dt>Chiều cao</dt>
          <dd>{fmt(stats.dims.height, 1)} mm</dd>
          {quote.estimate && (
            <>
              <dt>Số lớp</dt>
              <dd>{quote.estimate.layers}</dd>
              <dt>V vỏ (1 bản)</dt>
              <dd>{fmt(quote.estimate.shellVolume, 1)} mm³</dd>
              <dt>V ruột (1 bản)</dt>
              <dd>{fmt(quote.estimate.infillVolume, 1)} mm³</dd>
              <dt>Số bàn in</dt>
              <dd>{quote.estimate.plates}</dd>
            </>
          )}
        </dl>
      </details>
    </div>
  )
}
