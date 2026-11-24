import { DEFAULT_COLORS, type ColorOption } from '../config/colorConfig'

export { DEFAULT_COLORS }
export type { ColorOption }

/** Lấy danh sách màu đang bán. Lỗi, phản hồi sai hoặc danh sách rỗng thì dùng màu mặc định. */
export async function fetchColors(fetchFn: typeof fetch = fetch): Promise<ColorOption[]> {
  try {
    const res = await fetchFn('/api/colors')
    if (!res.ok) return DEFAULT_COLORS
    const data = (await res.json()) as { ok?: boolean; colors?: ColorOption[] }
    return data.ok === true && Array.isArray(data.colors) && data.colors.length > 0 ? data.colors : DEFAULT_COLORS
  } catch {
    return DEFAULT_COLORS
  }
}
