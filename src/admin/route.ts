import { useEffect, useState } from 'react'

export interface Route {
  path: string
  params: URLSearchParams
}

// Hash dạng "#/orders?status=paid". Không có hash: Tổng quan.
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  const [path, query = ''] = raw.split('?')
  return { path: path || '/', params: new URLSearchParams(query) }
}

export function useHashRoute(): Route & { raw: string } {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return { ...parseHash(hash), raw: hash }
}

export const ordersHref = (p: { status?: string; q?: string } = {}) => {
  const s = new URLSearchParams()
  if (p.status) s.set('status', p.status)
  if (p.q) s.set('q', p.q)
  const qs = s.toString()
  return `#/orders${qs ? `?${qs}` : ''}`
}

export const orderHref = (code: string) => `#/orders/${encodeURIComponent(code)}`
