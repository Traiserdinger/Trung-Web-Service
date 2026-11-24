import { afterEach, expect, it, vi } from 'vitest'
import { listOrders, SESSION_EXPIRED, setStatus } from './adminApi.ts'

afterEach(() => vi.unstubAllGlobals())

it('401 → lỗi "Phiên đăng nhập hết hạn, tải lại trang"', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
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
