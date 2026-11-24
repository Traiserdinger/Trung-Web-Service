import { PROGRESS, STATUS_LABEL, type OrderStatus } from '../../shared/orderStatus.ts'
import { ordersHref } from '../route.ts'
import { IsoSlab } from '../ui/IsoSlab.tsx'

const SIZE = 104
// Tâm mặt nền của khối cách đáy khung một khoảng cố định (xem isoBox): đường mạch nối các khối chạy qua đó.
const GROUND = Math.round(SIZE * Math.SQRT2 * 0.25 + SIZE * 0.09)

/** Bước có đơn thì khối nhô cao hơn, càng nhiều đơn càng cao (có trần). */
const heightOf = (n: number) => (n === 0 ? 8 : 20 + Math.min(n, 10) * 4)

/** Còn việc phải làm ở bước này (bước Hoàn tất thì không). */
const isBusy = (s: OrderStatus, n: number) => n > 0 && s !== 'done'

function Traces() {
  // đường đồng nhạt trên mặt tấm mạch
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <g fill="none" stroke="rgb(255 255 255 / 0.16)" strokeWidth="1.6" strokeLinecap="round">
        <path d="M10 18h44v22M10 26h28M70 10v26h20M14 84h56l10-10M86 60v28" />
      </g>
      <g fill="rgb(255 255 255 / 0.22)">
        <circle cx="54" cy="40" r="2.4" />
        <circle cx="90" cy="36" r="2.4" />
        <circle cx="80" cy="74" r="2.4" />
      </g>
    </svg>
  )
}

function Step({ s, n, i }: { s: OrderStatus; n: number; i: number }) {
  const busy = isBusy(s, n)
  return (
    <li className="relative flex min-w-[168px] flex-1 snap-start flex-col items-center">
      <a
        href={ordersHref({ status: s })}
        data-state={busy ? 'busy' : n > 0 ? 'filled' : 'empty'}
        aria-label={`${STATUS_LABEL[s]}: ${n} đơn`}
        className="group flex w-full flex-col items-center rounded-[16px] pt-2 pb-3 transition-colors hover:bg-paper/70"
      >
        <span className="flex h-[150px] items-end transition-transform duration-300 group-hover:-translate-y-1">
          <IsoSlab
            size={SIZE}
            height={heightOf(n)}
            color={n > 0 ? 'var(--color-solder-fill)' : 'var(--color-paper)'}
            tone={n > 0 ? 'solid' : 'paper'}
            enig={busy}
            rise={i}
          >
            {n > 0 && <Traces />}
            <span
              className={`tnum relative -rotate-45 font-display text-[56px] leading-none font-bold tracking-[-0.03em] [font-variation-settings:'opsz'_96] ${
                n > 0 ? 'text-white' : 'text-slate/60'
              }`}
            >
              {n}
            </span>
          </IsoSlab>
        </span>
        <span className={`mt-3 text-[15px] ${busy ? 'font-semibold text-ink' : 'text-slate'}`}>{STATUS_LABEL[s]}</span>
        <span className="tnum text-[13px] text-slate">{n === 0 ? 'Trống' : `${n} đơn`}</span>
      </a>
    </li>
  )
}

/** Dây chuyền đơn: 5 khối isometric theo thứ tự trạng thái. */
export function Pipeline({ byStatus }: { byStatus: Record<OrderStatus, number> }) {
  return (
    <div className="scroll-quiet -mx-4 snap-x snap-mandatory overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ol className="relative flex min-w-[760px] gap-2" aria-label="Dây chuyền đơn">
        <span
          aria-hidden="true"
          className="absolute inset-x-[8%] h-[2px] rounded-full bg-mist"
          style={{ top: `calc(8px + 150px - ${GROUND}px - 1px)` }}
        />
        {PROGRESS.map((s, i) => (
          <Step key={s} s={s} n={byStatus[s] ?? 0} i={i} />
        ))}
      </ol>
    </div>
  )
}
