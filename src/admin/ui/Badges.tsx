import { STATUS_LABEL, type OrderStatus } from '../../shared/orderStatus.ts'

const PILL: Record<OrderStatus, string> = {
  received: 'bg-fog text-ink',
  paid: 'bg-solder-tint text-solder',
  printing: 'bg-solder-tint text-solder',
  shipping: 'bg-solder-tint text-solder',
  done: 'text-slate ring-1 ring-inset ring-mist',
  cancelled: 'bg-alert-tint text-alert',
}

const DOT: Record<OrderStatus, string> = {
  received: 'bg-slate',
  paid: 'bg-solder',
  printing: 'bg-solder',
  shipping: 'bg-solder',
  done: 'bg-mist',
  cancelled: 'bg-alert',
}

/** Trạng thái dạng viên thuốc */
export function StatusPill({ status }: { status: string }) {
  const s = (status in STATUS_LABEL ? status : 'received') as OrderStatus
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap ${PILL[s]}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[s]}`} />
      {STATUS_LABEL[s] ?? status}
    </span>
  )
}

export function FileBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-caution-tint px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap text-caution">
      Chưa có file
    </span>
  )
}

/** Chấm màu nhựa */
export function ColorDot({ hex, className = 'h-3.5 w-3.5' }: { hex: string | null; className?: string }) {
  if (!hex) return null
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full ring-1 ring-inset ring-ink/15 ${className}`}
      style={{ backgroundColor: hex }}
    />
  )
}
