export interface ColorOption {
  id: number
  name: string
  hex: string
}

/** Bốn màu seed, dùng khi chưa tải được danh sách từ máy chủ */
export const DEFAULT_COLORS: ColorOption[] = [
  { id: 1, name: 'Đen', hex: '#1f1f1f' },
  { id: 2, name: 'Trắng', hex: '#f2f2f0' },
  { id: 3, name: 'Đỏ', hex: '#c62828' },
  { id: 4, name: 'Nâu', hex: '#6d4c41' },
]
