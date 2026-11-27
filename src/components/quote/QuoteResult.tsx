import { formatDuration, formatVnd } from '../../utils/format'
import type { MeshStats } from '../../utils/meshAnalysis'
import type { QuoteState } from '../../utils/quoteState'

interface Props {
  quote: QuoteState | null
  /** Thông số mesh của đơn một món; nhiều món thì null (ẩn phần thông số mesh) */
  stats: MeshStats | null
  onSubmit(): void
  /** Số tiền bớt được khi gộp chung bàn so với in riêng từng món */
  savings?: number | null
  separateTotal?: number | null
  /** Đang xếp bàn: chưa có giá */
  pending?: boolean
}

const fmt = (n: number, digits = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: digits })

/** Mép răng cưa như phiếu in nhiệt */
function TicketEdge() {
  return (
    <div
      aria-hidden="true"
      className="h-3 w-full"
      style={{
        background:
          'radial-gradient(circle at 8px -2px, transparent 7px, var(--color-paper) 7.5px) 0 0 / 16px 12px repeat-x',
      }}
    />
  )
}

export function QuoteResult({ quote, stats, onSubmit, savings = null, separateTotal = null, pending = false }: Props) {
  if (!quote) {
    return (
      <div className="rounded-[18px] border border-dashed border-mist px-5 py-6 text-[15px] text-slate">
        Giá tạm tính hiện ở đây ngay khi bạn thả file STL vào khung bên cạnh.
      </div>
    )
  }

  const isQuote = quote.orderType === 'quote' && quote.estimate && quote.price

  return (
    <div className="drop-shadow-[0_18px_30px_rgb(27_36_32/0.12)]">
      <TicketEdge />
      <div className="bg-paper px-6 pt-4 pb-6">
        {pending ? (
          <div className="flex items-center gap-3 py-6 text-[16px] font-semibold text-ink" aria-live="polite">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-mist border-t-solder" aria-hidden="true" />
            Đang xếp bàn…
          </div>
        ) : isQuote ? (
          <>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[14px] text-slate">Tạm tính</div>
                <div className="font-display text-[44px] leading-none font-bold tracking-[-0.03em] text-ink tnum">
                  {formatVnd(quote.price!.total)}
                </div>
              </div>
              <div className="pb-1 text-right text-[13px] text-slate tnum">
                <div>Khoảng</div>
                <div className="font-semibold text-ink">
                  {formatVnd(quote.price!.rangeLow)} – {formatVnd(quote.price!.rangeHigh)}
                </div>
              </div>
            </div>
            {savings !== null && separateTotal !== null && (
              <div className="mt-4 space-y-1.5">
                <p className="text-[14px] text-slate tnum">
                  In riêng từng món: {formatVnd(separateTotal)} → Gộp chung bàn: {formatVnd(quote.price!.total)}
                </p>
                <p className="inline-block rounded-full bg-solder-tint px-3 py-1 text-[14px] font-semibold text-solder tnum">
                  Bạn tiết kiệm {formatVnd(savings)}
                </p>
              </div>
            )}
            <dl className="mt-5 grid grid-cols-2 border-y border-dashed border-mist py-4 text-[14px]">
              <div>
                <dt className="text-slate">Nhựa</dt>
                <dd className="mt-0.5 font-semibold text-ink tnum">≈ {fmt(quote.estimate!.grams, 1)} g</dd>
              </div>
              <div>
                <dt className="text-slate">Thời gian in</dt>
                <dd className="mt-0.5 font-semibold text-ink tnum">≈ {formatDuration(quote.estimate!.timeSec)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[13px] leading-[1.55] text-slate">
              Sai số khoảng ±20%. Giá chính xác sau khi mình slice file trên Bambu Studio.
            </p>
          </>
        ) : (
          <div>
            <div className="font-display text-[26px] font-bold text-ink">Cần tư vấn trước khi báo giá</div>
            <ul className="mt-3 space-y-1.5 text-[15px] text-ink">
              {quote.consultReasons.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-caution" aria-hidden="true" />
                  {r === 'ABS' ? 'ABS: máy A1 Mini khung hở, cần tư vấn trước khi in' : r}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] leading-[1.55] text-slate">
              Bạn vẫn gửi file được. Mình xem rồi báo lại qua Zalo.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="mt-5 w-full rounded-full bg-solder-fill px-5 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-solder-deep disabled:opacity-60"
        >
          {isQuote || pending ? 'Gửi yêu cầu in' : 'Gửi yêu cầu tư vấn'}
        </button>

        <details className="group mt-4 text-[13px] text-slate">
          <summary className="cursor-pointer list-none select-none hover:text-ink">
            <span className="inline-block transition-transform group-open:rotate-90">›</span> Chi tiết kỹ thuật
          </summary>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 tnum">
            {stats && (
              <>
                <dt>Diện tích bề mặt</dt>
                <dd className="text-ink">{fmt(stats.surfaceArea, 1)} mm²</dd>
                <dt>Thể tích</dt>
                <dd className="text-ink">{fmt(stats.volume, 1)} mm³</dd>
                <dt>Chiều cao</dt>
                <dd className="text-ink">{fmt(stats.dims.height, 1)} mm</dd>
              </>
            )}
            {quote.estimate && (
              <>
                <dt>Số lớp</dt>
                <dd className="text-ink">{quote.estimate.layers}</dd>
                <dt>Thể tích vỏ, 1 bản</dt>
                <dd className="text-ink">{fmt(quote.estimate.shellVolume, 1)} mm³</dd>
                <dt>Thể tích ruột, 1 bản</dt>
                <dd className="text-ink">{fmt(quote.estimate.infillVolume, 1)} mm³</dd>
                <dt>Số bàn in</dt>
                <dd className="text-ink">{quote.estimate.plates}</dd>
              </>
            )}
          </dl>
        </details>
      </div>
    </div>
  )
}
