import { describe, expect, it, vi } from 'vitest'
import { createOrder } from './api'
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
