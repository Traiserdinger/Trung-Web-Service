import { afterEach, expect, it, vi } from 'vitest'
import { listOrders, SESSION_EXPIRED, setStatus } from './adminApi.ts'

afterEach(() => vi.unstubAllGlobals())

it('401 → lỗi "Phiên đăng nhập hết hạn, tải lại trang"', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
  await expect(listOrders({ status: '', q: '', page: 1 })).rejects.toThrow(SESSION_EXPIRED)
})

it('fetch ném lỗi (Access chuyển hướng khác origin) → báo phiên hết hạn', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  await expect(listOrders({ status: '', q: '', page: 1 })).rejects.toThrow(SESSION_EXPIRED)
})

it('phản hồi bị chuyển hướng (redirected / opaqueredirect) → báo phiên hết hạn', async () => {
  const res = new Response('<html>login</html>', { status: 200 })
  Object.defineProperty(res, 'redirected', { value: true })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res))
  await expect(listOrders({ status: '', q: '', page: 1 })).rejects.toThrow(SESSION_EXPIRED)
  const opaque = new Response('', { status: 200 })
  Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(opaque))
  await expect(listOrders({ status: '', q: '', page: 1 })).rejects.toThrow(SESSION_EXPIRED)
})

it('gọi cùng origin với credentials same-origin và body JSON', async () => {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, event: { id: 1 } }), { status: 200 }))
  vi.stubGlobal('fetch', f)
  await setStatus('P3D-1', 'shipping', 'GHN 123')
  expect(f).toHaveBeenCalledWith('/api/orders/P3D-1/status', expect.objectContaining({
    method: 'POST', credentials: 'same-origin', body: JSON.stringify({ status: 'shipping', note: 'GHN 123' }),
  }))
})
