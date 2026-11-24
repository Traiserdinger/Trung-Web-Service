// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { resetJwksCache, verifyAccessJwt } from './accessJwt.ts'

const TEAM = 'team.cloudflareaccess.com'
const AUD = 'aud123'
const NOW = 1_800_000_000

const b64u = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b)
  return Buffer.from(bytes).toString('base64url')
}

async function makeKey() {
  return (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
}

async function sign(
  priv: CryptoKey,
  payload: unknown,
  header: Record<string, unknown> = { alg: 'RS256', kid: 'k1', typ: 'JWT' },
) {
  const data = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', priv, new TextEncoder().encode(data))
  return `${data}.${b64u(sig)}`
}

const claims = (over: Record<string, unknown> = {}) => ({
  aud: [AUD], email: 'a@x.com', exp: NOW + 600, iat: NOW - 10, iss: `https://${TEAM}`, ...over,
})

describe('verifyAccessJwt', () => {
  let pair: CryptoKeyPair
  let jwk: JsonWebKey & { kid: string }
  let fetchJwks: (url: string) => Promise<{ keys: JsonWebKey[] }>
  let urls: string[]
  const opts = () => ({ teamDomain: TEAM, aud: AUD, now: NOW, fetchJwks })

  beforeEach(async () => {
    resetJwksCache()
    pair = await makeKey()
    jwk = Object.assign((await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey, { kid: 'k1' })
    urls = []
    fetchJwks = async (url) => {
      urls.push(url)
      return { keys: [jwk] }
    }
  })

  it('token hợp lệ → email', async () => {
    const t = await sign(pair.privateKey, claims())
    expect(await verifyAccessJwt(t, opts())).toEqual({ email: 'a@x.com' })
    expect(urls).toEqual([`https://${TEAM}/cdn-cgi/access/certs`])
  })

  it('aud là chuỗi cũng được', async () => {
    const t = await sign(pair.privateKey, claims({ aud: AUD }))
    expect(await verifyAccessJwt(t, opts())).toEqual({ email: 'a@x.com' })
  })

  it('cache JWKS giữa các lần gọi', async () => {
    const t = await sign(pair.privateKey, claims())
    await verifyAccessJwt(t, opts())
    await verifyAccessJwt(t, opts())
    expect(urls).toHaveLength(1)
  })

  it.each([
    ['sai aud', { aud: ['other'] }],
    ['hết hạn', { exp: NOW - 1 }],
    ['sai iss', { iss: 'https://evil.com' }],
    ['nbf ở tương lai', { nbf: NOW + 100 }],
    ['thiếu email', { email: undefined }],
  ])('%s → null', async (_n, over) => {
    const t = await sign(pair.privateKey, claims(over))
    expect(await verifyAccessJwt(t, opts())).toBeNull()
  })

  it('chữ ký bị sửa → null', async () => {
    const t = await sign(pair.privateKey, claims())
    const [h, , s] = t.split('.')
    const forged = `${h}.${b64u(JSON.stringify(claims({ email: 'evil@x.com' })))}.${s}`
    expect(await verifyAccessJwt(forged, opts())).toBeNull()
  })

  it('ký bằng khoá khác → null', async () => {
    const other = await makeKey()
    const t = await sign(other.privateKey, claims())
    expect(await verifyAccessJwt(t, opts())).toBeNull()
  })

  it('alg none / HS256 / thiếu kid → null', async () => {
    const none = `${b64u(JSON.stringify({ alg: 'none', kid: 'k1' }))}.${b64u(JSON.stringify(claims()))}.`
    expect(await verifyAccessJwt(none, opts())).toBeNull()
    expect(await verifyAccessJwt(await sign(pair.privateKey, claims(), { alg: 'HS256', kid: 'k1' }), opts())).toBeNull()
    expect(await verifyAccessJwt(await sign(pair.privateKey, claims(), { alg: 'RS256' }), opts())).toBeNull()
  })

  it('kid không có trong JWKS → null', async () => {
    const t = await sign(pair.privateKey, claims(), { alg: 'RS256', kid: 'zzz' })
    expect(await verifyAccessJwt(t, opts())).toBeNull()
  })

  it('token hỏng / payload không phải object / fetch lỗi → null', async () => {
    expect(await verifyAccessJwt('abc', opts())).toBeNull()
    expect(await verifyAccessJwt('a.b.c', opts())).toBeNull()
    expect(await verifyAccessJwt('', opts())).toBeNull()
    expect(await verifyAccessJwt(await sign(pair.privateKey, [1, 2]), opts())).toBeNull()
    expect(await verifyAccessJwt(await sign(pair.privateKey, 'str'), opts())).toBeNull()
    resetJwksCache()
    const t = await sign(pair.privateKey, claims())
    const failing = { ...opts(), fetchJwks: async () => { throw new Error('down') } }
    expect(await verifyAccessJwt(t, failing)).toBeNull()
  })
})
