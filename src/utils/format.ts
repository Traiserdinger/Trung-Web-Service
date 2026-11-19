import type { Dims } from './meshAnalysis'

export function formatDuration(sec: number): string {
  const total = Math.max(1, Math.ceil(sec / 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} phút`
  return `${h} giờ ${String(m).padStart(2, '0')} phút`
}

export function formatVnd(n: number): string {
  const digits = String(Math.round(Math.abs(n)))
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${n < 0 ? '-' : ''}${grouped}đ`
}

export function formatDims(d: Dims): string {
  return `${Math.round(d.length)} × ${Math.round(d.width)} × ${Math.round(d.height)} mm`
}
