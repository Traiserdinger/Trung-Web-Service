import type { Env } from '../shared/env.ts'
import { json } from '../shared/http.ts'
import { handleInternalFile } from './internal.ts'
import { handleCreateOrder } from './orders.ts'
import { handleTrack } from './track.ts'

async function listColors(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT id, name, hex FROM colors WHERE active = 1 ORDER BY sort, id',
  ).all<{ id: number; name: string; hex: string }>()
  return json({ ok: true, colors: results })
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url)
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(req)
    if (pathname === '/api/colors' && req.method === 'GET') return listColors(env)
    if (pathname === '/api/orders' && req.method === 'POST') return handleCreateOrder(req, env, ctx)
    if (pathname === '/api/track' && req.method === 'POST') return handleTrack(req, env)
    if (pathname === '/api/internal/file' && req.method === 'POST') return handleInternalFile(req, env)
    return json({ ok: false }, 404)
  },
}
