import type { OrderPayload } from '../utils/orderPayload'

export class OrderSubmitError extends Error {}

export type Transport = (url: string, body: string, onProgress?: (fraction: number) => void) => Promise<string>

const NETWORK = 'Không gửi được, kiểm tra mạng và thử lại'

/** POST text/plain (không preflight CORS) tới Apps Script, có báo tiến trình upload. */
export const xhrTransport: Transport = (url, body, onProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.responseText) : reject(new Error(`HTTP ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('network'))
    xhr.ontimeout = () => reject(new Error('timeout'))
    xhr.timeout = 5 * 60 * 1000
    xhr.send(body)
  })

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
  opts: { url: string; transport?: Transport; onProgress?: (f: number) => void },
): Promise<{ orderCode: string }> {
  if (!opts.url) throw new OrderSubmitError('Chưa cấu hình nơi nhận đơn')
  const transport = opts.transport ?? xhrTransport

  let text: string
  try {
    text = await transport(opts.url, JSON.stringify(p), opts.onProgress)
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
