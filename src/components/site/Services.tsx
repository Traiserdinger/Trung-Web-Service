import { contactConfig } from '../../config/contactConfig'
import { serviceAddOns, serviceTiers } from '../../content/siteContent'
import { TierGlyph } from './TierGlyph'

// Bậc thang: gói sau cao hơn gói trước trên màn rộng
const STEP_OFFSET = ['lg:mt-36', 'lg:mt-24', 'lg:mt-12', 'lg:mt-0']

export function Services() {
  return (
    <section id="goi-dich-vu" aria-labelledby="goi-title" className="border-y border-mist bg-paper">
      <div className="mx-auto max-w-[1200px] px-4 py-24 sm:px-6 lg:py-32">
        <div className="grid grid-cols-12 gap-x-6">
          <div className="col-span-12 lg:col-span-6">
            <h2 id="goi-title" className="text-[clamp(36px,4.4vw,56px)] font-bold">
              Chọn mức bàn giao
            </h2>
            <p className="mt-4 max-w-[48ch] text-[18px] leading-[1.65] text-slate">
              Mỗi gói gồm trọn gói trước nó. Bạn dừng ở bậc nào cũng được, file gốc luôn thuộc về bạn.
            </p>
          </div>
        </div>

        <ol className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:items-start">
          {serviceTiers.map((t, i) => {
            const level = (i + 1) as 1 | 2 | 3 | 4
            const dark = t.combo
            return (
              <li
                key={t.name}
                className={`relative flex flex-col rounded-[22px] p-6 ${STEP_OFFSET[i]} ${
                  dark
                    ? 'bg-solder text-white shadow-[0_30px_60px_-30px_rgb(18_112_74/0.65)]'
                    : t.recommended
                      ? 'bg-solder-tint ring-1 ring-solder/25'
                      : 'bg-studio ring-1 ring-mist'
                }`}
              >
                {t.recommended && (
                  <span className="absolute -top-3 left-6 rounded-full bg-ink px-3 py-1 text-[12px] font-semibold text-white">
                    Khuyên dùng
                  </span>
                )}
                <div className={`flex justify-center rounded-[16px] py-3 ${dark ? 'bg-white/95' : 'bg-paper'}`}>
                  <TierGlyph level={level} />
                </div>
                <div className={`mt-6 text-[14px] font-semibold ${dark ? 'text-white/80' : 'text-solder'}`}>
                  Gói {level}
                </div>
                <h3 className="mt-1 text-[24px] font-bold">{t.name}</h3>
                <p className={`mt-3 text-[15px] leading-[1.65] ${dark ? 'text-white/90' : 'text-slate'}`}>
                  {i > 0 && <span className={`font-semibold ${dark ? 'text-white' : 'text-ink'}`}>Thêm: </span>}
                  {t.adds}
                </p>
                <p
                  className={`mt-5 border-t pt-4 text-[14px] font-semibold ${
                    dark ? 'border-white/25 text-white' : 'border-mist text-ink'
                  }`}
                >
                  {t.price}
                </p>
              </li>
            )
          })}
        </ol>

        <div className="mt-14 flex flex-col gap-5 border-t border-mist pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[60ch] text-[16px] text-slate">{serviceAddOns}</p>
          <a
            href={contactConfig.zaloUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 self-start rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-solder sm:self-auto"
          >
            Gửi yêu cầu thiết kế qua Zalo
          </a>
        </div>
      </div>
    </section>
  )
}
