import type { OrderMeta, OrderMetaFile } from '../utils/orderPayload'
import { createOrder } from './api'

export class OrderSubmitError extends Error {}

export type Transport = (url: string, body: string) => Promise<string>


/**
 * POST text/plain tới Apps Script bằng fetch.
 *
 * Phải là "simple request": chỉ Content-Type text/plain, không header tuỳ biến,
 * không theo dõi tiến trình upload (XHR upload listener cũng ép preflight).
 * Apps Script không trả lời OPTIONS, nên mọi preflight đều làm đơn thất bại.
 */
export const fetchTransport: Transport = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

export function fileToBase64(f: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(f)
  })
}

/** Tải một file lên Apps Script; mọi lỗi (mạng, đọc file, JSON hỏng, ok:false) đều thành false. */
async function uploadOne(
  transport: Transport,
  url: string,
  orderCode: string,
  f: OrderMetaFile,
  ticket: string,
  blob: Blob,
): Promise<boolean> {
  try {
    const text = await transport(
      url,
      JSON.stringify({
        orderCode,
        fileNo: f.fileNo,
        uploadTicket: ticket,
        fileName: f.fileName,
        fileSize: f.fileSize,
        fileBase64: await fileToBase64(blob),
      }),
    )
    return (JSON.parse(text) as { ok?: boolean }).ok === true
  } catch {
    return false
  }
}

/**
 * Hai bước: (1) Worker ghi đơn và cấp vé từng file, (2) tải lần lượt từng file lên Apps Script:
 * file nguồn theo `fileNo` tăng dần, file bàn in (0) sau cùng. Một file lỗi không dừng các file sau;
 * đơn vẫn được ghi để khách gửi phần còn thiếu qua Zalo.
 */
export async function submitOrder(
  meta: OrderMeta,
  blobs: Map<number, Blob>,
  opts: { url: string; transport?: Transport; fetchFn?: typeof fetch },
): Promise<{ orderCode: string; trackUrl: string; preview: boolean; files: { fileNo: number; uploaded: boolean }[] }> {
  const created = await createOrder(meta, opts.fetchFn)
  const transport = opts.transport ?? fetchTransport
  const tickets = new Map(created.uploads.map((u) => [u.fileNo, u.ticket]))
  const order = meta.files
    .filter((f) => f.fileDelivery === 'upload')
    .sort((a, b) => (a.fileNo === 0 ? 1 : b.fileNo === 0 ? -1 : a.fileNo - b.fileNo))

  const files: { fileNo: number; uploaded: boolean }[] = []
  for (const f of order) {
    const ticket = tickets.get(f.fileNo)
    const blob = blobs.get(f.fileNo)
    let uploaded: boolean
    // Gửi lại đơn cũ mà file đã lưu rồi: không có vé, không tải lại, không báo lỗi giả.
    if (!ticket && created.fileStatus === 'saved') uploaded = true
    else if (!ticket || !blob || !opts.url) uploaded = false
    else uploaded = await uploadOne(transport, opts.url, created.orderCode, f, ticket, blob)
    files.push({ fileNo: f.fileNo, uploaded })
  }
  return { orderCode: created.orderCode, trackUrl: created.trackUrl, preview: created.preview, files }
}
