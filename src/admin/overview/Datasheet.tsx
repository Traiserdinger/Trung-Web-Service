import { formatVnd } from '../../utils/format.ts'
import type { Stats } from '../adminApi.ts'

/** Hàng số liệu phụ kiểu datasheet, có vạch ngăn, giống dải thông số dưới hero của web chính. */
export function Datasheet({ stats }: { stats: Stats }) {
  const items = [
    { label: 'Tạm tính 30 ngày', value: formatVnd(stats.estimate30Days), note: 'Không tính đơn đã huỷ' },
    { label: 'Đơn 7 ngày qua', value: String(stats.last7Days), note: 'Tính theo ngày tạo' },
    { label: 'Đơn chưa có file', value: String(stats.pendingFiles), note: 'Chờ khách gửi file', warn: stats.pendingFiles > 0 },
    { label: 'Chờ thanh toán', value: String(stats.byStatus.received), note: 'Đơn ở bước Đã nhận đơn' },
  ]
  return (
    <dl className="grid grid-cols-2 border-y border-mist lg:grid-cols-4">
      {items.map((s, i) => (
        <div
          key={s.label}
          className={[
            'py-5 pr-4',
            i % 2 === 1 ? 'border-l border-mist pl-4' : '',
            i > 0 ? 'lg:border-l lg:border-mist lg:pl-6' : '',
            i >= 2 ? 'border-t border-mist lg:border-t-0' : '',
          ].join(' ')}
        >
          <dt className="flex items-center gap-2 text-[13px] text-slate">
            {s.warn && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-enig" />}
            {s.label}
          </dt>
          <dd className="tnum mt-1 font-display text-[24px] font-bold tracking-[-0.02em] text-ink">{s.value}</dd>
          <dd className="text-[13px] text-slate">{s.note}</dd>
        </div>
      ))}
    </dl>
  )
}
