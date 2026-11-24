import type { ReactNode } from 'react'
import type { OrderListItem } from '../adminApi.ts'
import { orderHref } from '../route.ts'
import { ColorDot, FileBadge, StatusPill } from './Badges.tsx'
import { IconChevron } from './icons.tsx'

const COLS =
  'md:grid-cols-[minmax(150px,1fr)_minmax(150px,1.2fr)_minmax(80px,0.6fr)_minmax(230px,1.2fr)_16px] md:items-center md:gap-x-6'

/** Hàng tiêu đề cột (chỉ máy tính); trình đọc màn hình đã có đủ chữ trong từng dòng nên ẩn đi. */
export function OrderLineHead() {
  return (
    <div aria-hidden="true" className={`hidden border-b border-mist pb-2.5 text-[13px] text-slate md:grid ${COLS}`}>
      <span>Mã đơn</span>
      <span>Khách</span>
      <span>Màu nhựa</span>
      <span>Trạng thái</span>
      <span />
    </div>
  )
}

/** Một đơn: cả dòng là link mở chi tiết. `meta` là dòng phụ dưới mã đơn (ngày tạo hoặc lý do). */
export function OrderLine({ o, meta }: { o: OrderListItem; meta: ReactNode }) {
  return (
    <a
      href={orderHref(o.code)}
      className={`group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-mist py-4 transition-colors hover:bg-fog/60 focus-visible:bg-fog/60 md:-mx-3 md:rounded-[10px] md:border-transparent md:px-3 ${COLS}`}
    >
      <span className="min-w-0">
        <span className="tnum block text-[15px] font-semibold text-ink">{o.code}</span>
        <span className="tnum block text-[13px] text-slate">{meta}</span>
      </span>
      <span className="col-span-2 col-start-1 row-start-2 flex min-w-0 items-center gap-2 md:col-span-1 md:col-start-auto md:row-start-auto md:block">
        <ColorDot hex={o.colorHex} className="h-3 w-3 md:hidden" />
        <span className="truncate text-[15px] md:block">{o.customerName}</span>
        <span className="tnum text-[13px] text-slate md:block">{o.customerPhone}</span>
      </span>
      <span className="hidden items-center gap-2 text-[15px] md:flex">
        <ColorDot hex={o.colorHex} />
        <span className="truncate">{o.colorName ?? 'Chưa chọn'}</span>
      </span>
      <span className="col-start-2 row-start-1 flex flex-col items-end gap-1.5 md:col-start-auto md:row-start-auto md:flex-row md:flex-wrap md:items-center md:justify-start md:gap-2">
        <StatusPill status={o.status} />
        {o.fileStatus === 'pending' && <FileBadge />}
      </span>
      <IconChevron className="hidden h-4 w-4 text-slate transition-transform group-hover:translate-x-0.5 md:block" />
    </a>
  )
}
