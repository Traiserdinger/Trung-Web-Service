import { describe, expect, it, vi } from 'vitest'
import type { OrderPayload } from '../utils/orderPayload'
import { OrderSubmitError, submitOrder, type Transport } from './submitOrder'


const NET = 'Không gửi được, kiểm tra mạng và thử lại'
const payload = {
  orderCode: 'P3D-261120-AAAA',
  colorId: 3,
  fileName: 'a.stl',
  fileSize: 3,
  fileBase64: 'AQID',
  customer: { name: 'An', phone: '0913014605', email: '', note: '' },
} as OrderPayload & { colorId: number }
const created = (uploadTicket: string | null) =>
  vi.fn(async () =>
    new Response(JSON.stringify({ ok: true, orderCode: payload.orderCode, uploadTicket, trackUrl: '/tra-cuu?ma=P3D-261120-AAAA' })),
  ) as unknown as typeof fetch

describe('submitOrder', () => {
  it('có vé → transport được gọi với uploadTicket, không có customer trong body upload', async () => {
    const transport = vi.fn<Transport>(async () => JSON.stringify({ ok: true, orderCode: payload.orderCode }))
    const r = await submitOrder(payload, { url: 'https://x', transport, fetchFn: created('tk') })
    expect(r).toEqual({ orderCode: payload.orderCode, trackUrl: '/tra-cuu?ma=P3D-261120-AAAA', fileUploaded: true })
    const body = JSON.parse(transport.mock.calls[0][1])
    expect(body).toEqual({ orderCode: payload.orderCode, uploadTicket: 'tk', fileName: 'a.stl', fileSize: 3, fileBase64: 'AQID' })
    expect(body.customer).toBeUndefined()
  })

  it('transport reject → fileUploaded false, không ném', async () => {
    const transport: Transport = async () => {
      throw new Error('offline')
    }
    await expect(submitOrder(payload, { url: 'https://x', transport, fetchFn: created('tk') })).resolves.toMatchObject({
      fileUploaded: false,
    })
  })

  it('Apps Script trả ok:false hoặc JSON hỏng → fileUploaded false', async () => {
    for (const text of [JSON.stringify({ ok: false, error: 'x' }), '<html>']) {
      const transport: Transport = async () => text
      await expect(submitOrder(payload, { url: 'https://x', transport, fetchFn: created('tk') })).resolves.toMatchObject({
        fileUploaded: false,
      })
    }
  })

  it('vé null → transport không được gọi', async () => {
    const transport = vi.fn<Transport>()
    const r = await submitOrder(payload, { url: 'https://x', transport, fetchFn: created(null) })
    expect(transport).not.toHaveBeenCalled()
    expect(r.fileUploaded).toBe(false)
  })

  it('fileDelivery zalo → không upload, fileUploaded false', async () => {
    const transport = vi.fn<Transport>()
    await submitOrder({ ...payload, fileDelivery: 'zalo' }, { url: 'https://x', transport, fetchFn: created(null) })
    expect(transport).not.toHaveBeenCalled()
  })

  it('ném lỗi khi tạo đơn thất bại', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'Quá nhiều đơn' }))) as unknown as typeof fetch
    await expect(submitOrder(payload, { url: 'https://x', fetchFn })).rejects.toBeInstanceOf(OrderSubmitError)
    expect(NET).toBeTruthy()
  })

  it('chưa cấu hình URL Apps Script → đơn vẫn ghi, không upload', async () => {
    await expect(submitOrder(payload, { url: '', fetchFn: created('t') })).resolves.toMatchObject({ fileUploaded: false })
  })
})

describe('default transport', () => {
  it('uploads text/plain with fetch and never touches XMLHttpRequest (no CORS preflight)', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, orderCode: payload.orderCode })))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal(
      'XMLHttpRequest',
      vi.fn(() => {
        throw new Error('XMLHttpRequest must not be used: upload listeners force a CORS preflight')
      }),
    )
    try {
      const r = await submitOrder(payload, { url: 'https://script.example/exec', fetchFn: created('tk') })
      expect(r.fileUploaded).toBe(true)
      expect(fetchMock).toHaveBeenCalledWith('https://script.example/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ orderCode: payload.orderCode, uploadTicket: 'tk', fileName: 'a.stl', fileSize: 3, fileBase64: 'AQID' }),
        redirect: 'follow',
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
