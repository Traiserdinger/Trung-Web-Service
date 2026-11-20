import { contactConfig } from '../../config/contactConfig'
import { contact } from '../../content/siteContent'
import { ChipGlyph } from '../site/Wordmark'

const formatPhone = (p: string) => p.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3')

export function SiteFooter() {
  const c = contactConfig
  return (
    <footer id="lien-he" className="on-dark bg-ink text-white">
      <div className="mx-auto max-w-[1200px] px-4 pt-24 pb-10 sm:px-6 lg:pt-32">
        <h2 className="max-w-[18ch] text-[clamp(36px,5vw,64px)] font-bold">{contact.title}</h2>
        <p className="mt-5 max-w-[52ch] text-[18px] leading-[1.65] text-white/70">{contact.body}</p>

        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href={c.zaloUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white px-6 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-solder-tint"
          >
            Nhắn Zalo {formatPhone(c.phone)}
          </a>
          <a
            href={`tel:${c.phone}`}
            className="rounded-full border border-white/25 px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:border-white"
          >
            Gọi điện
          </a>
          <a
            href={`mailto:${c.email}`}
            className="rounded-full border border-white/25 px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:border-white"
          >
            {c.email}
          </a>
        </div>

        <div className="mt-24 flex flex-col gap-4 border-t border-white/15 pt-8 text-[14px] text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ChipGlyph className="h-6 w-6" />
            <span>
              {c.name}. Thiết kế mạch, firmware và in 3D tại Việt Nam.
            </span>
          </div>
          <a href={c.githubUrl} target="_blank" rel="noreferrer" className="text-white/80 hover:text-white">
            GitHub của mình
          </a>
        </div>
      </div>
    </footer>
  )
}
