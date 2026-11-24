import type { ReactNode } from 'react'

export function PageHeader({ title, lead, aside }: { title: ReactNode; lead?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[36px] font-bold tracking-[-0.03em] [font-variation-settings:'opsz'_96] sm:text-[48px]">{title}</h1>
        {lead && <p className="mt-2 text-[16px] text-slate">{lead}</p>}
      </div>
      {aside}
    </header>
  )
}
