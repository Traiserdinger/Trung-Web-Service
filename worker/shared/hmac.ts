// HMAC-SHA256 dùng chung giữa Worker và Apps Script. Chỉ dùng crypto.subtle
// (có sẵn trong Workers và Node) để test Node có thể import trực tiếp.
// Hex luôn là chữ thường; `ts` của envelope tính bằng giây, `now` bằng mili giây.

const enc = new TextEncoder()
const ENVELOPE_WINDOW_SEC = 300
const TICKET_TTL_SEC = 900

export async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)))
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}

// So sánh hằng thời gian (theo độ dài chuỗi bằng nhau).
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export interface Envelope<T = unknown> {
  action: string
  ts: number
  data: T
  sig: string
}

export async function signEnvelope<T>(
  secret: string,
  action: string,
  data: T,
  now = Date.now(),
): Promise<Envelope<T>> {
  const ts = Math.floor(now / 1000)
  const sig = await hmacHex(secret, `${action}|${ts}|${JSON.stringify(data)}`)
  return { action, ts, data, sig }
}

export async function verifyEnvelope(
  secret: string,
  env: unknown,
  now = Date.now(),
): Promise<{ action: string; data: unknown } | null> {
  if (!env || typeof env !== 'object') return null
  const { action, ts, data, sig } = env as Record<string, unknown>
  if (typeof action !== 'string' || typeof ts !== 'number' || typeof sig !== 'string') return null
  if (Math.abs(Math.floor(now / 1000) - ts) > ENVELOPE_WINDOW_SEC) return null
  const expected = await hmacHex(secret, `${action}|${ts}|${JSON.stringify(data)}`)
  return safeEqual(expected, sig) ? { action, data } : null
}

export async function makeTicket(
  secret: string,
  code: string,
  fileSize: number,
  now = Date.now(),
): Promise<string> {
  const exp = Math.floor(now / 1000) + TICKET_TTL_SEC
  return `${exp}.${await hmacHex(secret, `${code}|${fileSize}|${exp}`)}`
}

export async function verifyTicket(
  secret: string,
  ticket: string,
  code: string,
  fileSize: number,
  now = Date.now(),
): Promise<boolean> {
  if (typeof ticket !== 'string') return false
  const dot = ticket.indexOf('.')
  if (dot < 1) return false
  const expStr = ticket.slice(0, dot)
  const exp = Number(expStr)
  if (!Number.isInteger(exp) || String(exp) !== expStr) return false
  if (Math.floor(now / 1000) > exp) return false
  const expected = await hmacHex(secret, `${code}|${fileSize}|${exp}`)
  return safeEqual(expected, ticket.slice(dot + 1))
}
