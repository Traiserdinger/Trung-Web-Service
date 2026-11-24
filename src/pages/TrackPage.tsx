import { useState, type FormEvent } from 'react'
import { SiteFooter } from '../components/layout/SiteFooter'
import { Nav } from '../components/site/Nav'
import { trackOrder } from '../lib/api'
import { PROGRESS, STATUS_LABEL, type OrderStatus, type TrackView } from '../shared/orderStatus'
import { formatVnd } from '../utils/format'

const inputCls =
  'w-full rounded-[12px] border border-mist bg-paper px-3.5 py-2.5 text-[15px] text-ink placeholder:text-slate/60 transition-colors focus:border-solder focus:outline-none focus:ring-4 focus:ring-solder/15'

const timeFmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** dd/MM HH:mm theo giờ Việt Nam. */
function formatAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = Object.fromEntries(timeFmt.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}

/** Event mới nhất của một bước (danh sách đã theo thứ tự thời gian tăng dần). */
function latest(order: TrackView, status: OrderStatus) {
  return [...order.events].reverse().find((e) => e.status === status)
}

function Result({ order }: { order: TrackView }) {
  const cancelled = order.status === 'cancelled'
  const currentIdx = PROGRESS.indexOf(order.status)
  const cancel = latest(order, 'cancelled')
  return (
    <section aria-label="Kết quả tra cứu" className="mt-10 rounded-[22px] bg-fog p-6 sm:p-8">
      <p className="text-[13px] text-slate">Mã đơn</p>
      <h2 className="tnum font-display text-[24px] font-bold">{order.code}</h2>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[15px] text-slate">
        {order.colorHex && (
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 rounded-full ring-1 ring-mist"
            style={{ backgroundColor: order.colorHex }}
          />
        )}
        <span>
          {[order.material, order.colorName, `SL ${order.quantity}`].filter(Boolean).join(' · ')}
          {order.estimateTotal !== null && (
            <>
              {' · tạm tính '}
              <span className="tnum font-semibold text-ink">{formatVnd(order.estimateTotal)}</span>
            </>
          )}
        </span>
      </p>

      {cancelled ? (
        <div className="mt-6 rounded-[16px] border border-alert p-5">
          <p className="font-display text-[18px] font-bold text-alert">Đơn đã huỷ</p>
          {cancel?.note && <p className="mt-2 text-[15px] whitespace-pre-wrap text-ink">{cancel.note}</p>}
          {cancel && <p className="tnum mt-2 text-[13px] text-slate">{formatAt(cancel.at)}</p>}
        </div>
      ) : (
        <ol className="mt-6 space-y-4">
          {PROGRESS.map((s, i) => {
            const ev = latest(order, s)
            const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo'
            return (
              <li key={s} aria-current={state === 'current' ? 'step' : undefined} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className={`w-5 shrink-0 text-center ${state === 'todo' ? 'text-slate' : 'text-solder'}`}
                >
                  {state === 'done' ? '✓' : state === 'current' ? '●' : '○'}
                </span>
                <div>
                  <p className={`text-[16px] ${state === 'todo' ? 'text-slate' : 'font-semibold text-ink'}`}>
                    <span>{STATUS_LABEL[s]}</span>
                    {ev && state !== 'todo' && <span className="tnum ml-2 text-[13px] font-normal text-slate">{formatAt(ev.at)}</span>}
                  </p>
                  {ev?.note && state !== 'todo' && (
                    <p className="mt-1 text-[14px] whitespace-pre-wrap text-slate">{ev.note}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

export default function TrackPage() {
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('ma') ?? '')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [order, setOrder] = useState<TrackView | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await trackOrder(code.trim(), phone.trim())
    setBusy(false)
    if (r.ok) setOrder(r.order)
    else {
      setOrder(null)
      setError(r.error)
    }
  }

  return (
    <div className="min-h-screen bg-studio text-ink">
      <Nav />
      <main className="mx-auto max-w-[640px] px-4 py-16 sm:px-6 lg:py-24">
        <h1 className="text-[clamp(32px,4vw,48px)] font-bold">Tra cứu đơn</h1>
        <p className="mt-3 text-[16px] leading-[1.65] text-slate">Nhập mã đơn và số điện thoại đã dùng khi đặt.</p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="track-code" className="text-[14px] font-semibold">
              Mã đơn
            </label>
            <input
              id="track-code"
              className={`${inputCls} mt-1.5`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="P3D-241124-AB12"
              autoComplete="off"
              required
            />
          </div>
          <div>
            <label htmlFor="track-phone" className="text-[14px] font-semibold">
              Số điện thoại
            </label>
            <input
              id="track-phone"
              type="tel"
              autoComplete="tel"
              className={`${inputCls} mt-1.5`}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-on-ink transition-colors hover:bg-solder disabled:opacity-60"
          >
            {busy ? 'Đang tra cứu…' : 'Tra cứu'}
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-4 text-[14px] text-alert">
            {error}
          </p>
        )}
        {order && <Result order={order} />}
      </main>
      <SiteFooter />
    </div>
  )
}
