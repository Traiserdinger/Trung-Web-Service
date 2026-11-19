import { contactConfig } from '../../config/contactConfig'
import { printerConfig } from '../../config/pricingConfig'

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="text-xs font-semibold tracking-widest text-sky-700 uppercase">{contactConfig.name}</div>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Báo giá in 3D tức thì</h1>
        <p className="mt-1 text-sm text-slate-600">
          Thiết kế mạch (Altium/Allegro) · Gia công PCB · In 3D vỏ hộp khớp mạch — máy {printerConfig.name}, khổ{' '}
          {printerConfig.bed.x}×{printerConfig.bed.y}×{printerConfig.bed.z} mm.
        </p>
      </div>
    </header>
  )
}
