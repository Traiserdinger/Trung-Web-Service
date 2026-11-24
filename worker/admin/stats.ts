import { STATUSES } from '../../src/shared/orderStatus.ts'
import type { Env } from '../shared/env.ts'
import { json } from '../shared/http.ts'
import { getStats } from '../shared/orderRepo.ts'

// Trả null nếu không phải GET /api/stats.
export async function handleStats(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== '/api/stats' || req.method !== 'GET') return null
  return json({ ok: true, ...(await getStats(env.DB, new Date(), STATUSES)) })
}
