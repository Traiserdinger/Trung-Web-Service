import { afterEach, expect, it, vi } from 'vitest'
import { checkSession, listOrders, logout, requestCode, SESSION_EXPIRED, setStatus, verifyCode } from './adminApi.ts'

afterEach(() => vi.unstubAllGlobals())

it('401 → lỗi SESSION_EXPIRED', async () => {
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

it('requestCode POST /api/auth/request-code, trả message server', async () => {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, message: 'Đã gửi mã nếu email hợp lệ' }), { status: 200 }))
  vi.stubGlobal('fetch', f)
  await expect(requestCode()).resolves.toBe('Đã gửi mã nếu email hợp lệ')
  expect(f.mock.calls[0][0]).toBe('/api/auth/request-code')
  expect(f.mock.calls[0][1].method).toBe('POST')
})

it('requestCode 429 → ném đúng chữ server', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'Bạn đã yêu cầu quá nhiều mã, thử lại sau 10 phút' }), { status: 429 })))
  await expect(requestCode()).rejects.toThrow('Bạn đã yêu cầu quá nhiều mã, thử lại sau 10 phút')
})

it('verifyCode POST /api/auth/verify body {code}; 401 → ném chữ server (không phải SESSION_EXPIRED)', async () => {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'Mã không đúng hoặc đã hết hạn' }), { status: 401 }))
  vi.stubGlobal('fetch', f)
  await expect(verifyCode('123456')).rejects.toThrow('Mã không đúng hoặc đã hết hạn')
  expect(f.mock.calls[0][0]).toBe('/api/auth/verify')
  expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ code: '123456' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'Thử quá nhiều lần' }), { status: 429 })))
  await expect(verifyCode('1')).rejects.toThrow('Thử quá nhiều lần')
})

it('verifyCode thành công → resolve', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })))
  await expect(verifyCode('123456')).resolves.toBeUndefined()
})

it('logout POST /api/auth/logout', async () => {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  vi.stubGlobal('fetch', f)
  await logout()
  expect(f.mock.calls[0][0]).toBe('/api/auth/logout')
  expect(f.mock.calls[0][1].method).toBe('POST')
})

it('checkSession: 200 → true, 401 → false, lỗi mạng → false', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })))
  await expect(checkSession()).resolves.toBe(true)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
  await expect(checkSession()).resolves.toBe(false)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')))
  await expect(checkSession()).resolves.toBe(false)
})
