import { createContext, useCallback, useContext } from 'react'
import { SESSION_EXPIRED } from './adminApi.ts'

// AdminApp cung cấp hàm này để trang con báo phiên hết hạn và quay về màn hình đăng nhập.
export const SessionExpiredContext = createContext<(() => void) | null>(null)

// Trả về hàm xử lý lỗi: SESSION_EXPIRED → báo AdminApp; lỗi khác → hiện qua setError.
export function useFail(setError: (msg: string) => void) {
  const expire = useContext(SessionExpiredContext)
  return useCallback(
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === SESSION_EXPIRED && expire) expire()
      else setError(msg)
    },
    [expire, setError],
  )
}
