import { hero, specs } from '../../content/siteContent'
import { HeroStage } from './HeroStage'

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden" aria-labelledby="hero-title">
      <div className="mx-auto grid max-w-[1200px] grid-cols-12 gap-x-6 px-4 sm:px-6">
        <div className="relative z-10 col-span-12 pt-10 sm:pt-14 lg:col-span-6 lg:pt-24 xl:col-span-5">
          <h1 id="hero-title" className="text-[clamp(44px,5.6vw,80px)] font-[760] text-ink">
            {hero.title}
          </h1>
          <p className="mt-6 max-w-[38ch] text-[18px] leading-[1.65] text-slate">{hero.lead}</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="#bao-gia"
              className="rounded-full bg-solder-fill px-6 py-3 text-[15px] font-semibold text-white shadow-[0_8px_24px_-10px_rgb(18_112_74/0.7)] transition-colors hover:bg-solder-deep"
            >
              {hero.primaryCta}
            </a>
            <a
              href="#du-an"
              className="rounded-full border border-mist bg-paper px-6 py-3 text-[15px] font-semibold text-ink transition-colors hover:border-ink"
            >
              {hero.secondaryCta}
            </a>
          </div>
        </div>

        {/* Sân khấu 3D tràn ra mép phải trên màn rộng */}
        <div className="col-span-12 h-[400px] sm:h-[520px] lg:col-span-6 lg:-mr-[max(24px,calc((100vw-1200px)/2+24px))] lg:h-[640px] xl:col-span-7">
          <HeroStage />
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <dl className="grid grid-cols-2 border-t border-mist lg:grid-cols-4">
          {specs.map((s, i) => (
            <div
              key={s.label}
              className={[
                'py-5 pr-4',
                i % 2 === 1 ? 'border-l border-mist pl-4' : '',
                i > 0 ? 'lg:border-l lg:border-mist lg:pl-6' : '',
                i >= 2 ? 'border-t border-mist lg:border-t-0' : '',
              ].join(' ')}
            >
              <dt className="text-[13px] text-slate">{s.label}</dt>
              <dd className="mt-1 text-[15px] font-semibold text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
