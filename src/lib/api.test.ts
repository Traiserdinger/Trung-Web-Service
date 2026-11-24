import { describe, expect, it, vi } from 'vitest'
import { createOrder, trackOrder } from './api'
import { OrderSubmitError } from './submitOrder'
import type { OrderMeta } from '../utils/orderPayload'

const meta = { orderCode: 'P3D-261120-AAAA', colorId: 3 } as OrderMeta
const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body)))

describe('createOrder', () => {
  it('POSTs JSON to /api/orders and returns the server fields', async () => {
    const fetchFn = reply({ ok: true, orderCode: 'P3D-261120-AAAA', uploadTicket: 't', trackUrl: 'https://x/tra-cuu?ma=P3D-261120-AAAA' })
    await expect(createOrder(meta, fetchFn as unknown as typeof fetch)).resolves.toEqual({
      orderCode: 'P3D-261120-AAAA',
      uploadTicket: 't',
      trackUrl: 'https://x/tra-cuu?ma=P3D-261120-AAAA',
    })
    expect(fetchFn).toHaveBeenCalledWith('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meta),
    })
  })

  it('throws OrderSubmitError with the server message on ok:false', async () => {
    const p = createOrder(meta, reply({ ok: false, error: 'Quá nhiều đơn' }) as unknown as typeof fetch)
    await expect(p).rejects.toBeInstanceOf(OrderSubmitError)
    await expect(p).rejects.toThrow('Quá nhiều đơn')
  })

  it('throws the network message when fetch fails or reply is not JSON', async () => {
    const down = vi.fn(async () => {
      throw new Error('offline')
    })
    await expect(createOrder(meta, down as unknown as typeof fetch)).rejects.toThrow('Không gửi được, kiểm tra mạng và thử lại')
    const html = vi.fn(async () => new Response('<html>'))
    await expect(createOrder(meta, html as unknown as typeof fetch)).rejects.toThrow('Không gửi được, kiểm tra mạng và thử lại')
  })
})

describe('trackOrder', () => {
  it('POSTs code and phone and returns the order', async () => {
    const order = { code: 'P3D-241124-AB12' }
    const f = reply({ ok: true, order })
    await expect(trackOrder('P3D-241124-AB12', '0913', f as unknown as typeof fetch)).resolves.toEqual({ ok: true, order })
    expect(f).toHaveBeenCalledWith('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'P3D-241124-AB12', phone: '0913' }),
    })
  })
  it('returns server error, and the network message when fetch throws', async () => {
    await expect(trackOrder('a', 'b', reply({ ok: false, error: 'Sai' }) as unknown as typeof fetch)).resolves.toEqual({ ok: false, error: 'Sai' })
    const boom = vi.fn(async () => Promise.reject(new Error('x')))
    await expect(trackOrder('a', 'b', boom as unknown as typeof fetch)).resolves.toEqual({
      ok: false,
      error: 'Không gửi được, kiểm tra mạng và thử lại',
    })
  })
})
