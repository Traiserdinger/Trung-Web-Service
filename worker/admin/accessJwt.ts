// Xác minh JWT của Cloudflare Access (RS256) bằng JWKS của team.

export interface VerifyOpts {
  teamDomain: string
  aud: string
  now?: number
  fetchJwks?: (url: string) => Promise<{ keys: JsonWebKey[] }>
}

const JWKS_TTL_MS = 10 * 60 * 1000
const jwksCache = new Map<string, { at: number; keys: JsonWebKey[] }>()

export function resetJwksCache(): void {
  jwksCache.clear()
}

async function defaultFetchJwks(url: string): Promise<{ keys: JsonWebKey[] }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`JWKS ${res.status}`)
  return (await res.json()) as { keys: JsonWebKey[] }
}

async function getKeys(url: string, fetchJwks: NonNullable<VerifyOpts['fetchJwks']>): Promise<JsonWebKey[]> {
  const hit = jwksCache.get(url)
  if (hit && Date.now() - hit.at < JWKS_TTL_MS) return hit.keys
  const { keys } = await fetchJwks(url)
  if (!Array.isArray(keys)) throw new Error('JWKS không hợp lệ')
  jwksCache.set(url, { at: Date.now(), keys })
  return keys
}

function b64urlDecode(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('base64url')
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

function parseJsonObject(part: string): Record<string, unknown> | null {
  const v: unknown = JSON.parse(new TextDecoder().decode(b64urlDecode(part)))
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export async function verifyAccessJwt(token: string, opts: VerifyOpts): Promise<{ email: string } | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const header = parseJsonObject(parts[0])
    const payload = parseJsonObject(parts[1])
    if (!header || !payload) return null
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) return null

    const keys = await getKeys(`https://${opts.teamDomain}/cdn-cgi/access/certs`, opts.fetchJwks ?? defaultFetchJwks)
    const jwk = keys.find((k) => (k as { kid?: string }).kid === header.kid)
    if (!jwk) return null
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    )
    if (!ok) return null

    const now = opts.now ?? Math.floor(Date.now() / 1000)
    const { aud, exp, nbf, iss, email } = payload
    if (typeof exp !== 'number' || exp <= now) return null
    if (nbf !== undefined && (typeof nbf !== 'number' || nbf > now)) return null
    if (iss !== `https://${opts.teamDomain}`) return null
    const auds = Array.isArray(aud) ? aud : [aud]
    if (!auds.includes(opts.aud)) return null
    if (typeof email !== 'string' || !email) return null
    return { email }
  } catch {
    return null
  }
}
