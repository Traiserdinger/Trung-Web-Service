import { useState } from 'react'
import { IsoSlab } from '../ui/IsoSlab.tsx'
import { btnPrimary, inputCls } from '../ui/styles.ts'

const HEX_RE = /^#[0-9a-f]{6}$/i

/** Mẫu thêm màu mới: khối xem trước tô theo màu đang chọn. */
export function AddColorForm({ onAdd }: { onAdd: (name: string, hex: string) => Promise<boolean> }) {
  const [name, setName] = useState('')
  const [hex, setHex] = useState('#888888')
  const canAdd = name.trim().length >= 1 && name.trim().length <= 30 && HEX_RE.test(hex)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void onAdd(name.trim(), hex).then((ok) => ok && setName(''))
  }

  return (
    <form onSubmit={submit} className="grid gap-6 rounded-[16px] border border-dashed border-mist p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-6">
      <div className="flex justify-center">
        <IsoSlab size={92} height={22} color={hex} />
      </div>
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-[21px] font-bold tracking-[-0.02em]">Thêm màu nhựa</h2>
          <p className="text-[14px] text-slate">Màu mới bật ngay và nằm cuối danh sách trên trang báo giá.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-0 flex-1 basis-48">
            <span className="text-[14px] font-semibold">Tên màu</span>
            <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Xanh rêu" className={`${inputCls} mt-1.5`} />
          </label>
          <div>
            <label htmlFor="new-color-hex" className="block text-[14px] font-semibold">
              Mã màu
            </label>
            <span className="mt-1.5 flex h-[46px] items-center gap-2 rounded-[10px] border border-mist bg-paper px-2 pr-3.5 focus-within:border-solder focus-within:ring-4 focus-within:ring-solder/15">
              <input id="new-color-hex" type="color" value={hex} onChange={(e) => setHex(e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />
              <span className="tnum text-[15px] text-slate">{hex}</span>
            </span>
          </div>
          <button type="submit" disabled={!canAdd} className={`${btnPrimary} h-[46px]`}>
            Thêm màu
          </button>
        </div>
      </div>
    </form>
  )
}
