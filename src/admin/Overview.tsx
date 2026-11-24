import { todayLabel } from './format.ts'
import { Attention } from './overview/Attention.tsx'
import { Datasheet } from './overview/Datasheet.tsx'
import { Pipeline } from './overview/Pipeline.tsx'
import { ordersHref } from './route.ts'
import { useStats } from './statsContext.ts'
import { PageHeader } from './ui/PageHeader.tsx'
import { SearchBox } from './ui/SearchBox.tsx'
import { alertCls, sectionTitle } from './ui/styles.ts'

export function Overview() {
  const ctx = useStats()
  const stats = ctx?.stats ?? null
  const cancelled = stats?.byStatus.cancelled ?? 0
  return (
    <div className="space-y-12">
      <PageHeader
        title="Tổng quan"
        lead={todayLabel()}
        aside={<SearchBox onSubmit={(q) => (window.location.hash = ordersHref({ q }))} />}
      />
      {ctx?.error && (
        <p role="alert" className={alertCls}>
          {ctx.error}
        </p>
      )}
      {stats ? (
        <>
          <section aria-labelledby="pipeline-title" className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 id="pipeline-title" className={sectionTitle}>
                Dây chuyền đơn
              </h2>
              <a
                href={ordersHref({ status: 'cancelled' })}
                className={`tnum text-[14px] hover:underline ${cancelled > 0 ? 'text-alert' : 'text-slate'}`}
              >
                Đã huỷ {cancelled}
              </a>
            </div>
            <Pipeline byStatus={stats.byStatus} />
            <Datasheet stats={stats} />
          </section>
          <Attention orders={stats.attention} />
        </>
      ) : (
        !ctx?.error && (
          <div role="status" className="h-[420px] animate-pulse rounded-[16px] bg-fog motion-reduce:animate-none">
            <span className="sr-only">Đang tải số liệu</span>
          </div>
        )
      )}
    </div>
  )
}
