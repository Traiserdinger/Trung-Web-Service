import { useEffect, useState } from 'react'
import { STATUS_LABEL, STATUSES } from '../shared/orderStatus.ts'
import { useFail } from './session.ts'
import { listOrders, type OrdersPage } from './adminApi.ts'

const vnDate = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))

export function OrdersList() {
  const [status, setStatus] = useState('')
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<OrdersPage | null>(null)
  const [error, setError] = useState('')
  const fail = useFail(setError)

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
  const tab = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ${active ? 'bg-ink text-on-ink' : 'bg-fog text-slate hover:text-ink'}`
  const pick = (s: string) => {
    setStatus(s)
    setPage(1)
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tab(status === '')} onClick={() => pick('')}>Tất cả</button>
        {STATUSES.map((s) => (
          <button key={s} type="button" className={tab(status === s)} onClick={() => pick(s)}>{STATUS_LABEL[s]}</button>
        ))}
      </div>
      <input
        type="search"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Tìm theo mã, tên hoặc SĐT"
        aria-label="Tìm kiếm"
        className="w-full rounded-md bg-paper px-3 py-2 ring-1 ring-mist sm:max-w-sm"
      />
      {error && <p role="alert" className="text-alert">{error}</p>}
      <div className="overflow-x-auto rounded-md bg-paper ring-1 ring-mist">
        <table className="w-full text-left text-sm">
          <thead className="bg-fog text-slate">
            <tr>
              {['Mã', 'Ngày', 'Tên', 'SĐT', 'Nhựa · màu', 'Trạng thái'].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.orders.map((o) => (
              <tr key={o.code} className="border-t border-mist">
                <td className="px-3 py-2 tnum"><a href={`#/orders/${encodeURIComponent(o.code)}`} className="text-solder underline">{o.code}</a></td>
                <td className="px-3 py-2 tnum">{vnDate(o.createdAt)}</td>
                <td className="px-3 py-2">{o.customerName}</td>
                <td className="px-3 py-2 tnum">{o.customerPhone}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    {o.colorHex && <span aria-hidden className="size-3 rounded-full ring-1 ring-mist" style={{ background: o.colorHex }} />}
                    {o.colorName ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {STATUS_LABEL[o.status] ?? o.status}
                  {o.fileStatus === 'pending' && (
                    <span className="ml-2 rounded bg-caution-tint px-2 py-0.5 text-xs text-caution">Chưa có file</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.orders.length === 0 && <p className="p-4 text-slate">Không có đơn nào.</p>}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-md px-3 py-1 ring-1 ring-mist disabled:opacity-40">Trước</button>
        <span className="tnum">Trang {page}/{pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-md px-3 py-1 ring-1 ring-mist disabled:opacity-40">Sau</button>
      </div>
    </section>
  )
}
