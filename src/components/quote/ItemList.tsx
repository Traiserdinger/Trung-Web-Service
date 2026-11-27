import { formatDims } from '../../utils/format'
import type { Dims } from '../../utils/meshAnalysis'
import type { ItemSettings } from '../../utils/slicerEstimator'

export interface ItemRow {
  id: string
  name: string
  dims: Dims
  settings: ItemSettings
  /** Món vượt khổ hoặc có bản chưa xếp được lên bàn */
  warn?: boolean
}

interface Props {
  items: ItemRow[]
  selectedId: string | null
  onSelect(id: string): void
  onRemove(id: string): void
  disabled?: boolean
}

/** Danh sách món trên bàn in (chỉ hiện khi có từ 2 món). Bấm một dòng để chọn món đó. */
export function ItemList({ items, selectedId, onSelect, onRemove, disabled }: Props) {
  return (
    <div>
      <div aria-hidden="true" className="text-[14px] font-semibold text-ink">
        Danh sách món <span className="font-normal text-slate tnum">({items.length})</span>
      </div>
      <ul aria-label="Danh sách món" className="mt-2.5 space-y-1.5">
        {items.map((it, i) => {
          const active = it.id === selectedId
          return (
            <li
              key={it.id}
              className={`flex items-center gap-2 rounded-[12px] border bg-paper pr-1.5 transition-colors ${
                active ? 'border-ink' : 'border-mist hover:border-slate'
              }`}
            >
              <button
                type="button"
                aria-pressed={active}
                aria-label={it.name}
                onClick={() => onSelect(it.id)}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
              >
                <span
                  aria-hidden="true"
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tnum ${
                    active ? 'bg-ink text-on-ink' : 'bg-fog text-slate'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[14px] font-semibold ${it.warn ? 'text-alert' : 'text-ink'}`}>{it.name}</span>
                  <span className="block truncate text-[12px] text-slate tnum">
                    {formatDims(it.dims)} · SL {it.settings.quantity} · Đặc {it.settings.infillPercent}% · Vỏ {it.settings.wallLoops}
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-label={`Xoá ${it.name}`}
                title="Xoá món này"
                disabled={disabled}
                onClick={() => onRemove(it.id)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[18px] text-slate transition-colors hover:bg-fog hover:text-alert disabled:opacity-40"
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
