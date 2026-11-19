import { FloatingZalo } from './components/layout/FloatingZalo'
import { SiteFooter } from './components/layout/SiteFooter'
import { Quote3DCalculator } from './components/quote/Quote3DCalculator'
import { Hero } from './components/site/Hero'
import { Nav } from './components/site/Nav'
import { Process } from './components/site/Process'
import { Projects } from './components/site/Projects'
import { Services } from './components/site/Services'
import { printerConfig } from './config/pricingConfig'

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
            <Quote3DCalculator />
          </div>
        </section>
        <Process />
      </main>
      <SiteFooter />
      <FloatingZalo />
    </div>
  )
}
