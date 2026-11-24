import { useCallback, useEffect, useState } from 'react'
import { checkSession, logout } from './adminApi.ts'
import { LoginPage } from './LoginPage.tsx'
import { SessionExpiredContext } from './session.ts'
import { ColorsPage } from './ColorsPage.tsx'
import { OrderDetail } from './OrderDetail.tsx'
import { OrdersList } from './OrdersList.tsx'

const useHash = () => {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash.replace(/^#/, '') || '/orders'
}

export function AdminApp() {
  const route = useHash()
  // null: đang kiểm tra phiên; false: cần đăng nhập; true: đã đăng nhập.
  const [authed, setAuthed] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    void checkSession().then((ok) => alive && setAuthed(ok))
    return () => {
      alive = false
    }
  }, [])
  const expire = useCallback(() => setAuthed(false), [])
  async function doLogout() {
    try {
      await logout()
    } catch {
      // lỗi mạng khi đăng xuất: vẫn về màn hình đăng nhập, cookie sẽ tự hết hạn
    } finally {
      setAuthed(false)
    }
  }
  if (authed === null) return <div className="min-h-screen bg-studio" />
  if (!authed) return <LoginPage onLoggedIn={() => setAuthed(true)} />
  const detail = /^\/orders\/([^/]+)$/.exec(route)
  const onColors = route === '/colors'
  const link = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? 'bg-fog text-ink' : 'text-slate hover:text-ink'}`
  return (
    <div className="min-h-screen bg-studio text-ink">
      <header className="flex flex-wrap items-center gap-4 border-b border-mist bg-paper px-4 py-3">
        <h1 className="font-display text-lg font-bold">Quản trị đơn in 3D</h1>
        <nav className="flex gap-1">
          <a href="#/orders" className={link(!onColors)}>Đơn hàng</a>
          <a href="#/colors" className={link(onColors)}>Màu</a>
        </nav>
        <button type="button" onClick={doLogout} className="ml-auto text-sm text-slate underline">Đăng xuất</button>
      </header>
      <SessionExpiredContext.Provider value={expire}>
        <main className="mx-auto max-w-5xl p-4">
          {onColors ? <ColorsPage /> : detail ? <OrderDetail code={decodeURIComponent(detail[1])} /> : <OrdersList />}
        </main>
      </SessionExpiredContext.Provider>
    </div>
  )
}
