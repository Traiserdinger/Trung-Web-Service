import { projects, type Project } from '../../content/siteContent'

function RepoLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-full border border-mist bg-paper px-4 py-2 text-[14px] font-semibold text-ink transition-colors hover:border-ink"
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
      Xem mã nguồn trên GitHub
    </a>
  )
}

function Facts({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 flex flex-wrap gap-2" aria-label="Công nghệ">
      {items.map((f) => (
        <li key={f} className="rounded-full bg-fog px-3 py-1 text-[13px] font-medium text-ink">
          {f}
        </li>
      ))}
    </ul>
  )
}

function Tag({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-solder">
      <span className="h-1.5 w-1.5 rounded-full bg-solder" aria-hidden="true" />
      {children}
    </span>
  )
}

function Featured({ p }: { p: Project }) {
  const [render, photo] = p.images
  return (
    <article className="grid grid-cols-12 items-center gap-x-6 gap-y-10">
      <div className="relative col-span-12 lg:col-span-7">
        <figure className="overflow-hidden rounded-[28px] bg-paper p-6 shadow-[0_30px_60px_-40px_rgb(27_36_32/0.45)] ring-1 ring-mist sm:p-10">
          <img src={render.src} alt={render.alt} loading="lazy" className="mx-auto aspect-square w-full max-w-[520px] object-contain" />
          <figcaption className="mt-4 text-[13px] text-slate">{render.caption}</figcaption>
        </figure>
        {photo && (
          <figure className="absolute -bottom-8 right-4 w-[38%] max-w-[230px] rotate-[3deg] overflow-hidden rounded-[18px] bg-paper p-2 shadow-[0_24px_40px_-20px_rgb(27_36_32/0.5)] ring-1 ring-mist sm:right-8">
            <img src={photo.src} alt={photo.alt} loading="lazy" className="aspect-[3/4] w-full rounded-[12px] object-cover" />
            <figcaption className="px-1 pt-2 pb-1 text-[12px] text-slate">{photo.caption}</figcaption>
          </figure>
        )}
      </div>
      <div className="col-span-12 lg:col-span-5 lg:pl-6">
        <Tag>{p.tag}</Tag>
        <h3 className="mt-3 text-[clamp(28px,3.2vw,40px)] font-bold">{p.title}</h3>
        <p className="mt-4 max-w-[46ch] text-[17px] leading-[1.7] text-slate">{p.summary}</p>
        <Facts items={p.facts} />
        <div className="mt-7">
          <RepoLink href={p.repoUrl} />
        </div>
      </div>
    </article>
  )
}

/** Sơ đồ vòng điều khiển bay — minh hoạ cho dự án chỉ có firmware */
function ControlLoopDiagram() {
  const box = 'fill-paper stroke-mist'
  return (
    <svg viewBox="0 0 420 230" className="h-auto w-full" role="img" aria-label="Sơ đồ vòng điều khiển: tay điều khiển, PID, trộn động cơ, cảm biến hồi tiếp">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="var(--color-slate)" />
        </marker>
      </defs>
      <g fontFamily="var(--font-sans)" fontSize="13" fill="var(--color-ink)">
        <rect x="10" y="40" width="88" height="44" rx="10" className={box} strokeWidth="1.5" />
        <text x="54" y="67" textAnchor="middle">i-Bus RC</text>
        <rect x="140" y="40" width="88" height="44" rx="10" fill="var(--color-solder)" />
        <text x="184" y="67" textAnchor="middle" fill="#fff" fontWeight="600">PID</text>
        <rect x="270" y="40" width="140" height="44" rx="10" className={box} strokeWidth="1.5" />
        <text x="340" y="67" textAnchor="middle">Trộn 4 động cơ</text>
        <rect x="120" y="150" width="200" height="56" rx="12" className={box} strokeWidth="1.5" />
        <text x="220" y="174" textAnchor="middle" fontWeight="600">Hợp nhất cảm biến</text>
        <text x="220" y="194" textAnchor="middle" fontSize="12" fill="var(--color-slate)">
          IMU, áp suất, GPS, optical flow
        </text>
      </g>
      <g stroke="var(--color-slate)" strokeWidth="1.5" fill="none">
        <path d="M98 62H138" markerEnd="url(#arr)" />
        <path d="M228 62H268" markerEnd="url(#arr)" />
        <path d="M340 84V178H322" markerEnd="url(#arr)" />
        <path d="M184 150V88" markerEnd="url(#arr)" />
      </g>
      <text x="192" y="124" fontFamily="var(--font-sans)" fontSize="12" fill="var(--color-slate)">
        hồi tiếp
      </text>
    </svg>
  )
}

function Secondary({ p, wide }: { p: Project; wide?: boolean }) {
  const img = p.images[0]
  return (
    <article className={`flex flex-col ${wide ? 'lg:col-span-7' : 'lg:col-span-5'} col-span-12`}>
      <figure
        className={`flex items-center justify-center overflow-hidden rounded-[24px] ring-1 ring-mist ${
          img ? 'bg-paper p-6' : 'stage-dots p-6 sm:p-10'
        } aspect-[4/3]`}
      >
        {img ? (
          <img src={img.src} alt={img.alt} loading="lazy" className="max-h-full w-auto object-contain" />
        ) : (
          <ControlLoopDiagram />
        )}
      </figure>
      <div className="mt-6">
        <Tag>{p.tag}</Tag>
        <h3 className="mt-2 text-[26px] font-bold">{p.title}</h3>
        <p className="mt-3 max-w-[52ch] text-[16px] leading-[1.7] text-slate">{p.summary}</p>
        <Facts items={p.facts} />
        <div className="mt-6">
          <RepoLink href={p.repoUrl} />
        </div>
      </div>
    </article>
  )
}

export function Projects() {
  const [featured, ...rest] = projects
  return (
    <section id="du-an" aria-labelledby="du-an-title" className="mx-auto max-w-[1200px] px-4 py-24 sm:px-6 lg:py-32">
      <div className="max-w-[640px]">
        <h2 id="du-an-title" className="text-[clamp(36px,4.4vw,56px)] font-bold">
          Dự án đã làm
        </h2>
        <p className="mt-4 text-[18px] leading-[1.65] text-slate">
          Từ bản vẽ trên Altium tới mạch thật trên bàn. Mỗi dự án đều để sẵn file gốc trên GitHub.
        </p>
      </div>
      <div className="mt-16">
        <Featured p={featured} />
      </div>
      <div className="mt-24 grid grid-cols-12 gap-x-6 gap-y-16 lg:gap-x-10">
        {rest.map((p, i) => (
          <Secondary key={p.id} p={p} wide={i === 0} />
        ))}
      </div>
    </section>
  )
}
