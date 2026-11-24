import type { AdminColor } from '../adminApi.ts'
import { IconDown, IconUp } from '../ui/icons.tsx'
import { IsoSlab } from '../ui/IsoSlab.tsx'

interface Props {
  c: AdminColor
  first: boolean
  last: boolean
  onHex: (hex: string) => void
  onActive: (active: boolean) => void
  onMove: (dir: -1 | 1) => void
}

const arrowBtn =
  'grid h-9 w-9 place-items-center rounded-[10px] text-slate ring-1 ring-mist transition-colors hover:text-ink hover:ring-ink disabled:opacity-35 disabled:hover:text-slate disabled:hover:ring-mist'

/** Một mẫu nhựa: khối isometric tô màu thật, ô chọn màu, công tắc ẩn/hiện, nút đổi thứ tự. */
export function ColorItem({ c, first, last, onHex, onActive, onMove }: Props) {
  const on = c.active === 1
  return (
    <li className="flex flex-col border-b border-mist px-1 pt-4 pb-5 sm:border-r sm:px-5">
      <div className={`flex justify-center py-2 transition-opacity ${on ? '' : 'opacity-45'}`}>
        <IsoSlab size={92} height={22} color={c.hex} />
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold">{c.name}</p>
          <p className="tnum text-[13px] text-slate">{c.hex}</p>
        </div>
        <label className="relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full ring-1 ring-mist transition-colors hover:ring-ink" title="Đổi màu">
          <span aria-hidden="true" className="h-5 w-5 rounded-full ring-1 ring-inset ring-ink/15" style={{ backgroundColor: c.hex }} />
          <input
            type="color"
            value={c.hex}
            aria-label={`Màu ${c.name}`}
            onChange={(e) => onHex(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            role="switch"
            aria-label={`Hiện ${c.name} trên trang báo giá`}
            checked={on}
            onChange={(e) => onActive(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-6 w-10 rounded-full bg-mist transition-colors peer-checked:bg-solder-fill peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-solder after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-paper after:shadow-sm after:transition-transform peer-checked:after:translate-x-4"
          />
          <span className={`whitespace-nowrap ${on ? 'text-ink' : 'text-slate'}`}>{on ? 'Đang bật' : 'Đang ẩn'}</span>
        </label>
        <div className="flex gap-1.5">
          <button type="button" aria-label={`Đưa ${c.name} lên`} disabled={first} onClick={() => onMove(-1)} className={arrowBtn}>
            <IconUp />
          </button>
          <button type="button" aria-label={`Đưa ${c.name} xuống`} disabled={last} onClick={() => onMove(1)} className={arrowBtn}>
            <IconDown />
          </button>
        </div>
      </div>
    </li>
  )
}
