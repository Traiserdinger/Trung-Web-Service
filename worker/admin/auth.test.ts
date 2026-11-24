// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeCtx, makeEnv } from '../test/env.ts'
import { createAdminHandler } from './index.ts'
import { handleAuth, makeSessionCookie, verifySession } from './auth.ts'

const ORIGIN = 'https://admin.example.com'
const NOW = 1_800_000_000_000
const OK_MSG = 'Đã gửi mã nếu email hợp lệ'

const authEnv = (over = {}) =>
  makeEnv({
    ADMIN_EMAILS: 'a@x.com, b@y.com',
    ADMIN_SESSION_SECRET: 's',
    APPS_SCRIPT_URL: 'https://script/exec',
    ...over,
  })
type TestEnv = ReturnType<typeof authEnv>

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function req(path: string, body?: unknown, ip = '1.1.1.1', method = 'POST') {
  return new Request(ORIGIN + path, {
    method,
    headers: { Origin: ORIGIN, 'content-type': 'application/json', 'CF-Connecting-IP': ip },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
async function auth(env: TestEnv, path: string, body?: unknown, now = NOW, ip = '1.1.1.1') {
  const r = req(path, body, ip)
  const res = await handleAuth(r, env, new URL(r.url), now)
  if (!res) throw new Error('route not handled')
  return { res, body: (await res.clone().json()) as Record<string, unknown> }
}
const lastEnvelope = (i = fetchMock.mock.calls.length - 1) => {
  const sent = JSON.parse(fetchMock.mock.calls[i][1].body)
  const data = typeof sent.data === 'string' ? JSON.parse(sent.data) : sent.data
  return { action: sent.action as string, data: data as { to: string; subject: string; text: string } }
}
async function requestCode(env: TestEnv, now = NOW) {
  await auth(env, '/api/auth/request-code', {}, now)
  const { data } = lastEnvelope()
  return /(\d{6})$/.exec(data.subject)![1]
}
const count = async (env: TestEnv) =>
  (await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_codes').first<{ n: number }>())!.n

describe('request-code', () => {
  it('gửi notifyStatus tới email đầu tiên, 1 dòng trong bảng', async () => {
    const env = authEnv()
    const { res, body } = await auth(env, '/api/auth/request-code', {})
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, message: OK_MSG })
    const { action, data } = lastEnvelope()
    expect(action).toBe('notifyStatus')
    expect(data.to).toBe('a@x.com')
    expect(data.subject).toMatch(/^\[In 3D Trung\] Mã đăng nhập quản trị: \d{6}$/)
    const code = /(\d{6})$/.exec(data.subject)![1]
    expect(data.text).toBe(`${code}\nMã có hiệu lực trong 10 phút.\nNếu không phải bạn, bỏ qua email này.`)
    expect(await count(env)).toBe(1)
    const row = await env.DB.prepare('SELECT code_hash FROM admin_codes').first<{ code_hash: string }>()
    expect(row!.code_hash).not.toContain(code)
  })
  it('lần thứ 4 cùng IP trong 600 s → 429; IP khác vẫn được', async () => {
    const env = authEnv()
    for (let i = 0; i < 3; i++) expect((await auth(env, '/api/auth/request-code', {})).res.status).toBe(200)
    const r = await auth(env, '/api/auth/request-code', {})
    expect(r.res.status).toBe(429)
    expect(r.body).toEqual({ ok: false, error: 'Bạn đã yêu cầu quá nhiều mã, thử lại sau 10 phút' })
    expect((await auth(env, '/api/auth/request-code', {}, NOW, '2.2.2.2')).res.status).toBe(200)
  })
  it('yêu cầu thứ 21 trong một ngày → 429', async () => {
    const env = authEnv()
    for (let i = 0; i < 20; i++) {
      expect((await auth(env, '/api/auth/request-code', {}, NOW, `9.9.9.${i}`)).res.status).toBe(200)
    }
    const r = await auth(env, '/api/auth/request-code', {}, NOW, '9.9.9.99')
    expect(r.res.status).toBe(429)
    expect(r.body).toEqual({ ok: false, error: 'Đã gửi quá nhiều mã hôm nay, vui lòng thử lại sau' })
  })
  it('trần ngày đã đầy → không tốn lượt IP', async () => {
    const env = authEnv()
    for (let i = 0; i < 20; i++) await env.DB.prepare('INSERT INTO rate_hits (key, at) VALUES (?, ?)').bind('admin-code-day', NOW).run()
    expect((await auth(env, '/api/auth/request-code', {}, NOW, '5.5.5.5')).res.status).toBe(429)
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_hits WHERE key = 'admin-code-ip:5.5.5.5'").first<{ n: number }>()
    expect(n!.n).toBe(0)
    expect(await count(env)).toBe(0)
  })
  it('Apps Script lỗi → vẫn 200 cùng message', async () => {
    fetchMock.mockRejectedValue(new Error('boom'))
    const { res, body } = await auth(authEnv(), '/api/auth/request-code', {})
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, message: OK_MSG })
  })
})

describe('verify', () => {
  it('gửi mã 2 lần → mã thứ nhất 401, mã thứ hai đăng nhập được', async () => {
    const env = authEnv()
    const c1 = await requestCode(env)
    const c2 = await requestCode(env)
    expect(await count(env)).toBe(1)
    if (c1 !== c2) expect((await auth(env, '/api/auth/verify', { code: c1 })).res.status).toBe(401)
    expect((await auth(env, '/api/auth/verify', { code: c2 })).res.status).toBe(200)
  })
  it('đúng → 200 + cookie đúng thuộc tính; dùng lại → 401', async () => {
    const env = authEnv()
    const code = await requestCode(env)
    const { res, body } = await auth(env, '/api/auth/verify', { code })
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    const sc = res.headers.get('set-cookie')!
    expect(sc).toMatch(/^__Host-admin_session=\d+\.[0-9a-f]{64}; /)
    for (const a of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=604800']) expect(sc).toContain(a)
    const again = await auth(env, '/api/auth/verify', { code })
    expect(again.res.status).toBe(401)
    expect(again.body).toEqual({ ok: false, error: 'Mã không đúng hoặc đã hết hạn' })
  })
  it("'123 456' dạng có khoảng trắng của mã đúng → 200", async () => {
    const env = authEnv()
    const code = await requestCode(env)
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`
    expect((await auth(env, '/api/auth/verify', { code: spaced })).res.status).toBe(200)
  })
  it('5 lần sai → lần thứ 6 với mã đúng vẫn 401', async () => {
    const env = authEnv()
    const code = await requestCode(env)
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) expect((await auth(env, '/api/auth/verify', { code: wrong })).res.status).toBe(401)
    expect(await count(env)).toBe(0)
    expect((await auth(env, '/api/auth/verify', { code })).res.status).toBe(401)
  })
  it('20 lần đoán sai song song rồi mã đúng → 401, mã đã huỷ', async () => {
    const env = authEnv()
    const code = await requestCode(env)
    const wrong = code === '000000' ? '111111' : '000000'
    // Mỗi IP một lượt để không chạm giới hạn 10 lần/IP.
    const rs = await Promise.all(
      Array.from({ length: 20 }, (_, i) => auth(env, '/api/auth/verify', { code: wrong }, NOW, `7.7.7.${i}`)),
    )
    expect(rs.every((r) => r.res.status === 401)).toBe(true)
    expect((await auth(env, '/api/auth/verify', { code }, NOW, '8.8.8.8')).res.status).toBe(401)
    const row = await env.DB.prepare('SELECT attempts FROM admin_codes').first<{ attempts: number }>()
    expect(row === null || row.attempts >= 5).toBe(true)
  })
  it('mã quá 600 s → 401', async () => {
    const env = authEnv()
    const code = await requestCode(env)
    expect((await auth(env, '/api/auth/verify', { code }, NOW + 601_000)).res.status).toBe(401)
  })
  it('body rác / thiếu code → 401, không ném', async () => {
    const env = authEnv()
    await requestCode(env)
    for (const b of [{}, { code: 123456 }, { code: 'abcdef' }, { code: '12345' }]) {
      expect((await auth(env, '/api/auth/verify', b)).res.status).toBe(401)
    }
  })
  it('đủ 30 lần sai trong ngày → 429, không so sánh (mã đúng cũng bị chặn)', async () => {
    const env = authEnv()
    const code = await requestCode(env)
    for (let i = 0; i < 30; i++) await env.DB.prepare('INSERT INTO rate_hits (key, at) VALUES (?, ?)').bind('admin-verify-fail-day', NOW).run()
    const r = await auth(env, '/api/auth/verify', { code })
    expect(r.res.status).toBe(429)
    expect(r.body).toEqual({ ok: false, error: 'Đã nhập sai quá nhiều lần hôm nay, vui lòng thử lại sau' })
    expect(r.res.headers.get('set-cookie')).toBeNull()
  })
  it('mỗi lần nhập sai ghi một lượt vào admin-verify-fail-day', async () => {
    const env = authEnv()
    const code = await requestCode(env)
    await auth(env, '/api/auth/verify', { code: code === '000000' ? '111111' : '000000' })
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_hits WHERE key = 'admin-verify-fail-day'").first<{ n: number }>()
    expect(n!.n).toBe(1)
  })
  it('lần thứ 11 cùng IP trong 600 s → 429', async () => {
    const env = authEnv()
    for (let i = 0; i < 10; i++) await auth(env, '/api/auth/verify', { code: '000000' })
    const r = await auth(env, '/api/auth/verify', { code: '000000' })
    expect(r.res.status).toBe(429)
    expect(r.body).toEqual({ ok: false, error: 'Bạn thử quá nhiều lần, thử lại sau 10 phút' })
    expect((await auth(env, '/api/auth/verify', { code: '000000' }, NOW, '2.2.2.2')).res.status).toBe(401)
  })
})

describe('logout', () => {
  it('Set-Cookie Max-Age=0', async () => {
    const { res, body } = await auth(authEnv(), '/api/auth/logout', {})
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(res.headers.get('set-cookie')).toBe('__Host-admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0')
  })
})

describe('verifySession', () => {
  const val = (setCookie: string) => /__Host-admin_session=[^;]*/.exec(setCookie)![0]
  it('cookie đúng → true; nhiều cookie, có khoảng trắng → true', async () => {
    const c = val(await makeSessionCookie('s', 'a@x.com', NOW))
    expect(await verifySession('s', 'a@x.com', c, NOW)).toBe(true)
    expect(await verifySession('s', 'a@x.com', `foo=1;  ${c} ; bar=2`, NOW)).toBe(true)
  })
  it('sai sig / hết hạn / secret khác / email khác / rác → false', async () => {
    const c = val(await makeSessionCookie('s', 'a@x.com', NOW))
    const flipped = c.slice(0, -1) + (c.endsWith('0') ? '1' : '0')
    expect(await verifySession('s', 'a@x.com', flipped, NOW)).toBe(false)
    expect(await verifySession('s', 'a@x.com', c, NOW + 604_801_000)).toBe(false)
    expect(await verifySession('t', 'a@x.com', c, NOW)).toBe(false)
    expect(await verifySession('s', 'b@y.com', c, NOW)).toBe(false)
    const far = val(await makeSessionCookie('s', 'a@x.com', NOW + 10_000_000))
    expect(await verifySession('s', 'a@x.com', far, NOW)).toBe(false)
    for (const h of ['__Host-admin_session=abc', '__Host-admin_session=', '', null, ';;;', '__Host-admin_session=1.2.3', '__Host-admin_session=x.y']) {
      expect(await verifySession('s', 'a@x.com', h, NOW)).toBe(false)
    }
  })
})

describe('cổng trong handler', () => {
  const handler = createAdminHandler()
  it('secret có xuống dòng cuối → đăng nhập và /api/auth/me vẫn 200', async () => {
    const env = authEnv({ ADMIN_SESSION_SECRET: 's\n' })
    await handler.fetch(req('/api/auth/request-code', {}), env, fakeCtx())
    const code = /(\d{6})$/.exec(lastEnvelope().data.subject)![1]
    const v = await handler.fetch(req('/api/auth/verify', { code }), env, fakeCtx())
    expect(v.status).toBe(200)
    const cookie = /__Host-admin_session=[^;]*/.exec(v.headers.get('set-cookie')!)![0]
    const me = await handler.fetch(new Request(ORIGIN + '/api/auth/me', { headers: { cookie } }), env, fakeCtx())
    expect(me.status).toBe(200)
  })
  it('thiếu ADMIN_SESSION_SECRET → request-code 401', async () => {
    const env = authEnv({ ADMIN_SESSION_SECRET: '' })
    const res = await handler.fetch(req('/api/auth/request-code', {}), env, fakeCtx())
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('POST /api/auth/verify thiếu Origin → 403', async () => {
    const r = new Request(ORIGIN + '/api/auth/verify', { method: 'POST', body: '{"code":"123456"}' })
    expect((await handler.fetch(r, authEnv(), fakeCtx())).status).toBe(403)
  })
  it('đăng nhập đầy đủ qua handler rồi gọi /api/auth/me', async () => {
    const env = authEnv()
    await handler.fetch(req('/api/auth/request-code', {}), env, fakeCtx())
    const code = /(\d{6})$/.exec(lastEnvelope().data.subject)![1]
    const v = await handler.fetch(req('/api/auth/verify', { code }), env, fakeCtx())
    expect(v.status).toBe(200)
    const cookie = /__Host-admin_session=[^;]*/.exec(v.headers.get('set-cookie')!)![0]
    const me = await handler.fetch(
      new Request(ORIGIN + '/api/auth/me', { headers: { cookie: cookie } }),
      env,
      fakeCtx(),
    )
    expect(me.status).toBe(200)
  })
})
