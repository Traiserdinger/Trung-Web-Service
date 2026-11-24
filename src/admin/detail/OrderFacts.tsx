import type { ReactNode } from 'react'
import { formatDuration, formatVnd } from '../../utils/format.ts'
import type { OrderRow } from '../adminApi.ts'
import { fileSize, num, parseObj, vnDateTime, vnNum } from '../format.ts'
import { ColorDot } from '../ui/Badges.tsx'
import { sectionTitle } from '../ui/styles.ts'

interface Row {
  k: string
  v: ReactNode
}
const r = (k: string, v: ReactNode): Row => ({ k, v })

function Block({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section>
      <h2 className={sectionTitle}>{title}</h2>
      <dl className="mt-3 border-t border-mist">
        {rows.map(({ k, v }) => (
          <div key={k} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-x-4 border-b border-mist py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <dt className="text-[14px] text-slate">{k}</dt>
            <dd className="text-[15px] break-words whitespace-pre-wrap">{v === null || v === '' || v === undefined ? '—' : v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function reasons(s: string | null): string | null {
  if (!s) return null
  try {
    const v: unknown = JSON.parse(s)
    return Array.isArray(v) ? v.join('\n') || null : s
  } catch {
    return s
  }
}

const mm = (v: unknown) => (num(v) === null ? '?' : String(Math.round(num(v)!)))

function printRows(o: OrderRow): Row[] {
  const s = parseObj(o.settings)
  const d = parseObj(o.dims)
  const est = parseObj(o.estimate)
  const rows: Row[] = []
  if (s) {
    rows.push(r('Nhựa', typeof s.material === 'string' ? s.material : null))
    rows.push(r('Lớp, infill, tường', `${num(s.layerHeight) === null ? '?' : vnNum(num(s.layerHeight)!, 2)} mm, ${num(s.infillPercent) ?? '?'}%, ${num(s.wallLoops) ?? '?'} tường`))
    rows.push(r('Support', s.support ? 'Có' : 'Không'))
    rows.push(r('Số lượng', <span className="tnum">{num(s.quantity) ?? '?'}</span>))
  } else rows.push(r('Cài đặt in', o.settings))
  rows.push(r('Kích thước', d ? <span className="tnum">{`${mm(d.length)} × ${mm(d.width)} × ${mm(d.height)} mm`}</span> : o.dims))
  if (o.volume !== null) rows.push(r('Thể tích', <span className="tnum">{vnNum(o.volume / 1000)} cm³</span>))
  if (o.surfaceArea !== null) rows.push(r('Diện tích bề mặt', <span className="tnum">{vnNum(o.surfaceArea / 100)} cm²</span>))
  if (o.scale !== null && o.scale !== 1) rows.push(r('Tỉ lệ', <span className="tnum">Nhân {vnNum(o.scale, 3)} (file gốc tính bằng inch)</span>))
  if (est) {
    const g = num(est.grams)
    const t = num(est.timeSec)
    if (g !== null || t !== null)
      rows.push(r('Nhựa và giờ máy', <span className="tnum">{[g !== null && `${vnNum(g)} g`, t !== null && formatDuration(t)].filter(Boolean).join(', ')}</span>))
    const total = num(est.total)
    rows.push(r(
      'Tạm tính',
      total === null ? o.estimate : <span className="tnum font-display text-[21px] font-bold tracking-[-0.02em]">{formatVnd(total)}</span>,
    ))
  } else if (o.estimate) rows.push(r('Tạm tính', o.estimate))
  return rows
}

export function OrderFacts({ o }: { o: OrderRow }) {
  const drive = o.driveUrl?.startsWith('https://') ? (
    <a href={o.driveUrl} target="_blank" rel="noopener noreferrer" className="break-all text-solder underline underline-offset-2">
      {o.driveUrl}
    </a>
  ) : (
    o.driveUrl
  )
  return (
    <div className="space-y-10">
      <Block
        title="Khách hàng"
        rows={[
          r('Tên', o.customerName),
          r('SĐT', <a href={`tel:${o.customerPhone}`} className="tnum text-solder hover:underline">{o.customerPhone}</a>),
          r('Email', o.customerEmail),
          r('Ghi chú của khách', o.customerNote),
          ...(o.orderType === 'consult' ? [r('Lý do tư vấn', reasons(o.consultReasons))] : []),
          r('Ngày tạo', <span className="tnum">{vnDateTime(o.createdAt)}</span>),
        ]}
      />
      <Block
        title="Thông số in"
        rows={[
          r('Màu', o.colorName ? <span className="inline-flex items-center gap-2"><ColorDot hex={o.colorHex} />{o.colorName}<span className="tnum text-[13px] text-slate">{o.colorHex}</span></span> : null),
          ...printRows(o),
        ]}
      />
      <Block
        title="File và Drive"
        rows={[
          r('Tên file', o.fileName),
          r('Dung lượng', o.fileSize !== null ? <span className="tnum">{fileSize(o.fileSize)}</span> : null),
          r('Cách gửi file', o.fileDelivery === 'zalo' ? 'Khách gửi qua Zalo' : o.fileDelivery === 'drive' ? 'Tải lên Drive' : o.fileDelivery),
          r('Trạng thái file', o.fileStatus === 'pending' ? 'Chưa có file' : o.fileStatus === 'saved' ? 'Đã lưu' : o.fileStatus),
          r('Link Drive', drive),
        ]}
      />
    </div>
  )
}
