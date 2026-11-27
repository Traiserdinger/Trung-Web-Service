// @vitest-environment node
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hmacHex, makeFileTicket, makeTicket, signEnvelope, verifyEnvelope, verifyFileTicket, verifyTicket } from './hmac.ts'

const NOW = 1_700_000_000_000

describe('hmacHex', () => {
  it('khớp HMAC-SHA256 của node:crypto, hex chữ thường', async () => {
    const ref = createHmac('sha256', 'k').update('m').digest('hex')
    expect(await hmacHex('k', 'm')).toBe(ref)
  })
})

describe('envelope', () => {
  it('round-trip giữ nguyên action và data', async () => {
    const env = await signEnvelope('s', 'createOrder', { a: 1, b: 'x' }, NOW)
    expect(env.ts).toBe(Math.floor(NOW / 1000))
    expect(await verifyEnvelope('s', env, NOW)).toEqual({ action: 'createOrder', data: { a: 1, b: 'x' } })
  })

  it('đổi data thì null', async () => {
    const env = await signEnvelope('s', 'x', { a: 1 }, NOW)
    expect(await verifyEnvelope('s', { ...env, data: { a: 2 } }, NOW)).toBeNull()
  })

  it('sai secret hoặc dữ liệu không phải envelope thì null', async () => {
    const env = await signEnvelope('s', 'x', {}, NOW)
    expect(await verifyEnvelope('other', env, NOW)).toBeNull()
    expect(await verifyEnvelope('s', null, NOW)).toBeNull()
    expect(await verifyEnvelope('s', { action: 1 }, NOW)).toBeNull()
  })

  it('ts lệch 300 s vẫn được, 301 s thì null', async () => {
    const env = await signEnvelope('s', 'x', {}, NOW)
    expect(await verifyEnvelope('s', env, NOW + 300_000)).not.toBeNull()
    expect(await verifyEnvelope('s', env, NOW + 301_000)).toBeNull()
    expect(await verifyEnvelope('s', env, NOW - 301_000)).toBeNull()
  })
})

describe('vé upload', () => {
  it('hợp lệ tại now, sai sau 901 s', async () => {
    const t = await makeTicket('s', 'P3D-250101-ABCD', 1234, NOW)
    expect(await verifyTicket('s', t, 'P3D-250101-ABCD', 1234, NOW)).toBe(true)
    expect(await verifyTicket('s', t, 'P3D-250101-ABCD', 1234, NOW + 900_000)).toBe(true)
    expect(await verifyTicket('s', t, 'P3D-250101-ABCD', 1234, NOW + 901_000)).toBe(false)
  })

  it('sai nếu đổi fileSize, code hoặc secret', async () => {
    const t = await makeTicket('s', 'C1', 10, NOW)
    expect(await verifyTicket('s', t, 'C1', 11, NOW)).toBe(false)
    expect(await verifyTicket('s', t, 'C2', 10, NOW)).toBe(false)
    expect(await verifyTicket('x', t, 'C1', 10, NOW)).toBe(false)
    expect(await verifyTicket('s', 'rác', 'C1', 10, NOW)).toBe(false)
  })

  it('vé không phải chuỗi thì false, không ném lỗi', async () => {
    expect(await verifyTicket('s', undefined as unknown as string, 'C1', 10, NOW)).toBe(false)
    expect(await verifyTicket('s', 123 as unknown as string, 'C1', 10, NOW)).toBe(false)
  })
})

describe('vé từng file', () => {
  it('file ticket binds fileNo', async () => {
    const t = await makeFileTicket('s', 'C1', 1, 500, NOW)
    expect(await verifyFileTicket('s', t, 'C1', 1, 500, NOW)).toBe(true)
    expect(await verifyFileTicket('s', t, 'C1', 2, 500, NOW)).toBe(false)
    expect(await verifyFileTicket('s', t, 'C1', 1, 501, NOW)).toBe(false)
    expect(await verifyFileTicket('s', t, 'C2', 1, 500, NOW)).toBe(false)
    expect(await verifyFileTicket('s', t, 'C1', 1, 500, NOW + 901_000)).toBe(false)
  })

  it('không lẫn với vé cũ', async () => {
    const old = await makeTicket('s', 'C1', 500, NOW)
    expect(await verifyFileTicket('s', old, 'C1', 1, 500, NOW)).toBe(false)
  })
})
