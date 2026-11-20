import { lazy, Suspense } from 'react'
import { FloatingZalo } from './components/layout/FloatingZalo'
import { SiteFooter } from './components/layout/SiteFooter'
import { Hero } from './components/site/Hero'
import { Nav } from './components/site/Nav'
import { Process } from './components/site/Process'
import { Projects } from './components/site/Projects'
import { Services } from './components/site/Services'
import { printerConfig } from './config/pricingConfig'

// three.js + bộ đọc STL chỉ tải khi tới phần báo giá, để chữ hero hiện ngay
const Quote3DCalculator = lazy(() =>
  import('./components/quote/Quote3DCalculator').then((m) => ({ default: m.Quote3DCalculator })),
)

function CalculatorFallback() {
  return (
    <div className="grid grid-cols-12 gap-8" aria-busy="true" aria-label="Đang tải phần báo giá">
      <div className="stage-dots col-span-12 h-[380px] animate-pulse rounded-[28px] ring-1 ring-mist sm:h-[520px] lg:col-span-7 lg:h-[600px]" />
      <div className="col-span-12 h-[420px] animate-pulse rounded-[22px] bg-fog lg:col-span-5" />
    </div>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-studio text-ink">
      <a
        href="#bao-gia"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Tới phần báo giá in 3D
      </a>
      <Nav />
      <main>
        <Hero />
        <Projects />
        <Services />
        <section id="bao-gia" aria-labelledby="bao-gia-title" className="mx-auto max-w-[1200px] px-4 py-24 sm:px-6 lg:py-32">
          <div className="max-w-[680px]">
            <h2 id="bao-gia-title" className="text-[clamp(36px,4.4vw,56px)] font-bold">
              Báo giá in 3D
            </h2>
            <p className="mt-4 text-[18px] leading-[1.65] text-slate">
              Thả file STL để xem mô hình trên bàn in {printerConfig.name} và giá tạm tính. File chỉ rời máy bạn khi
              bạn bấm gửi yêu cầu.
            </p>
          </div>
          <div className="mt-12">
            <Suspense fallback={<CalculatorFallback />}>
              <Quote3DCalculator />
            </Suspense>
          </div>
        </section>
        <Process />
      </main>
      <SiteFooter />
      <FloatingZalo />
    </div>
  )
}
