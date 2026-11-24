import { useEffect, useState } from 'react'
import { STATUS_LABEL, STATUSES, type OrderStatus } from '../shared/orderStatus.ts'
import { formatVnd } from '../utils/format.ts'
import { deleteOrder, getOrder, setStatus, type OrderEvent, type OrderRow } from './adminApi.ts'
import { useFail } from './session.ts'
import { DeleteDialog } from './DeleteDialog.tsx'

const vnDateTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso))

const emailLabel = (e: OrderEvent) => (e.emailSent === 1 ? 'Email đã gửi' : e.emailSent === 0 ? 'Email lỗi' : 'Không có email')

// Settings/dims/estimate là chuỗi JSON: hiện dưới dạng text, estimate có định dạng tiền nếu đọc được.
function estimateText(s: string | null): string {
  if (!s) return '—'
  try {
    const t = (JSON.parse(s) as { total?: unknown }).total
    return typeof t === 'number' ? `${formatVnd(t)}  (${s})` : s
  } catch {
    return s
  }
}

function Fields({ o }: { o: OrderRow }) {
  const rows: [string, string | null][] = [
    ['Mã đơn', o.code],
    ['Ngày tạo', vnDateTime(o.createdAt)],
    ['Loại đơn', o.orderType],
    ['Lý do tư vấn', o.consultReasons],
    ['Tên', o.customerName],
    ['SĐT', o.customerPhone],
    ['Email', o.customerEmail],
    ['Ghi chú của khách', o.customerNote],
    ['Màu', o.colorName ? `${o.colorName} ${o.colorHex ?? ''}` : null],
    ['Cài đặt in', o.settings],
    ['Kích thước', o.dims],
    ['Diện tích bề mặt', o.surfaceArea?.toString() ?? null],
    ['Thể tích', o.volume?.toString() ?? null],
    ['Tỉ lệ', o.scale?.toString() ?? null],
    ['Ước tính', estimateText(o.estimate)],
    ['Tên file', o.fileName],
    ['Dung lượng file', o.fileSize?.toString() ?? null],
    ['Cách gửi file', o.fileDelivery],
    ['Trạng thái file', o.fileStatus],
    ['Trạng thái', STATUS_LABEL[o.status] ?? o.status],
  ]
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[12rem_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate">{k}</dt>
          <dd className="whitespace-pre-wrap break-words">{v || '—'}</dd>
        </div>
      ))}
      <dt className="text-slate">Link Drive</dt>
      <dd className="break-all">
        {o.driveUrl?.startsWith('https://') ? (
          <a href={o.driveUrl} target="_blank" rel="noopener noreferrer" className="text-solder underline">{o.driveUrl}</a>
        ) : (
          o.driveUrl || '—'
        )}
      </dd>
    </dl>
  )
}

// key theo mã đơn: đổi đơn thì dựng lại toàn bộ state, không còn dữ liệu đơn cũ.
export function OrderDetail({ code }: { code: string }) {
  return <OrderDetailBody key={code} code={code} />
}

function OrderDetailBody({ code }: { code: string }) {
  const [order, setOrder] = useState<OrderRow | null>(null)
  const [events, setEvents] = useState<OrderEvent[]>([])
  const [error, setError] = useState('')
  const fail = useFail(setError)
  const [status, setStatusValue] = useState<OrderStatus>('received')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let alive = true
    getOrder(code)
      .then((d) => {
        if (!alive) return
        setOrder(d.order)
        setEvents(d.events)
        setStatusValue(d.order.status)
      })
      .catch((e: Error) => alive && fail(e))
    return () => {
      alive = false
    }
  }, [code, fail])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await setStatus(code, status, note.trim() || undefined)
      setEvents((prev) => [...prev, r.event])
      setOrder((o) => (o ? { ...o, status } : o))
      setNote('')
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    try {
      await deleteOrder(code)
      window.location.hash = '#/orders'
    } catch (err) {
      fail(err)
      setDeleting(false)
    }
  }

  return (
    <section className="space-y-6">
      <a href="#/orders" className="text-sm text-slate underline">← Danh sách đơn</a>
      {error && <p role="alert" className="text-alert">{error}</p>}
      {order && (
        <>
          {order.fileStatus === 'pending' && (
            <p role="alert" className="rounded-md bg-caution-tint p-3 text-caution">
              Đơn này chưa có file: khách chưa tải file lên hoặc file chưa được lưu vào Drive.
            </p>
          )}
          <Fields o={order} />
          <div>
            <h2 className="mb-2 font-display text-xl font-bold">Dòng thời gian</h2>
            <ol className="space-y-2">
              {events.map((ev) => (
                <li key={ev.id} className="rounded-md bg-paper p-3 ring-1 ring-mist">
                  <span className="tnum text-slate">{vnDateTime(ev.createdAt)}</span>{' · '}
                  <strong>{STATUS_LABEL[ev.status] ?? ev.status}</strong>{' · '}
                  <span className="text-slate">{emailLabel(ev)}</span>
                  {ev.note && <p className="whitespace-pre-wrap">{ev.note}</p>}
                </li>
              ))}
            </ol>
          </div>
          <form onSubmit={submit} className="space-y-3 rounded-md bg-paper p-4 ring-1 ring-mist">
            <label className="block">
              <span className="text-slate">Trạng thái mới</span>
              <select value={status} onChange={(e) => setStatusValue(e.target.value as OrderStatus)} className="mt-1 block w-full rounded-md bg-fog px-3 py-2 sm:w-auto">
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-slate">Ghi chú</span>
              <textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} className="mt-1 block w-full rounded-md bg-fog px-3 py-2" />
            </label>
            <p className="text-sm text-slate">Ghi chú này khách sẽ thấy trên trang tra cứu và trong email.</p>
            <button type="submit" disabled={busy} className="rounded-md bg-solder-fill px-4 py-2 font-medium text-white disabled:opacity-50">Cập nhật</button>
          </form>
          <button type="button" onClick={() => setDeleting(true)} className="rounded-md px-4 py-2 text-alert ring-1 ring-alert">Xoá đơn rác</button>
          {deleting && <DeleteDialog code={code} onCancel={() => setDeleting(false)} onConfirm={remove} />}
        </>
      )}
    </section>
  )
}
