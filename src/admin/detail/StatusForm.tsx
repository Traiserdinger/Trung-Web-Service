import { useState } from 'react'
import { STATUS_LABEL, STATUSES, type OrderStatus } from '../../shared/orderStatus.ts'
import { btnSolder, inputCls, sectionTitle } from '../ui/styles.ts'

interface Props {
  initial: OrderStatus
  /** Trả true nếu lưu được (để xoá ô ghi chú) */
  onSubmit: (status: OrderStatus, note: string) => Promise<boolean>
}

export function StatusForm({ initial, onSubmit }: Props) {
  const [status, setStatus] = useState<OrderStatus>(initial)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (await onSubmit(status, note.trim())) setNote('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-[16px] bg-paper p-5 ring-1 ring-mist">
      <h2 className={sectionTitle}>Đổi trạng thái</h2>
      <label className="block">
        <span className="text-[14px] font-semibold">Trạng thái mới</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus)}
          className={`${inputCls} mt-1.5 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10`}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235b6661' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9.5 6 6 6-6'/%3E%3C/svg%3E\")",
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[14px] font-semibold">Ghi chú</span>
        <textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} className={`${inputCls} mt-1.5 resize-y`} />
      </label>
      <p className="text-[13px] text-slate">Ghi chú này khách sẽ thấy trên trang tra cứu và trong email.</p>
      <button type="submit" disabled={busy} className={`${btnSolder} w-full sm:w-auto`}>
        {busy ? 'Đang lưu…' : 'Cập nhật'}
      </button>
    </form>
  )
}
