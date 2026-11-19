import { describe, expect, it } from 'vitest'
import type { OrderPayload } from '../utils/orderPayload'
import { OrderSubmitError, submitOrder, type Transport } from './submitOrder'

const payload = { orderCode: 'P3D-261120-AAAA' } as OrderPayload
const reply = (body: unknown): Transport => async () => JSON.stringify(body)

describe('submitOrder', () => {
  it('resolves with the order code on ok', async () => {
    await expect(
      submitOrder(payload, { url: 'https://x', transport: reply({ ok: true, orderCode: 'P3D-261120-AAAA' }) }),
    ).resolves.toEqual({ orderCode: 'P3D-261120-AAAA' })
  })

  it('throws the server error message on ok:false', async () => {
    const p = submitOrder(payload, { url: 'https://x', transport: reply({ ok: false, error: 'Quá nhiều đơn' }) })
    await expect(p).rejects.toBeInstanceOf(OrderSubmitError)
    await expect(p).rejects.toThrow('Quá nhiều đơn')
  })

  it('throws a network message when the transport fails', async () => {
    const failing: Transport = async () => {
      throw new Error('offline')
    }
    await expect(submitOrder(payload, { url: 'https://x', transport: failing })).rejects.toThrow(/^Không gửi được/)
  })

  it('throws a network message on broken JSON', async () => {
    const broken: Transport = async () => '<html>'
    await expect(submitOrder(payload, { url: 'https://x', transport: broken })).rejects.toThrow(/^Không gửi được/)
  })

  it('refuses when no receiver URL is configured', async () => {
    await expect(submitOrder(payload, { url: '', transport: reply({ ok: true }) })).rejects.toThrow(
      'Chưa cấu hình nơi nhận đơn',
    )
  })
})
