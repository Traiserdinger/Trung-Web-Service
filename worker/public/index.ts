import type { Env } from '../shared/env.ts'
import { json } from '../shared/http.ts'

async function listColors(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT id, name, hex FROM colors WHERE active = 1 ORDER BY sort, id',
  ).all<{ id: number; name: string; hex: string }>()
  return json({ ok: true, colors: results })
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url)
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(req)
    if (pathname === '/api/colors' && req.method === 'GET') return listColors(env)
    return json({ ok: false }, 404)
  },
}
