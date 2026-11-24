import { STATUS_LABEL } from '../../shared/orderStatus.ts'
import type { OrderEvent } from '../adminApi.ts'
import { vnShort } from '../format.ts'
import { sectionTitle } from '../ui/styles.ts'

const emailLabel = (e: OrderEvent) => (e.emailSent === 1 ? 'Email đã gửi' : e.emailSent === 0 ? 'Email lỗi' : 'Không có email')

/** Lịch sử trạng thái, cùng kiểu với trang tra cứu: bước mới nhất là bước hiện tại. */
export function Timeline({ events }: { events: OrderEvent[] }) {
  const last = events.length - 1
  return (
    <section>
      <h2 className={sectionTitle}>Dòng thời gian</h2>
      <ol className="mt-4">
        {events.map((ev, i) => {
          const current = i === last
          const cancelled = ev.status === 'cancelled'
          const tone = cancelled ? 'text-alert' : 'text-solder'
          return (
            <li key={ev.id} aria-current={current ? 'step' : undefined} className="relative flex gap-3 pb-5 last:pb-0">
              {i < last && <span aria-hidden="true" className="absolute top-6 bottom-0 left-[9px] w-px bg-mist" />}
              <span
                aria-hidden="true"
                className={`relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[12px] ${
                  current ? `${cancelled ? 'bg-alert' : 'bg-solder'} text-on-ink` : `bg-paper ring-1 ring-mist ${tone}`
                }`}
              >
                {current ? '●' : '✓'}
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`text-[16px] ${current ? 'font-semibold text-ink' : 'text-ink'} ${cancelled ? 'text-alert' : ''}`}>
                    {STATUS_LABEL[ev.status] ?? ev.status}
                  </span>
                  <span className="tnum text-[13px] text-slate">{vnShort(ev.createdAt)}</span>
                </p>
                <p className={`text-[13px] ${ev.emailSent === 0 ? 'text-alert' : 'text-slate'}`}>{emailLabel(ev)}</p>
                {ev.note && <p className="mt-1.5 rounded-[10px] bg-fog px-3 py-2 text-[14px] whitespace-pre-wrap text-ink">{ev.note}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
