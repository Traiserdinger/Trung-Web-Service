import { processSteps } from '../../content/siteContent'

export function Process() {
  return (
    <section aria-labelledby="quy-trinh-title" className="mx-auto max-w-[1200px] px-4 py-24 sm:px-6 lg:py-28">
      <h2 id="quy-trinh-title" className="text-[clamp(32px,3.6vw,44px)] font-bold">
        Làm việc với mình
      </h2>
      <ol className="relative mt-12 grid gap-10 md:grid-cols-4 md:gap-6">
        {/* đường nối các bước */}
        <div className="absolute top-5 right-[12%] left-5 hidden h-px bg-mist md:block" aria-hidden="true" />
        {processSteps.map((s, i) => (
          <li key={s.title} className="relative">
            <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-mist bg-paper font-display text-[17px] font-bold text-solder tnum">
              {i + 1}
            </span>
            <h3 className="mt-5 font-sans text-[18px] font-semibold tracking-normal">{s.title}</h3>
            <p className="mt-2 max-w-[32ch] text-[15px] leading-[1.65] text-slate">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
