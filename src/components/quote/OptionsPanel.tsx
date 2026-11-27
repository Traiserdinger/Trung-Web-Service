import type { ReactNode } from 'react'
import { materials, uiOptions, type MaterialId } from '../../config/pricingConfig'
import type { ColorOption } from '../../config/colorConfig'
import type { PrintSettings } from '../../utils/slicerEstimator'

interface Props {
  value: PrintSettings
  onChange(s: PrintSettings): void
  /** Lý do tự bật support, ví dụ "Phát hiện ~3.0 cm² mặt treo" */
  supportReason: string | null
  /** Khoá khi đang gửi đơn, để màn hình luôn khớp với đơn đã gửi */
  disabled?: boolean
  colors: ColorOption[]
  colorId: number
  onColorChange(id: number): void
  /** Nhiều món: dòng ghi chú phía trên các thông số riêng của món đang chọn */
  itemCaption?: string | null
}

function Group({ label, children, id }: { label: string; children: ReactNode; id: string }) {
  return (
    <div role="group" aria-labelledby={id}>
      <div id={id} className="text-[14px] font-semibold text-ink">
        {label}
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

/** Nhóm nút chia đều, kiểu segmented control */
function Segmented<T extends string | number>(p: {
  options: { value: T; label: ReactNode }[]
  value: T
  onSelect(v: T): void
}) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-[12px] bg-fog p-1">
      {p.options.map((o) => {
        const active = o.value === p.value
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => p.onSelect(o.value)}
            className={`rounded-[9px] px-2 py-2 text-center text-[14px] leading-tight transition-[background-color,color,box-shadow] ${
              active
                ? 'bg-paper font-semibold text-ink shadow-[0_1px_2px_rgb(27_36_32/0.12),0_0_0_1px_rgb(27_36_32/0.06)]'
                : 'text-slate hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function OptionsPanel({ value, onChange, supportReason, disabled, colors, colorId, onColorChange, itemCaption }: Props) {
  const set = (patch: Partial<PrintSettings>) => onChange({ ...value, ...patch })
  const { min, max } = uiOptions.quantity

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-6 disabled:opacity-60">
      <Group label="Nhựa" id="opt-material">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
          {(Object.keys(materials) as MaterialId[]).map((id) => {
            const m = materials[id]
            const active = value.material === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => set({ material: id })}
                className={`flex items-center gap-2.5 rounded-[12px] border px-3 py-2.5 text-left transition-colors ${
                  active ? 'border-ink bg-paper' : 'border-mist bg-paper hover:border-slate'
                }`}
              >
                {/* cuộn nhựa nhìn nghiêng */}
                <span
                  className="relative h-7 w-7 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ background: `radial-gradient(circle at 50% 50%, #fff 0 22%, ${m.color} 23% 100%)` }}
                  aria-hidden="true"
                />
                <span className="leading-tight">
                  <span className="block text-[14px] font-semibold text-ink">{m.label}</span>
                  <span className={`block text-[12px] ${m.contactOnly ? 'text-caution' : 'text-slate'}`}>
                    {m.contactOnly ? 'Liên hệ' : `${m.density} g/cm³`}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </Group>

      <Group label="Màu" id="opt-color">
        <div className="flex flex-wrap gap-2.5">
          {colors.map((c) => {
            const active = c.id === colorId
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                aria-label={c.name}
                title={c.name}
                onClick={() => onColorChange(c.id)}
                className={`h-9 w-9 shrink-0 rounded-full ring-1 ring-mist transition-shadow ${
                  active ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper' : 'hover:ring-slate'
                }`}
                style={{ background: c.hex }}
              />
            )
          })}
        </div>
        <p className="mt-2 text-[13px] text-slate">Màu: {colors.find((c) => c.id === colorId)?.name ?? '—'}</p>
      </Group>

      <Group label="Chiều cao lớp" id="opt-layer">
        <Segmented
          value={value.layerHeight}
          onSelect={(v) => set({ layerHeight: v })}
          options={uiOptions.layerHeights.map((l) => ({
            value: l.value,
            label: (
              <>
                <span className="block tnum">{l.value.toFixed(2)} mm</span>
                <span className="block text-[12px] font-normal text-slate">{l.label}</span>
              </>
            ),
          }))}
        />
      </Group>

      {itemCaption && (
        <p className="-mb-2 border-t border-dashed border-mist pt-5 text-[13px] font-semibold text-solder">{itemCaption}</p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Group label="Độ điền đầy" id="opt-infill">
          <Segmented
            value={value.infillPercent}
            onSelect={(v) => set({ infillPercent: v })}
            options={uiOptions.infills.map((n) => ({ value: n, label: <span className="tnum">{n}%</span> }))}
          />
        </Group>
        <Group label="Số lớp tường" id="opt-walls">
          <Segmented
            value={value.wallLoops}
            onSelect={(v) => set({ wallLoops: v })}
            options={uiOptions.wallLoops.map((n) => ({
              value: n,
              label: (
                <span className="tnum" aria-label={`${n} tường`}>
                  {n}
                </span>
              ),
            }))}
          />
        </Group>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <label className="flex max-w-[34ch] cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={value.support}
            onChange={(e) => set({ support: e.target.checked })}
          />
          <span
            aria-hidden="true"
            className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full bg-mist transition-colors peer-checked:bg-solder peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-solder after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-paper after:shadow after:transition-transform peer-checked:after:translate-x-4"
          />
          <span>
            <span className="block text-[14px] font-semibold text-ink">Cần support cho phần treo lơ lửng</span>
            <span className="block text-[13px] text-slate">Thêm 15% nhựa và thời gian in</span>
            {supportReason && <span className="mt-1 block text-[13px] font-medium text-caution">{supportReason}</span>}
          </span>
        </label>

        <div role="group" aria-labelledby="opt-qty">
          <div id="opt-qty" className="text-[14px] font-semibold text-ink">
            Số lượng
          </div>
          <div className="mt-2 inline-flex items-center rounded-full border border-mist bg-paper">
            <button
              type="button"
              aria-label="Giảm số lượng"
              disabled={value.quantity <= min}
              onClick={() => value.quantity > min && set({ quantity: value.quantity - 1 })}
              className="h-10 w-10 rounded-full text-[20px] text-ink hover:bg-fog disabled:opacity-35"
            >
              −
            </button>
            <span className="w-10 text-center text-[16px] font-semibold tnum" aria-live="polite">
              {value.quantity}
            </span>
            <button
              type="button"
              aria-label="Tăng số lượng"
              disabled={value.quantity >= max}
              onClick={() => value.quantity < max && set({ quantity: value.quantity + 1 })}
              className="h-10 w-10 rounded-full text-[20px] text-ink hover:bg-fog disabled:opacity-35"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </fieldset>
  )
}
