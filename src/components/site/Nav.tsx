import { useEffect, useState } from 'react'
import { contactConfig } from '../../config/contactConfig'
import { useTheme } from '../../lib/theme'
import { Wordmark } from './Wordmark'

const LINKS = [
  { href: '#du-an', label: 'Dự án' },
  { href: '#goi-dich-vu', label: 'Gói dịch vụ' },
  { href: '#bao-gia', label: 'Báo giá in 3D' },
  { href: '#lien-he', label: 'Liên hệ' },
]

function ThemeToggle() {
  const [theme, setTheme] = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      title={dark ? 'Giao diện sáng' : 'Giao diện tối'}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate ring-1 ring-mist transition-colors hover:text-ink hover:ring-ink"
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  )
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-40 transition-[background-color,border-color] duration-300 ${
        scrolled ? 'border-b border-mist bg-studio/85 backdrop-blur-md' : 'border-b border-transparent bg-studio'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-6 px-4 sm:px-6">
        <Wordmark />
        <nav aria-label="Mục chính" className="hidden md:block">
          <ul className="flex items-center gap-1 text-[15px]">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="rounded-lg px-3 py-2 text-slate transition-colors hover:text-ink">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href={contactConfig.zaloUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-ink px-4 py-2 text-[14px] font-semibold whitespace-nowrap text-on-ink transition-colors hover:bg-solder"
          >
            Nhắn Zalo
          </a>
        </div>
      </div>
    </header>
  )
}
