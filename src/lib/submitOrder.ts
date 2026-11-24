import type { OrderPayload } from '../utils/orderPayload'
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

/**
 * Hai bước: (1) Worker ghi đơn và cấp vé, (2) tải file lên Apps Script bằng vé.
 * Lỗi ở bước 2 không làm hỏng đơn: trả fileUploaded=false để khách gửi file qua Zalo.
 */
export async function submitOrder(
  p: OrderPayload & { colorId: number },
  opts: { url: string; transport?: Transport; fetchFn?: typeof fetch },
): Promise<{ orderCode: string; trackUrl: string; fileUploaded: boolean }> {
  const { fileBase64, ...meta } = p
  const created = await createOrder(meta, opts.fetchFn)
  const base = { orderCode: created.orderCode, trackUrl: created.trackUrl }
  if (!created.uploadTicket || !opts.url) return { ...base, fileUploaded: false }

  const transport = opts.transport ?? fetchTransport
  try {
    const text = await transport(
      opts.url,
      JSON.stringify({
        orderCode: created.orderCode,
        uploadTicket: created.uploadTicket,
        fileName: p.fileName,
        fileSize: p.fileSize,
        fileBase64,
      }),
    )
    const res = JSON.parse(text) as { ok?: boolean }
    return { ...base, fileUploaded: res.ok === true }
  } catch {
    return { ...base, fileUploaded: false }
  }
}
