import { lazy, Suspense, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { px4Revisions, type BoardRevision, type Project } from '../../content/siteContent'

const PcbModelViewer = lazy(() => import('./PcbModelViewer'))

type View = 'render' | 'layers' | 'model'

const VIEWS: { id: View; label: string }[] = [
  { id: 'render', label: 'Ảnh render' },
  { id: 'layers', label: 'Lớp đồng' },
  { id: 'model', label: 'Mô hình 3D' },
]

/** Màu lớp khi xem phim — cố định vì sân khấu lớp luôn nền tối */
const FILM: Record<string, string> = {
  signal: 'var(--film-signal)',
  ground: 'var(--film-ground)',
  power: 'var(--film-power)',
}

function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
  render,
}: {
  items: { id: T }[]
  value: T
  onChange: (v: T) => void
  label: string
  render: (id: T, active: boolean) => ReactNode
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-full bg-fog p-1">
      {items.map(({ id }) => {
        const active = id === value
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`rounded-full px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors sm:px-4 sm:text-[14px] ${
              active ? 'bg-paper font-semibold text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)]' : 'text-slate hover:text-ink'
            }`}
          >
            {render(id, active)}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Mặt cắt bo mạch dùng làm bộ chọn lớp: mỗi lớp đồng là một thanh, xen giữa là lớp điện môi.
 * Đúng thứ tự xếp chồng thật, từ Top xuống Bottom.
 */
function StackPicker({
  rev,
  active,
  onPick,
}: {
  rev: BoardRevision
  active: string | null
  onPick: (id: string) => void
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const n = (i + d + rev.layers.length) % rev.layers.length
    onPick(rev.layers[n].id)
    refs.current[n]?.focus()
  }
  const current = active ?? rev.layers[0].id
  return (
    <div role="radiogroup" aria-label={`Các lớp đồng của ${rev.label}, từ trên xuống`} className="mt-3">
      {rev.layers.map((l, i) => {
        const on = active === l.id
        return (
          <div key={l.id}>
            {i > 0 && <div className="mx-[14px] h-[7px] bg-[repeating-linear-gradient(90deg,var(--color-mist)_0_6px,transparent_6px_9px)] opacity-70" aria-hidden="true" />}
            <button
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={l.id === current ? 0 : -1}
              onClick={() => onPick(l.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`group grid w-full grid-cols-[2.25rem_1fr] items-center gap-x-3 rounded-[12px] px-[14px] py-2 text-left transition-colors ${
                on ? 'bg-fog' : 'hover:bg-fog/60'
              }`}
            >
              <span className="text-[13px] font-semibold text-slate tnum">L{i + 1}</span>
              <span className="min-w-0">
                <span
                  className={`block h-[5px] rounded-full transition-[opacity,transform] duration-300 ${on ? 'opacity-100' : 'opacity-45 group-hover:opacity-80'}`}
                  style={{ background: FILM[l.kind] }}
                  aria-hidden="true"
                />
                <span className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                  <span className={`text-[15px] ${on ? 'font-semibold text-ink' : 'text-ink'}`}>{l.name}</span>
                  <span className="text-[13px] leading-snug text-slate">{l.role}</span>
                </span>
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function RenderView({ rev }: { rev: BoardRevision }) {
  return (
    <div className="stage-dots relative h-full w-full">
      <img
        key={rev.render.src}
        src={rev.render.src}
        alt={rev.render.alt}
        className="absolute top-[14%] left-[5%] h-[70%] w-[78%] object-contain drop-shadow-[0_30px_30px_rgb(0_0_0/0.25)]"
      />
      {rev.inset && (
        <figure className="absolute right-4 bottom-4 w-[34%] max-w-[210px] rotate-[3deg] overflow-hidden rounded-[16px] bg-paper p-2 shadow-[0_24px_40px_-20px_rgb(0_0_0/0.5)] ring-1 ring-mist sm:right-6 sm:bottom-6">
          <img
            src={rev.inset.src}
            alt={rev.inset.alt}
            loading="lazy"
            className={`w-full rounded-[10px] ${rev.inset.fit === 'cover' ? 'aspect-[3/4] object-cover' : 'aspect-[4/3] object-contain'}`}
          />
          <figcaption className="px-1 pt-2 pb-0.5 text-[12px] text-slate">{rev.inset.caption}</figcaption>
        </figure>
      )}
    </div>
  )
}

function LayersView({ rev, layerId }: { rev: BoardRevision; layerId: string }) {
  const idx = Math.max(0, rev.layers.findIndex((l) => l.id === layerId))
  const layer = rev.layers[idx]
  return (
    <div className="relative h-full w-full bg-night [background-image:radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.06)_1px,transparent_0)] [background-size:22px_22px]">
      <div className="absolute top-[50%] left-1/2 aspect-square h-[58%] sm:top-[52%] sm:h-[68%] -translate-x-1/2 -translate-y-1/2">
        {/* nền FR4 của bo mạch */}
        <div className="absolute inset-0 bg-white/[0.035] ring-1 ring-white/15" style={{ borderRadius: rev.cornerRadius }} />
        {rev.layers.map((l) => (
          <div
            key={l.id}
            role="img"
            aria-label={`${rev.label}, lớp ${l.name}: ${l.role}`}
            aria-hidden={l.id !== layer.id}
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              opacity: l.id === layer.id ? 1 : 0,
              background: FILM[l.kind],
              maskImage: `url(${l.src})`,
              WebkitMaskImage: `url(${l.src})`,
              maskSize: '100% 100%',
              WebkitMaskSize: '100% 100%',
            }}
          />
        ))}
      </div>
      <div className="absolute bottom-4 left-4 rounded-[12px] bg-black/45 px-3 py-2 text-white backdrop-blur sm:bottom-6 sm:left-6">
        <div className="text-[12px] text-white/70">
          Lớp {idx + 1} trên {rev.layers.length}, nhìn từ mặt trên
        </div>
        <div className="text-[15px] font-semibold">{layer.name}</div>
      </div>
    </div>
  )
}

function ModelView({ rev, armed, onArm }: { rev: BoardRevision; armed: boolean; onArm: () => void }) {
  if (armed)
    return (
      <div className="stage-dots h-full w-full">
        <Suspense fallback={null}>
          <PcbModelViewer key={rev.model.src} src={rev.model.src} label={`Mô hình 3D xoay được của mạch PX4 ${rev.label}`} />
        </Suspense>
      </div>
    )
  return (
    <div className="stage-dots relative grid h-full w-full place-items-center">
      <img src={rev.render.src} alt="" className="absolute inset-0 m-auto h-[70%] w-[80%] object-contain opacity-25 blur-[2px]" />
      <div className="relative max-w-[300px] text-center">
        <button
          type="button"
          onClick={onArm}
          className="rounded-full bg-ink px-5 py-2.5 text-[15px] font-semibold text-on-ink transition-colors hover:bg-solder"
        >
          Tải mô hình 3D ({rev.model.sizeLabel})
        </button>
        <p className="mt-3 text-[13px] leading-[1.5] text-slate">
          Chuyển từ file STEP của mạch. Kéo để xoay, cuộn để phóng to.
        </p>
      </div>
    </div>
  )
}

export function Px4CaseStudy({ p }: { p: Project }) {
  const [revId, setRevId] = useState<BoardRevision['id']>('b')
  const [view, setView] = useState<View>('render')
  const [layerId, setLayerId] = useState<string | null>(null)
  /** Khách đã đồng ý tải mô hình 3D một lần thì đổi bản mạch không phải bấm lại */
  const [modelArmed, setModelArmed] = useState(false)
  const rev = px4Revisions.find((r) => r.id === revId)!
  const activeLayer = layerId && rev.layers.some((l) => l.id === layerId) ? layerId : rev.layers[0].id

  const pickLayer = (id: string) => {
    setLayerId(id)
    setView('layers')
  }

  return (
    <article className="grid grid-cols-12 items-start gap-x-6 gap-y-10 lg:gap-x-10">
      {/* Sân khấu: ảnh render, từng lớp, hoặc mô hình 3D */}
      <div className="col-span-12 lg:sticky lg:top-24 lg:col-span-7">
        <div className="relative aspect-square overflow-hidden rounded-[28px] shadow-[0_30px_60px_-40px_rgb(0_0_0/0.45)] ring-1 ring-mist sm:aspect-[5/4]">
          {view === 'render' && <RenderView rev={rev} />}
          {view === 'layers' && <LayersView rev={rev} layerId={activeLayer} />}
          {view === 'model' && <ModelView rev={rev} armed={modelArmed} onArm={() => setModelArmed(true)} />}
          <div className="absolute top-4 left-4 sm:top-6 sm:left-6">
            <Segmented
              items={VIEWS}
              value={view}
              onChange={setView}
              label="Cách xem mạch"
              render={(id) => VIEWS.find((v) => v.id === id)!.label}
            />
          </div>
        </div>
        {view === 'model' && modelArmed && rev.model.note && <p className="mt-3 text-[13px] text-slate">{rev.model.note}.</p>}
      </div>

      <div className="col-span-12 lg:col-span-5">
        <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-solder">
          <span className="h-1.5 w-1.5 rounded-full bg-solder" aria-hidden="true" />
          {p.tag}
        </span>
        <h3 className="mt-3 text-[clamp(28px,3.2vw,40px)] font-bold">{p.title}</h3>
        <p className="mt-4 max-w-[48ch] text-[17px] leading-[1.7] text-slate">{p.summary}</p>

        <div className="mt-7">
          <Segmented
            items={px4Revisions}
            value={revId}
            onChange={setRevId}
            label="Bản mạch"
            render={(id) => {
              const r = px4Revisions.find((x) => x.id === id)!
              return (
                <>
                  {r.label} <span className="text-slate tnum">{r.version}</span>
                </>
              )
            }}
          />
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-[14px]">
          <div>
            <dt className="text-slate">Phần mềm</dt>
            <dd className="mt-0.5 font-semibold">{rev.tool}</dd>
          </div>
          <div>
            <dt className="text-slate">Kích thước</dt>
            <dd className="mt-0.5 font-semibold tnum">{rev.size}</dd>
          </div>
          <div>
            <dt className="text-slate">Xếp lớp</dt>
            <dd className="mt-0.5 font-semibold">{rev.stackup}</dd>
          </div>
          <div>
            <dt className="text-slate">Tình trạng</dt>
            <dd className={`mt-0.5 font-semibold ${rev.built ? 'text-solder' : 'text-enig-ink'}`}>{rev.status}</dd>
          </div>
        </dl>

        <h4 className="mt-8 text-[15px] font-semibold">Các lớp đồng, từ trên xuống</h4>
        <StackPicker rev={rev} active={view === 'layers' ? activeLayer : null} onPick={pickLayer} />

        <h4 className="mt-8 text-[15px] font-semibold">{rev.id === 'b' ? 'Khác gì so với bản A' : 'Điểm chính'}</h4>
        <ul className="mt-3 space-y-2 text-[15px] leading-[1.6] text-slate">
          {rev.highlights.map((h) => (
            <li key={h} className="grid grid-cols-[14px_1fr] gap-2">
              <span className="mt-[0.6em] h-[5px] w-[5px] rounded-full bg-enig" aria-hidden="true" />
              {h}
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <a
            href={p.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-mist bg-paper px-4 py-2 text-[14px] font-semibold text-ink transition-colors hover:border-ink"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Xem file gốc trên GitHub
          </a>
        </div>
      </div>
    </article>
  )
}
