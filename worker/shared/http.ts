export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

// Đọc body JSON có giới hạn kích thước; trả null nếu quá lớn hoặc không phải JSON.
export async function readJson<T>(req: Request, maxBytes = 64_000): Promise<T | null> {
  try {
    const text = await req.text()
    if (new TextEncoder().encode(text).length > maxBytes) return null
    return JSON.parse(text) as T
  } catch {
    return null
  }
}
