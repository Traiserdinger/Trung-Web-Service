import { useState } from 'react'

export function DeleteDialog({ code, onCancel, onConfirm }: { code: string; onCancel: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState('')
  return (
    <div role="dialog" aria-modal="true" aria-label="Xác nhận xoá đơn" className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md space-y-3 rounded-md bg-paper p-5">
        <h2 className="font-display text-xl font-bold">Xoá đơn rác</h2>
        <p>Xoá vĩnh viễn đơn này. Gõ lại mã đơn <strong className="tnum">{code}</strong> để xác nhận.</p>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Mã đơn xác nhận" className="w-full rounded-md bg-fog px-3 py-2" autoFocus />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 ring-1 ring-mist">Huỷ</button>
          <button type="button" disabled={typed !== code} onClick={onConfirm} className="rounded-md bg-alert px-4 py-2 text-white disabled:opacity-40">Xoá đơn</button>
        </div>
      </div>
    </div>
  )
}
