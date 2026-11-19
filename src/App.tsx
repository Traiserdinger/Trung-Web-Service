import { FloatingZalo } from './components/layout/FloatingZalo'
import { SiteFooter } from './components/layout/SiteFooter'
import { SiteHeader } from './components/layout/SiteHeader'
import { Quote3DCalculator } from './components/quote/Quote3DCalculator'

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <SiteHeader />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <Quote3DCalculator />
        </div>
      </main>
      <SiteFooter />
      <FloatingZalo />
    </div>
  )
}
