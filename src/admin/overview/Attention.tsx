import type { OrderListItem } from '../adminApi.ts'
import { ago } from '../format.ts'
import { ordersHref } from '../route.ts'
import { OrderLine, OrderLineHead } from '../ui/OrderLine.tsx'
import { sectionTitle } from '../ui/styles.ts'

const reason = (o: OrderListItem) =>
  o.fileStatus === 'pending' ? `Tạo ${ago(o.createdAt)}` : `Chờ thanh toán từ ${ago(o.createdAt)}`

/** Danh sách "Cần xử lý": đơn chưa có file, rồi đơn đã nhận quá 24 giờ. */
export function Attention({ orders }: { orders: OrderListItem[] }) {
  return (
    <section aria-labelledby="attention-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="attention-title" className={sectionTitle}>
          Cần xử lý
        </h2>
        <a href={ordersHref()} className="text-[14px] font-medium text-solder hover:underline">
          Xem tất cả đơn
        </a>
      </div>
      <p className="mt-1 text-[15px] text-slate">Đơn chưa có file, và đơn đã nhận quá 24 giờ mà chưa thanh toán.</p>
      {orders.length === 0 ? (
        <p className="mt-6 rounded-[16px] bg-fog px-5 py-6 text-[15px] text-slate">Không có việc tồn đọng. Mọi đơn đều đang chạy đúng nhịp.</p>
      ) : (
        <div className="mt-5">
          <OrderLineHead />
          <ul>
            {orders.map((o) => (
              <li key={o.code}>
                <OrderLine o={o} meta={reason(o)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
