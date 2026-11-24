import { useEffect, useState } from 'react'
import { btnDanger, btnQuiet, inputCls } from './ui/styles.ts'

export function DeleteDialog({ code, onCancel, onConfirm }: { code: string; onCancel: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Xác nhận xoá đơn"
      className="fixed inset-0 z-50 flex items-end justify-center bg-night/50 p-4 backdrop-blur-[2px] sm:items-center"
    >
      <div className="w-full max-w-md space-y-4 rounded-[16px] bg-paper p-6 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.35)] ring-1 ring-mist">
        <h2 id="delete-title" className="font-display text-[24px] font-bold tracking-[-0.02em]">
          Xoá đơn rác
        </h2>
        <p className="text-[15px] text-slate">
          Đơn và toàn bộ lịch sử trạng thái sẽ bị xoá vĩnh viễn, khách không tra cứu được nữa. Gõ lại mã đơn{' '}
          <strong className="tnum font-semibold text-ink">{code}</strong> để xác nhận.
        </p>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-label="Mã đơn xác nhận"
          autoComplete="off"
          spellCheck={false}
          className={`${inputCls} tnum`}
          autoFocus
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className={btnQuiet}>
            Huỷ
          </button>
          <button type="button" disabled={typed !== code} onClick={onConfirm} className={btnDanger}>
            Xoá đơn
          </button>
        </div>
      </div>
    </div>
  )
}
