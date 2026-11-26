import { describe, expect, it, vi } from 'vitest'
import type { OrderMeta } from '../utils/orderPayload'
import { OrderSubmitError, submitOrder, type Transport } from './submitOrder'

const file = (fileNo: number, over: Partial<OrderMeta['files'][number]> = {}): OrderMeta['files'][number] => ({
  fileNo,
  role: fileNo === 0 ? 'plate' : 'source',
  fileName: fileNo === 0 ? 'ban-in.3mf' : `f${fileNo}.stl`,
  fileSize: 3,
  fileType: fileNo === 0 ? '3mf' : 'stl',
  fileDelivery: 'upload',
  ...over,
})
const metaOf = (files: OrderMeta['files']) => ({ orderCode: 'P3D-261120-AAAA', files, customer: { name: 'An' } }) as unknown as OrderMeta
const blobs = (nos: number[]) => new Map(nos.map((n) => [n, new Blob([new Uint8Array([1, 2, 3])])]))
const created = (uploads: { fileNo: number; ticket: string }[], extra: Record<string, unknown> = {}) =>
  vi.fn(async () =>
    new Response(JSON.stringify({ ok: true, orderCode: 'P3D-261120-AAAA', uploads, trackUrl: '/tra-cuu?ma=P3D-261120-AAAA', ...extra })),
  ) as unknown as typeof fetch
const okTransport = () => vi.fn<Transport>(async () => JSON.stringify({ ok: true }))

describe('submitOrder', () => {
  it('uploads files in order with plate last', async () => {
    const transport = okTransport()
    const meta = metaOf([file(0), file(2), file(1)])
    const r = await submitOrder(meta, blobs([0, 1, 2]), {
      url: 'https://x',
      transport,
      fetchFn: created([{ fileNo: 0, ticket: 'tp' }, { fileNo: 2, ticket: 't2' }, { fileNo: 1, ticket: 't1' }]),
    })
    const bodies = transport.mock.calls.map((c) => JSON.parse(c[1]))
    expect(bodies.map((b) => b.fileNo)).toEqual([1, 2, 0])
    expect(bodies[0]).toEqual({ orderCode: 'P3D-261120-AAAA', fileNo: 1, uploadTicket: 't1', fileName: 'f1.stl', fileSize: 3, fileBase64: 'AQID' })
    expect(bodies[0].customer).toBeUndefined()
    expect(r).toEqual({
      orderCode: 'P3D-261120-AAAA',
      trackUrl: '/tra-cuu?ma=P3D-261120-AAAA',
      preview: false,
      files: [{ fileNo: 1, uploaded: true }, { fileNo: 2, uploaded: true }, { fileNo: 0, uploaded: true }],
    })
  })

  it('continues after one upload fails', async () => {
    let n = 0
    const transport = vi.fn<Transport>(async () => {
      n++
      if (n === 1) throw new Error('offline')
      return JSON.stringify({ ok: true })
    })
    const r = await submitOrder(metaOf([file(1), file(2), file(0)]), blobs([0, 1, 2]), {
      url: 'https://x',
      transport,
      fetchFn: created([{ fileNo: 1, ticket: 'a' }, { fileNo: 2, ticket: 'b' }, { fileNo: 0, ticket: 'c' }]),
    })
    expect(transport).toHaveBeenCalledTimes(3)
    expect(r.files).toEqual([{ fileNo: 1, uploaded: false }, { fileNo: 2, uploaded: true }, { fileNo: 0, uploaded: true }])
  })

  it('an unreadable blob is not uploaded but later files still upload', async () => {
    const transport = okTransport()
    const bad = new Blob([new Uint8Array([1])])
    const spy = vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementationOnce(function (this: FileReader) {
      queueMicrotask(() => this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>))
    })
    try {
      const m = blobs([2])
      m.set(1, bad)
      const r = await submitOrder(metaOf([file(1), file(2)]), m, {
        url: 'https://x',
        transport,
        fetchFn: created([{ fileNo: 1, ticket: 'a' }, { fileNo: 2, ticket: 'b' }]),
      })
      expect(r.files).toEqual([{ fileNo: 1, uploaded: false }, { fileNo: 2, uploaded: true }])
      expect(transport).toHaveBeenCalledTimes(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('Apps Script ok:false or broken JSON counts as not uploaded', async () => {
    for (const text of [JSON.stringify({ ok: false }), '<html>']) {
      const r = await submitOrder(metaOf([file(1)]), blobs([1]), {
        url: 'https://x',
        transport: async () => text,
        fetchFn: created([{ fileNo: 1, ticket: 'a' }]),
      })
      expect(r.files).toEqual([{ fileNo: 1, uploaded: false }])
    }
  })

  it('already-saved files count as uploaded', async () => {
    const transport = okTransport()
    const r = await submitOrder(metaOf([file(1), file(0)]), blobs([0, 1]), {
      url: 'https://x',
      transport,
      fetchFn: created([], { fileStatus: 'saved' }),
    })
    expect(transport).not.toHaveBeenCalled()
    expect(r.files).toEqual([{ fileNo: 1, uploaded: true }, { fileNo: 0, uploaded: true }])
  })

  it('omits zalo files and does not upload them', async () => {
    const transport = okTransport()
    const r = await submitOrder(metaOf([file(1, { fileDelivery: 'zalo' }), file(2)]), blobs([2]), {
      url: 'https://x',
      transport,
      fetchFn: created([{ fileNo: 2, ticket: 'b' }]),
    })
    expect(r.files).toEqual([{ fileNo: 2, uploaded: true }])
  })

  it('missing ticket, missing blob or empty URL → not uploaded, order still recorded', async () => {
    const transport = okTransport()
    const r = await submitOrder(metaOf([file(1), file(2)]), blobs([1]), {
      url: 'https://x',
      transport,
      fetchFn: created([{ fileNo: 2, ticket: 'b' }], { fileStatus: 'pending' }),
    })
    expect(transport).not.toHaveBeenCalled()
    expect(r.files).toEqual([{ fileNo: 1, uploaded: false }, { fileNo: 2, uploaded: false }])
    const r2 = await submitOrder(metaOf([file(1)]), blobs([1]), { url: '', fetchFn: created([{ fileNo: 1, ticket: 'a' }]) })
    expect(r2.files).toEqual([{ fileNo: 1, uploaded: false }])
  })

  it('throws when creating the order fails', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'Quá nhiều đơn' }))) as unknown as typeof fetch
    await expect(submitOrder(metaOf([file(1)]), blobs([1]), { url: 'https://x', fetchFn })).rejects.toBeInstanceOf(OrderSubmitError)
  })

  it('preview → preview true, no upload', async () => {
    const transport = okTransport()
    const r = await submitOrder(metaOf([file(1)]), blobs([1]), {
      url: 'https://x',
      transport,
      fetchFn: created([], { preview: true, fileStatus: 'pending' }),
    })
    expect(r).toMatchObject({ preview: true, files: [{ fileNo: 1, uploaded: false }] })
    expect(transport).not.toHaveBeenCalled()
  })
})

describe('default transport', () => {
  it('uploads text/plain with fetch and never touches XMLHttpRequest (no CORS preflight)', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal(
      'XMLHttpRequest',
      vi.fn(() => {
        throw new Error('XMLHttpRequest must not be used: upload listeners force a CORS preflight')
      }),
    )
    try {
      const r = await submitOrder(metaOf([file(1)]), blobs([1]), {
        url: 'https://script.example/exec',
        fetchFn: created([{ fileNo: 1, ticket: 'tk' }]),
      })
      expect(r.files).toEqual([{ fileNo: 1, uploaded: true }])
      expect(fetchMock).toHaveBeenCalledWith('https://script.example/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ orderCode: 'P3D-261120-AAAA', fileNo: 1, uploadTicket: 'tk', fileName: 'f1.stl', fileSize: 3, fileBase64: 'AQID' }),
        redirect: 'follow',
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
