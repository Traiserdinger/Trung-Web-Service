import type { Env } from '../shared/env.ts'
import { verifyEnvelope } from '../shared/hmac.ts'
import { json, readJson } from '../shared/http.ts'
import { getOrder, setFileSaved } from '../shared/orderRepo.ts'

// Apps Script gọi về sau khi lưu file lên Drive.
export async function handleInternalFile(req: Request, env: Env): Promise<Response> {
  const verified = await verifyEnvelope(env.SHARED_SECRET, await readJson(req))
  if (!verified || verified.action !== 'fileSaved') return json({ ok: false }, 401)
  const d = verified.data as { orderCode?: unknown; fileNo?: unknown; driveUrl?: unknown; fileUrl?: unknown } | null
  if (!d || typeof d.orderCode !== 'string' || typeof d.driveUrl !== 'string') return json({ ok: false }, 400)
  // Apps Script bản cũ không gửi fileNo/fileUrl: file 1, URL file = URL thư mục.
  const fileNo = d.fileNo === undefined ? 1 : d.fileNo
  if (typeof fileNo !== 'number' || !Number.isInteger(fileNo) || fileNo < 0) return json({ ok: false }, 400)
  const fileUrl = d.fileUrl === undefined ? d.driveUrl : d.fileUrl
  if (typeof fileUrl !== 'string') return json({ ok: false }, 400)
  if (!(await getOrder(env.DB, d.orderCode))) return json({ ok: false }, 404)
  await setFileSaved(env.DB, d.orderCode, fileNo, fileUrl, d.driveUrl)
  return json({ ok: true })
}
