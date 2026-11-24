import type { Env } from '../shared/env.ts'
import { callAppsScript } from '../shared/appsScript.ts'
import { hmacHex, safeEqual } from '../shared/hmac.ts'
import { json, readJson } from '../shared/http.ts'
import { hit } from '../shared/rateLimit.ts'

const CODE_TTL_SEC = 600
const MAX_ATTEMPTS = 5
const SESSION_TTL_SEC = 604_800
const COOKIE = 'admin_session'
const COOKIE_ATTRS = 'HttpOnly; Secure; SameSite=Strict; Path=/'

// Secret đã cắt khoảng trắng; dùng ở mọi nơi để cổng và cookie luôn khớp.
export const sessionSecret = (env: Env): string => env.ADMIN_SESSION_SECRET?.trim() ?? ''

// Email đầu tiên trong ADMIN_EMAILS (chữ thường): nhận mã và ràng buộc phiên.
export function firstAdmin(env: Env): string {
  return (env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).find(Boolean) ?? ''
}

export async function makeSessionCookie(secret: string, email: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SEC
  const sig = await hmacHex(secret, `session|${email}|${exp}`)
  return `${COOKIE}=${exp}.${sig}; ${COOKIE_ATTRS}; Max-Age=${SESSION_TTL_SEC}`
}

export async function verifySession(
  secret: string,
  email: string,
  cookieHeader: string | null,
  now = Date.now(),
): Promise<boolean> {
  try {
    if (!secret || !email || !cookieHeader) return false
    let value: string | null = null
    for (const part of cookieHeader.split(';')) {
      const eq = part.indexOf('=')
      if (eq > 0 && part.slice(0, eq).trim() === COOKIE) {
        value = part.slice(eq + 1).trim()
        break
      }
    }
    if (!value) return false
    const dot = value.indexOf('.')
    if (dot < 1) return false
    const expStr = value.slice(0, dot)
    const exp = Number(expStr)
    if (!Number.isInteger(exp) || String(exp) !== expStr) return false
    const nowSec = Math.floor(now / 1000)
    if (nowSec > exp || exp > nowSec + SESSION_TTL_SEC) return false
    const expected = await hmacHex(secret, `session|${email}|${exp}`)
    return safeEqual(expected, value.slice(dot + 1))
  } catch {
    return false
  }
}

function newCode(): string {
  const buf = new Uint32Array(1)
  // Loại bỏ phần dư để 6 chữ số phân bố đều (rejection sampling).
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % 1_000_000)
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return String(buf[0] % 1_000_000).padStart(6, '0')
}

const codeHash = (secret: string, code: string) => hmacHex(secret, `code|${code}`)
const BAD_CODE = { ok: false, error: 'Mã không đúng hoặc đã hết hạn' }

async function requestCode(req: Request, env: Env, now: number): Promise<Response> {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown'
  if (
    !(await hit(env.DB, 'admin-code-ip:' + ip, 3, CODE_TTL_SEC, now)) ||
    !(await hit(env.DB, 'admin-code-day', 20, 86_400, now))
  ) {
    return json({ ok: false, error: 'Bạn đã yêu cầu quá nhiều mã, thử lại sau 10 phút' }, 429)
  }
  const code = newCode()
  // Mã mới huỷ mọi mã cũ.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_codes'),
    env.DB.prepare('INSERT INTO admin_codes (code_hash, expires_at) VALUES (?, ?)').bind(
      await codeHash(sessionSecret(env), code),
      Math.floor(now / 1000) + CODE_TTL_SEC,
    ),
  ])
  try {
    await callAppsScript(env, 'notifyStatus', {
      to: firstAdmin(env),
      subject: `[In 3D Trung] Mã đăng nhập quản trị: ${code}`,
      text: `${code}\nMã có hiệu lực trong 10 phút.\nNếu không phải bạn, bỏ qua email này.`,
    })
  } catch {
    // Không lộ việc gửi mail lỗi.
  }
  return json({ ok: true, message: 'Đã gửi mã nếu email hợp lệ' })
}

async function verifyCode(req: Request, env: Env, now: number): Promise<Response> {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown'
  if (!(await hit(env.DB, 'admin-verify:' + ip, 10, CODE_TTL_SEC, now))) {
    return json({ ok: false, error: 'Bạn thử quá nhiều lần, thử lại sau 10 phút' }, 429)
  }
  const body = await readJson<{ code?: unknown }>(req, 1000)
  const code = typeof body?.code === 'string' ? body.code.replace(/\s+/g, '') : ''
  if (!/^\d{6}$/.test(code)) return json(BAD_CODE, 401)

  // Chiếm một lượt thử nguyên tử trước khi so sánh: request song song không vượt trần 5 lần.
  const row = await env.DB
    .prepare(
      `UPDATE admin_codes SET attempts = attempts + 1
       WHERE id = (SELECT id FROM admin_codes WHERE expires_at > ? AND attempts < ? ORDER BY id DESC LIMIT 1)
       RETURNING id, code_hash, attempts`,
    )
    .bind(Math.floor(now / 1000), MAX_ATTEMPTS)
    .first<{ id: number; code_hash: string; attempts: number }>()
  if (!row) return json(BAD_CODE, 401)

  const secret = sessionSecret(env)
  if (safeEqual(await codeHash(secret, code), row.code_hash)) {
    // Xoá nguyên tử: chỉ một request thắng khi hai request cùng dùng một mã.
    const del = await env.DB.prepare('DELETE FROM admin_codes WHERE id = ?').bind(row.id).run()
    if (del.meta.changes !== 1) return json(BAD_CODE, 401)
    const res = json({ ok: true })
    res.headers.append('Set-Cookie', await makeSessionCookie(secret, firstAdmin(env), now))
    return res
  }
  if (row.attempts >= MAX_ATTEMPTS) await env.DB.prepare('DELETE FROM admin_codes WHERE id = ?').bind(row.id).run()
  return json(BAD_CODE, 401)
}

// Xử lý request-code / verify / logout; đường dẫn khác trả null.
export async function handleAuth(req: Request, env: Env, url: URL, now = Date.now()): Promise<Response | null> {
  if (req.method !== 'POST') return null
  switch (url.pathname) {
    case '/api/auth/request-code':
      return requestCode(req, env, now)
    case '/api/auth/verify':
      return verifyCode(req, env, now)
    case '/api/auth/logout': {
      const res = json({ ok: true })
      res.headers.append('Set-Cookie', `${COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0`)
      return res
    }
    default:
      return null
  }
}
