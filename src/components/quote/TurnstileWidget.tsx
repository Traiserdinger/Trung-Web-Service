import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: Record<string, unknown>): string
      reset(id: string): void
      remove(id: string): void
    }
  }
}

export interface TurnstileHandle {
  /** Token Turnstile chỉ dùng được một lần: gọi sau mỗi lần gửi để lấy token mới */
  reset(): void
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
  return new Promise((resolve, reject) => {
    const s = existing ?? document.createElement('script')
    s.addEventListener('load', () => resolve())
    s.addEventListener('error', () => reject(new Error('turnstile')))
    if (!existing) {
      s.src = SCRIPT_SRC
      s.async = true
      document.head.appendChild(s)
    }
  })
}

/** Cloudflare Turnstile chống spam. siteKey rỗng → không render gì. */
export const TurnstileWidget = forwardRef<TurnstileHandle, { siteKey: string; onToken(t: string | null): void }>(
  function TurnstileWidget({ siteKey, onToken }, ref) {
    const elRef = useRef<HTMLDivElement>(null)
    const widgetId = useRef<string | null>(null)

    useImperativeHandle(ref, () => ({
      reset() {
        onToken(null)
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
      },
    }))

    useEffect(() => {
      if (!siteKey || !elRef.current) return
      let cancelled = false
      loadScript()
        .then(() => {
          if (cancelled || !elRef.current || !window.turnstile) return
          widgetId.current = window.turnstile.render(elRef.current, {
            sitekey: siteKey,
            callback: (t: string) => onToken(t),
            'expired-callback': () => onToken(null),
            'error-callback': () => onToken(null),
          })
        })
        .catch(() => onToken(null))
      return () => {
        cancelled = true
        if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
        widgetId.current = null
      }
    }, [siteKey, onToken])

    if (!siteKey) return null
    return <div ref={elRef} />
  },
)
