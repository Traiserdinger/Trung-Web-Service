import type { Env } from '../shared/env.ts'
import { json } from '../shared/http.ts'
import { firstAdmin, sessionSecret, handleAuth, verifySession } from './auth.ts'
import { handleColors } from './colors.ts'
import { handleOrders } from './orders.ts'
import { handleStats } from './stats.ts'

export function createAdminHandler() {
  return {
    async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
      const url = new URL(req.url)
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)

      // Đóng kín: thiếu cấu hình thì từ chối mọi /api, kể cả /api/auth/*.
      const secret = sessionSecret(env)
      const admin = firstAdmin(env)
      if (!secret || !admin) return json({ ok: false }, 401)

      if (req.method !== 'GET' && req.headers.get('Origin') !== url.origin) return json({ ok: false }, 403)

      const authed = await handleAuth(req, env, url)
      if (authed) return authed

      if (!(await verifySession(secret, admin, req.headers.get('Cookie')))) return json({ ok: false }, 401)
      if (url.pathname === '/api/auth/me' && req.method === 'GET') return json({ ok: true })

      return (
        (await handleOrders(req, env, url)) ??
        (await handleStats(req, env, url)) ??
        (await handleColors(req, env, url)) ??
        json({ ok: false }, 404)
      )
    },
  }
}

export default createAdminHandler()
