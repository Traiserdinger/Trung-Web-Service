import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_COLORS, fetchColors } from './colors'


const respond = (body: unknown, httpOk = true) =>
  vi.fn().mockResolvedValue({ ok: httpOk, json: async () => body } as Response)

describe('fetchColors', () => {
  it('returns the colors from the API', async () => {
    const colors = [
      { id: 1, name: 'Đen', hex: '#000000' },
      { id: 2, name: 'Xanh', hex: '#0000ff' },
      { id: 3, name: 'Vàng', hex: '#ffff00' },
    ]
    const f = respond({ ok: true, colors })
    expect(await fetchColors(f)).toEqual(colors)
    expect(f).toHaveBeenCalledWith('/api/colors')
  })

  it('falls back to the defaults when fetch rejects', async () => {
    expect(await fetchColors(vi.fn().mockRejectedValue(new Error('offline')))).toEqual(DEFAULT_COLORS)
  })

  it('falls back to the defaults on an empty list, ok:false or HTTP error', async () => {
    expect(await fetchColors(respond({ ok: true, colors: [] }))).toEqual(DEFAULT_COLORS)
    expect(await fetchColors(respond({ ok: false }))).toEqual(DEFAULT_COLORS)
    expect(await fetchColors(respond({ ok: true, colors: [{ id: 1, name: 'x', hex: '#fff' }] }, false))).toEqual(DEFAULT_COLORS)
  })

  it('has the four seed colors', () => {
    expect(DEFAULT_COLORS).toEqual([
      { id: 1, name: 'Đen', hex: '#1f1f1f' },
      { id: 2, name: 'Trắng', hex: '#f2f2f0' },
      { id: 3, name: 'Đỏ', hex: '#c62828' },
      { id: 4, name: 'Nâu', hex: '#6d4c41' },
    ])
  })
})
