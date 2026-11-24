import type { ReactNode } from 'react'
import { ThemeToggle } from '../components/site/ThemeToggle.tsx'
import { ChipGlyph } from '../components/site/Wordmark.tsx'
import { useStats } from './statsContext.ts'
import { IconLogout, IconOrders, IconOverview, IconSpool } from './ui/icons.tsx'

export type Section = 'overview' | 'orders' | 'colors'

const LINKS = [
  { id: 'overview', href: '#/', label: 'Tổng quan', Icon: IconOverview },
  { id: 'orders', href: '#/orders', label: 'Đơn hàng', Icon: IconOrders },
  { id: 'colors', href: '#/colors', label: 'Màu nhựa', Icon: IconSpool },
] as const

export function Brand() {
  return (
    <a href="#/" className="flex items-center gap-2.5 rounded-lg" aria-label="Đức Trung, quản trị, về Tổng quan">
      <ChipGlyph />
      <span className="leading-tight">
        <span className="block font-display text-[18px] font-bold tracking-[-0.02em]">Đức Trung</span>
        <span className="block text-[12px] text-slate">Quản trị</span>
      </span>
    </a>
  )
}

/**
 * Một cây DOM cho cả hai cỡ màn hình. Máy tính: menu trái 240px.
 * Điện thoại: logo và nút ở thanh trên, menu thành thanh tab cố định dưới đáy.
 */
export function Shell({ section, onLogout, children }: { section: Section; onLogout: () => void; children: ReactNode }) {
  const attention = useStats()?.stats?.attention.length ?? 0
  return (
    <div className="min-h-screen bg-studio text-ink md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-mist bg-studio px-4 py-2.5 md:h-screen md:flex-col md:items-stretch md:justify-start md:border-r md:border-b-0 md:px-5 md:py-6">
        <Brand />
        <nav
          aria-label="Mục quản trị"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-mist bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:static md:mt-10 md:flex-1 md:border-0 md:bg-transparent md:pb-0 md:backdrop-blur-none"
        >
          <ul className="grid grid-cols-3 md:block md:space-y-1">
            {LINKS.map(({ id, href, label, Icon }) => {
              const active = section === id
              return (
                <li key={id}>
                  <a
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`relative flex flex-col items-center gap-1 px-2 pt-2.5 pb-2 text-[12px] transition-colors md:flex-row md:gap-3 md:rounded-[10px] md:px-3 md:py-2.5 md:text-[15px] ${
                      active ? 'font-semibold text-solder md:bg-solder-tint' : 'text-slate hover:text-ink md:hover:bg-fog'
                    }`}
                  >
                    <Icon />
                    <span>{label}</span>
                    {id === 'orders' && attention > 0 && (
                      <span
                        className="tnum absolute top-1.5 left-[calc(50%+6px)] inline-flex items-center gap-1 rounded-full bg-paper px-1.5 text-[12px] font-semibold text-ink md:static md:ml-auto md:bg-transparent md:px-0"
                      >
                        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-enig" />
                        {attention}
                        <span className="sr-only"> đơn cần xử lý</span>
                      </span>
                    )}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="flex items-center gap-2 md:border-t md:border-mist md:pt-5">
          <ThemeToggle />
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-[14px] text-slate ring-1 ring-mist transition-colors hover:text-ink hover:ring-ink"
          >
            <IconLogout className="h-[18px] w-[18px]" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-28 sm:px-6 md:mx-0 md:px-10 md:pt-12 md:pb-16">{children}</main>
    </div>
  )
}
