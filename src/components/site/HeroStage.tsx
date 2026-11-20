import { useEffect, useRef, useState } from 'react'
import { heroCallouts, projects } from '../../content/siteContent'
import type { EnclosureScene } from '../../three/enclosureScene'

const mq = (q: string) => typeof window !== 'undefined' && window.matchMedia?.(q).matches

export function HeroStage() {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<EnclosureScene | null>(null)
  const [exploded, setExploded] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const finePointer = mq('(pointer: fine)')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    // Tải three.js theo chunk riêng để chữ hero hiện ngay
    import('../../three/enclosureScene')
      .then(({ createEnclosureScene }) => {
        if (disposed) return
        try {
          sceneRef.current = createEnclosureScene(host, {
            reducedMotion: Boolean(mq('(prefers-reduced-motion: reduce)')),
            interactive: Boolean(mq('(pointer: fine)')),
            callouts: heroCallouts,
            onFirstAssembled: () => setReady(true),
          })
          if (mq('(prefers-reduced-motion: reduce)')) setReady(true)
        } catch {
          setFailed(true)
        }
      })
      .catch(() => setFailed(true))
    return () => {
      disposed = true
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [])

  const toggle = () => {
    const next = !exploded
    setExploded(next)
    sceneRef.current?.setExploded(next)
  }

  if (failed) {
    const img = projects[0].images[0]
    return (
      <div className="flex h-full items-center justify-center p-8">
        <img src={img.src} alt={img.alt} className="max-h-full rounded-3xl object-contain" />
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={hostRef}
        className={`absolute inset-0 ${finePointer ? 'cursor-grab active:cursor-grabbing' : ''}`}
        role="img"
        aria-label="Mô hình 3D: vỏ in 3D, mạch PCB và nắp mờ lắp khớp vào nhau"
      />
      <div
        className={`absolute bottom-4 left-4 flex items-center gap-3 transition-opacity duration-500 sm:bottom-6 sm:left-6 ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={toggle}
          // Ẩn trong lúc intro thì cũng không được bấm/tab tới
          disabled={!ready}
          aria-pressed={exploded}
          className="flex items-center gap-2 rounded-full border border-mist bg-paper/90 px-4 py-2 text-[14px] font-semibold text-ink shadow-[0_1px_0_rgb(27_36_32/0.04)] backdrop-blur transition-colors hover:border-solder hover:text-solder"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
            {exploded ? (
              <path d="M4 7h12M4 10h12M4 13h12" strokeLinecap="round" />
            ) : (
              <path d="M4 4h12M4 10h12M4 16h12" strokeLinecap="round" />
            )}
          </svg>
          {/* Tên cố định; trạng thái do aria-pressed và biểu tượng thể hiện */}
          Tách lớp
        </button>
        {finePointer && <span className="hidden text-[13px] text-slate sm:inline">Kéo để xoay</span>}
      </div>
    </div>
  )
}
