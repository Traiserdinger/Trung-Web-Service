import { useEffect, useState } from 'react'
import { STATUS_LABEL, STATUSES } from '../shared/orderStatus.ts'
import { listOrders, type OrdersPage } from './adminApi.ts'
import { vnShort } from './format.ts'
import { useFail } from './session.ts'
import { useStats } from './statsContext.ts'
import { OrderLine, OrderLineHead } from './ui/OrderLine.tsx'
import { PageHeader } from './ui/PageHeader.tsx'
import { SearchBox } from './ui/SearchBox.tsx'
import { alertCls, btnQuiet } from './ui/styles.ts'

interface Props {
  initialStatus?: string
  initialQuery?: string
}

export function OrdersList({ initialStatus = '', initialQuery = '' }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [input, setInput] = useState(initialQuery)
  const [q, setQ] = useState(initialQuery)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<OrdersPage | null>(null)
  const [error, setError] = useState('')
  const fail = useFail(setError)
  const byStatus = useStats()?.stats?.byStatus

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(input.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [input])

  useEffect(() => {
    let alive = true
    listOrders({ status, q, page })
      .then((d) => alive && (setData(d), setError('')))
      .catch((e: Error) => alive && fail(e))
    return () => {
      alive = false
    }
  }, [status, q, page, fail])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const pick = (s: string) => {
    setStatus(s)
    setPage(1)
  }
  const all = byStatus ? Object.values(byStatus).reduce((a, b) => a + b, 0) : undefined
  const tabs = [{ id: '', label: 'Tất cả', n: all }, ...STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s], n: byStatus?.[s] }))]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Đơn hàng"
        lead={data ? `${data.total} đơn${q ? ` khớp với "${q}"` : ''}` : ' '}
        aside={<SearchBox value={input} onChange={setInput} />}
      />
      <div className="scroll-quiet -mx-4 overflow-x-auto border-b border-mist px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1" role="group" aria-label="Lọc theo trạng thái">
          {tabs.map((t) => {
            const active = status === t.id
            return (
              <button
                key={t.id || 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => pick(t.id)}
                className={`relative -mb-px flex items-center gap-1.5 border-b-2 px-2.5 pt-2 pb-3 text-[15px] whitespace-nowrap transition-colors ${
                  active ? 'border-solder font-semibold text-ink' : 'border-transparent text-slate hover:text-ink'
                }`}
              >
                {t.label}
                {t.n !== undefined && (
                  <span
                    className={`tnum rounded-full px-2 text-[13px] font-medium ${
                      active ? 'bg-solder-tint text-solder' : t.id === 'cancelled' && t.n > 0 ? 'bg-alert-tint text-alert' : 'bg-fog text-slate'
                    }`}
                  >
                    <span className="sr-only">, </span>
                    {t.n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      {error && (
        <p role="alert" className={alertCls}>
          {error}
        </p>
      )}
      <div>
        <OrderLineHead />
        <ul>
          {data?.orders.map((o) => (
            <li key={o.code}>
              <OrderLine o={o} meta={vnShort(o.createdAt)} />
            </li>
          ))}
        </ul>
        {data && data.orders.length === 0 && <p className="py-10 text-center text-[15px] text-slate">Không có đơn nào.</p>}
      </div>
      {pages > 1 && (
        <nav aria-label="Phân trang" className="flex items-center justify-end gap-3 text-[14px]">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={btnQuiet}>
            Trước
          </button>
          <span className="tnum text-slate">
            Trang {page}/{pages}
          </span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={btnQuiet}>
            Sau
          </button>
        </nav>
      )}
    </div>
  )
}
