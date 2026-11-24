import { useCallback, useEffect, useState } from 'react'
import { checkSession, logout } from './adminApi.ts'
import { ColorsPage } from './ColorsPage.tsx'
import { LoginPage } from './LoginPage.tsx'
import { OrderDetail } from './OrderDetail.tsx'
import { OrdersList } from './OrdersList.tsx'
import { Overview } from './Overview.tsx'
import { useHashRoute } from './route.ts'
import { SessionExpiredContext } from './session.ts'
import { Shell, type Section } from './Shell.tsx'
import { StatsProvider } from './StatsProvider.tsx'

export function AdminApp() {
  const route = useHashRoute()
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

  const detail = /^\/orders\/([^/]+)$/.exec(route.path)
  let section: Section = 'overview'
  let page = <Overview />
  if (route.path === '/colors') {
    section = 'colors'
    page = <ColorsPage />
  } else if (detail) {
    section = 'orders'
    page = <OrderDetail code={decodeURIComponent(detail[1])} />
  } else if (route.path === '/orders') {
    section = 'orders'
    const status = route.params.get('status') ?? ''
    const q = route.params.get('q') ?? ''
    // key theo hash: bấm khối dây chuyền hoặc tìm ở Tổng quan thì mở danh sách với bộ lọc mới
    page = <OrdersList key={route.raw} initialStatus={status} initialQuery={q} />
  }
  return (
    <SessionExpiredContext.Provider value={expire}>
      <StatsProvider>
        <Shell section={section} onLogout={doLogout}>
          {page}
        </Shell>
      </StatsProvider>
    </SessionExpiredContext.Provider>
  )
}
