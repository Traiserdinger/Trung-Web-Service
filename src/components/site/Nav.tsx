import { useEffect, useState } from 'react'
import { contactConfig } from '../../config/contactConfig'
import { ThemeToggle } from './ThemeToggle'
import { Wordmark } from './Wordmark'

const LINKS = [
  { href: '/#du-an', label: 'Dự án' },
  { href: '/#goi-dich-vu', label: 'Gói dịch vụ' },
  { href: '/#bao-gia', label: 'Báo giá in 3D' },
  { href: '/tra-cuu', label: 'Tra cứu đơn' },
  { href: '/#lien-he', label: 'Liên hệ' },
]

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
