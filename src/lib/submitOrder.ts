import type { OrderPayload } from '../utils/orderPayload'

export class OrderSubmitError extends Error {}

export type Transport = (url: string, body: string) => Promise<string>

const NETWORK = 'Không gửi được, kiểm tra mạng và thử lại'

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

export async function submitOrder(
  p: OrderPayload,
  opts: { url: string; transport?: Transport },
): Promise<{ orderCode: string }> {
  if (!opts.url) throw new OrderSubmitError('Chưa cấu hình nơi nhận đơn')
  const transport = opts.transport ?? fetchTransport

  let text: string
  try {
    text = await transport(opts.url, JSON.stringify(p))
  } catch {
    throw new OrderSubmitError(NETWORK)
  }

  let res: { ok?: boolean; orderCode?: string; error?: string }
  try {
    res = JSON.parse(text)
  } catch {
    throw new OrderSubmitError(NETWORK)
  }
  if (!res.ok) throw new OrderSubmitError(res.error || NETWORK)
  return { orderCode: res.orderCode ?? p.orderCode }
}
