import { useEffect, useState } from 'react'
import type { OrderStatus } from '../shared/orderStatus.ts'
import { deleteOrder, getOrder, setStatus, type OrderEvent, type OrderFileRow, type OrderItemRow, type OrderRow } from './adminApi.ts'
import { DeleteDialog } from './DeleteDialog.tsx'
import { PrintSheet } from './detail/PrintSheet.tsx'
import { OrderFacts } from './detail/OrderFacts.tsx'
import { StatusForm } from './detail/StatusForm.tsx'
import { Timeline } from './detail/Timeline.tsx'
import { vnDateTime } from './format.ts'
import { ordersHref } from './route.ts'
import { useFail } from './session.ts'
import { useStats } from './statsContext.ts'
import { StatusPill } from './ui/Badges.tsx'
import { IconBack } from './ui/icons.tsx'
import { IsoSlab } from './ui/IsoSlab.tsx'
import { alertCls } from './ui/styles.ts'

// key theo mã đơn: đổi đơn thì dựng lại toàn bộ state, không còn dữ liệu đơn cũ.
export function OrderDetail({ code }: { code: string }) {
  return <OrderDetailBody key={code} code={code} />
}

function OrderDetailBody({ code }: { code: string }) {
  const [order, setOrder] = useState<OrderRow | null>(null)
  const [events, setEvents] = useState<OrderEvent[]>([])
  const [files, setFiles] = useState<OrderFileRow[]>([])
  const [items, setItems] = useState<OrderItemRow[]>([])
  const [error, setError] = useState('')
  const fail = useFail(setError)
  const [deleting, setDeleting] = useState(false)
  // đổi mỗi lần lưu trạng thái để mẫu nhựa nhún lại
  const [bump, setBump] = useState(0)
  const refreshStats = useStats()?.refresh

  useEffect(() => {
    let alive = true
    getOrder(code)
      .then((d) => {
        if (!alive) return
        setOrder(d.order)
        setEvents(d.events)
        setFiles(d.files ?? [])
        setItems(d.items ?? [])
      })
      .catch((e: Error) => alive && fail(e))
    return () => {
      alive = false
    }
  }, [code, fail])

  async function save(status: OrderStatus, note: string) {
    setError('')
    try {
      const r = await setStatus(code, status, note || undefined)
      setEvents((prev) => [...prev, r.event])
      setOrder((o) => (o ? { ...o, status } : o))
      setBump((b) => b + 1)
      refreshStats?.()
      return true
    } catch (err) {
      fail(err)
      return false
    }
  }

  async function remove() {
    try {
      await deleteOrder(code)
      refreshStats?.()
      window.location.hash = '#/orders'
    } catch (err) {
      fail(err)
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-8">
      <a href={ordersHref()} className="inline-flex items-center gap-1.5 rounded-lg text-[14px] text-slate hover:text-ink">
        <IconBack />
        Danh sách đơn
      </a>
      {error && (
        <p role="alert" className={alertCls}>
          {error}
        </p>
      )}
      {order && (
        <>
          <header className="flex items-center gap-4 sm:gap-6">
            <IsoSlab
              key={bump}
              size={80}
              height={22}
              color={order.colorHex || 'var(--color-paper)'}
              tone={order.colorHex ? 'solid' : 'paper'}
              bump={bump > 0}
              className="-my-3 -ml-2"
            />
            <div className="min-w-0">
              <p className="text-[13px] text-slate">{order.orderType === 'consult' ? 'Đơn cần tư vấn' : 'Đơn in 3D'}</p>
              <h1 className="tnum truncate text-[28px] font-bold tracking-[-0.03em] [font-variation-settings:'opsz'_96] sm:text-[36px]">
                {order.code}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-slate">
                <StatusPill status={order.status} />
                <span>{order.colorName ?? 'Chưa chọn màu'}</span>
                <span className="tnum">Tạo lúc {vnDateTime(order.createdAt)}</span>
              </p>
            </div>
          </header>
          {order.fileStatus === 'pending' && (
            <p role="alert" className="flex gap-3 rounded-[10px] bg-caution-tint px-4 py-3 text-[15px] text-caution">
              <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-enig" />
              Đơn này chưa có file: khách chưa tải file lên hoặc file chưa được lưu vào Drive.
            </p>
          )}
          <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
            <div className="space-y-12">
              {items.length > 0 && <PrintSheet order={order} files={files} items={items} />}
              <OrderFacts o={order} />
            </div>
            <div className="order-first space-y-8 lg:order-none">
              <Timeline events={events} />
              <StatusForm initial={order.status} onSubmit={save} />
              <div className="border-t border-mist pt-6">
                <p className="text-[14px] text-slate">Đơn thử, đơn trùng hoặc spam: xoá hẳn khỏi hệ thống.</p>
                <button
                  type="button"
                  onClick={() => setDeleting(true)}
                  className="mt-3 inline-flex items-center rounded-[10px] px-4 py-2 text-[14px] font-medium text-alert ring-1 ring-alert/60 transition-colors hover:bg-alert-tint"
                >
                  Xoá đơn rác
                </button>
              </div>
            </div>
          </div>
          {deleting && <DeleteDialog code={code} onCancel={() => setDeleting(false)} onConfirm={remove} />}
        </>
      )}
    </div>
  )
}
