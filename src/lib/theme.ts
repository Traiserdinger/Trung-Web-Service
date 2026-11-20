import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'theme'
const THEME_COLOR: Record<Theme, string> = { light: '#F7F8F6', dark: '#101815' }

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  const t = document.documentElement.dataset.theme
  return t === 'dark' || t === 'light' ? t : readStored() ?? systemTheme()
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[t])
  window.dispatchEvent(new CustomEvent<Theme>('themechange', { detail: t }))
}

/** Theme hiện tại; tự cập nhật khi người dùng bấm nút hoặc khi hệ điều hành đổi (nếu chưa chọn tay). */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(currentTheme)

  useEffect(() => {
    const onChange = (e: Event) => setThemeState((e as CustomEvent<Theme>).detail)
    window.addEventListener('themechange', onChange)
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onSystem = () => {
      if (!readStored()) apply(systemTheme())
    }
    mql?.addEventListener('change', onSystem)
    return () => {
      window.removeEventListener('themechange', onChange)
      mql?.removeEventListener('change', onSystem)
    }
  }, [])

  const setTheme = (t: Theme) => {
    try {
      localStorage.setItem(KEY, t)
    } catch {
      // chế độ riêng tư: vẫn đổi được, chỉ không nhớ
    }
    apply(t)
  }
  return [theme, setTheme]
}
