import type { Env } from '../shared/env.ts'
import { json } from '../shared/http.ts'
import { verifyAccessJwt } from './accessJwt.ts'
import { handleColors } from './colors.ts'
import { handleOrders } from './orders.ts'

export interface AdminDeps {
  verify: (token: string, opts: { teamDomain: string; aud: string }) => Promise<{ email: string } | null>
}

// Tạo handler admin; `verify` có thể thay trong test.
export function createAdminHandler(deps: AdminDeps = { verify: verifyAccessJwt }) {
  return {
    async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
      const url = new URL(req.url)
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)

      // Đóng kín: thiếu cấu hình Access thì từ chối mọi /api.
      const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim()
      const aud = env.ACCESS_AUD?.trim()
      const admins = (env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
      if (!teamDomain || !aud || admins.length === 0) return json({ ok: false }, 401)

      const token = req.headers.get('Cf-Access-Jwt-Assertion')
      if (!token) return json({ ok: false }, 401)
      const who = await deps.verify(token, { teamDomain, aud })
      if (!who || !admins.includes(who.email.toLowerCase())) return json({ ok: false }, 401)

      if (req.method !== 'GET' && req.headers.get('Origin') !== url.origin) return json({ ok: false }, 403)

      return (
        (await handleOrders(req, env, url)) ?? (await handleColors(req, env, url)) ?? json({ ok: false }, 404)
      )
    },
  }
}

export default createAdminHandler()
