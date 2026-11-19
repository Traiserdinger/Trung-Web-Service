import { describe, expect, it } from 'vitest'
import { formatDims, formatDuration, formatVnd } from './format'

describe('formatDuration', () => {
  it('rounds up to minutes and pads minutes after hours', () => {
    expect(formatDuration(2700)).toBe('45 phút')
    expect(formatDuration(3900)).toBe('1 giờ 05 phút')
    expect(formatDuration(7200)).toBe('2 giờ 00 phút')
    expect(formatDuration(30)).toBe('1 phút')
  })
})

describe('formatVnd', () => {
  it('uses dots as thousand separators and the đ suffix', () => {
    expect(formatVnd(32000)).toBe('32.000đ')
    expect(formatVnd(1250000)).toBe('1.250.000đ')
  })
})

describe('formatDims', () => {
  it('rounds each side to whole millimetres', () => {
    expect(formatDims({ length: 62.4, width: 40, height: 25.6 })).toBe('62 × 40 × 26 mm')
  })
})
