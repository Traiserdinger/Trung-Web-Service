import type { ReactNode } from 'react'
import { materials, uiOptions, type MaterialId } from '../../config/pricingConfig'
import type { PrintSettings } from '../../utils/slicerEstimator'

interface Props {
  value: PrintSettings
  onChange(s: PrintSettings): void
  /** Lý do tự bật support, ví dụ "Phát hiện ~3.0 cm² mặt treo" */
  supportReason: string | null
}

function Chip(p: { active: boolean; onClick(): void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={p.title}
      aria-pressed={p.active}
      onClick={p.onClick}
      className={`rounded-lg border px-3 py-1.5 text-sm transition ${
        p.active
          ? 'border-sky-600 bg-sky-600 text-white shadow-sm'
          : 'border-slate-300 bg-white text-slate-700 hover:border-sky-400'
      }`}
    >
      {p.children}
    </button>
  )
}

function Row(p: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{p.label}</div>
      <div className="flex flex-wrap gap-2">{p.children}</div>
    </div>
  )
}

export function OptionsPanel({ value, onChange, supportReason }: Props) {
  const set = (patch: Partial<PrintSettings>) => onChange({ ...value, ...patch })
  const { min, max } = uiOptions.quantity

  return (
    <div className="space-y-5">
      <Row label="Loại nhựa">
        {(Object.keys(materials) as MaterialId[]).map((id) => (
          <Chip key={id} active={value.material === id} onClick={() => set({ material: id })}>
            <span
              className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border border-slate-400 align-middle"
              style={{ backgroundColor: materials[id].color }}
            />
            {materials[id].label}
          </Chip>
        ))}
      </Row>

      <Row label="Chiều cao lớp">
        {uiOptions.layerHeights.map((l) => (
          <Chip key={l.value} active={value.layerHeight === l.value} onClick={() => set({ layerHeight: l.value })}>
            {l.value.toFixed(2)} mm · {l.label}
          </Chip>
        ))}
      </Row>

      <Row label="Độ điền đầy (Infill)">
        {uiOptions.infills.map((n) => (
          <Chip key={n} active={value.infillPercent === n} onClick={() => set({ infillPercent: n })}>
            {n}%
          </Chip>
        ))}
      </Row>

      <Row label="Số lớp tường">
        {uiOptions.wallLoops.map((n) => (
          <Chip key={n} active={value.wallLoops === n} onClick={() => set({ wallLoops: n })}>
            {n} tường
          </Chip>
        ))}
      </Row>

      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-sky-600"
            checked={value.support}
            onChange={(e) => set({ support: e.target.checked })}
          />
          <span>Mô hình có phần treo lơ lửng cần Support (+15% nhựa &amp; thời gian)</span>
        </label>
        {supportReason && <p className="pl-6 text-xs text-amber-700">{supportReason}</p>}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Số lượng</div>
        <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white">
          <button
            type="button"
            aria-label="Giảm số lượng"
            disabled={value.quantity <= min}
            onClick={() => value.quantity > min && set({ quantity: value.quantity - 1 })}
            className="px-3 py-1.5 text-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            −
          </button>
          <span className="w-12 text-center font-mono text-sm" aria-live="polite">
            {value.quantity}
          </span>
          <button
            type="button"
            aria-label="Tăng số lượng"
            disabled={value.quantity >= max}
            onClick={() => value.quantity < max && set({ quantity: value.quantity + 1 })}
            className="px-3 py-1.5 text-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}
