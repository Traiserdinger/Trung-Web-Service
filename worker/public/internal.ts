import type { Env } from '../shared/env.ts'
import { verifyEnvelope } from '../shared/hmac.ts'
import { json, readJson } from '../shared/http.ts'
import { getOrder, setFileSaved } from '../shared/orderRepo.ts'

// Apps Script gọi về sau khi lưu file lên Drive.
export async function handleInternalFile(req: Request, env: Env): Promise<Response> {
  const verified = await verifyEnvelope(env.SHARED_SECRET, await readJson(req))
  if (!verified || verified.action !== 'fileSaved') return json({ ok: false }, 401)
  const d = verified.data as { orderCode?: unknown; driveUrl?: unknown } | null
  if (!d || typeof d.orderCode !== 'string' || typeof d.driveUrl !== 'string') return json({ ok: false }, 400)
  if (!(await getOrder(env.DB, d.orderCode))) return json({ ok: false }, 404)
  // Tạm thời (Task 8): chưa có fileNo → file 1, URL thư mục = URL file.
  await setFileSaved(env.DB, d.orderCode, 1, d.driveUrl, d.driveUrl)
  return json({ ok: true })
}
