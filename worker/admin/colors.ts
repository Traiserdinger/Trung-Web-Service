import type { Env } from '../shared/env.ts'
import { json, readJson } from '../shared/http.ts'
import { insertColor, listAllColors, updateColor } from '../shared/orderRepo.ts'

const HEX_RE = /^#[0-9a-f]{6}$/i
const validName = (v: unknown): v is string => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 30

// Trả null nếu đường dẫn không thuộc nhóm màu. Không có route xoá màu.
export async function handleColors(req: Request, env: Env, url: URL): Promise<Response | null> {
  const { pathname } = url
  if (pathname === '/api/colors') {
    if (req.method === 'GET') return json({ ok: true, colors: await listAllColors(env.DB) })
    if (req.method === 'POST') {
      const b = await readJson<{ name?: unknown; hex?: unknown }>(req)
      if (!b || !validName(b.name) || typeof b.hex !== 'string' || !HEX_RE.test(b.hex)) {
        return json({ ok: false, error: 'Tên 1-30 ký tự và mã màu dạng #rrggbb' }, 400)
      }
      return json({ ok: true, color: await insertColor(env.DB, b.name.trim(), b.hex) })
    }
    return null
  }
  const m = /^\/api\/colors\/(\d+)$/.exec(pathname)
  if (m && req.method === 'PATCH') {
    const b = await readJson<{ name?: unknown; hex?: unknown; active?: unknown; sort?: unknown }>(req)
    if (!b || typeof b !== 'object') return json({ ok: false }, 400)
    const patch: { name?: string; hex?: string; active?: number; sort?: number } = {}
    if (b.name !== undefined) {
      if (!validName(b.name)) return json({ ok: false, error: 'Tên 1-30 ký tự' }, 400)
      patch.name = b.name.trim()
    }
    if (b.hex !== undefined) {
      if (typeof b.hex !== 'string' || !HEX_RE.test(b.hex)) return json({ ok: false, error: 'Mã màu dạng #rrggbb' }, 400)
      patch.hex = b.hex
    }
    if (b.active !== undefined) {
      if (b.active !== 0 && b.active !== 1 && typeof b.active !== 'boolean') return json({ ok: false }, 400)
      patch.active = b.active ? 1 : 0
    }
    if (b.sort !== undefined) {
      if (typeof b.sort !== 'number' || !Number.isInteger(b.sort)) return json({ ok: false }, 400)
      patch.sort = b.sort
    }
    const color = await updateColor(env.DB, Number(m[1]), patch)
    return color ? json({ ok: true, color }) : json({ ok: false }, 404)
  }
  return null
}
