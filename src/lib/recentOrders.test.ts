import { describe, expect, it, vi } from 'vitest'
import { clearRecentOrders, listRecentOrders, recentSummary, saveRecentOrder } from './recentOrders'

function memStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  } as unknown as Storage
}

describe('recent orders', () => {
  it('recent orders keep 20 newest and only code, date, summary', () => {
    const s = memStorage()
    for (let i = 1; i <= 21; i++) {
      saveRecentOrder({ code: `C${i}`, createdAt: `2026-11-${i}`, summary: `s${i}`, phone: '0913', name: 'An' } as never, s)
    }
    const list = listRecentOrders(s)
    expect(list).toHaveLength(20)
    expect(list[0].code).toBe('C21')
    expect(list[19].code).toBe('C2')
    for (const o of JSON.parse(s.getItem('recentOrders')!)) {
      expect(Object.keys(o).sort()).toEqual(['code', 'createdAt', 'summary'])
    }
  })

  it('deduplicates by code, moving it to the front', () => {
    const s = memStorage()
    saveRecentOrder({ code: 'A', createdAt: 'd1', summary: 'x' }, s)
    saveRecentOrder({ code: 'B', createdAt: 'd2', summary: 'y' }, s)
    saveRecentOrder({ code: 'A', createdAt: 'd3', summary: 'z' }, s)
    expect(listRecentOrders(s)).toEqual([
      { code: 'A', createdAt: 'd3', summary: 'z' },
      { code: 'B', createdAt: 'd2', summary: 'y' },
    ])
  })

  it('corrupt recent orders read as empty', () => {
    expect(listRecentOrders(memStorage({ recentOrders: '{nope' }))).toEqual([])
    expect(listRecentOrders(memStorage({ recentOrders: '{"a":1}' }))).toEqual([])
    expect(listRecentOrders(memStorage())).toEqual([])
  })

  it('swallows storage errors and clears', () => {
    const boom = () => {
      throw new Error('x')
    }
    const bad = { getItem: boom, setItem: boom, removeItem: boom } as unknown as Storage
    expect(() => saveRecentOrder({ code: 'A', createdAt: 'd', summary: 's' }, bad)).not.toThrow()
    expect(listRecentOrders(bad)).toEqual([])
    expect(() => clearRecentOrders(bad)).not.toThrow()
    const s = memStorage()
    saveRecentOrder({ code: 'A', createdAt: 'd', summary: 's' }, s)
    clearRecentOrders(s)
    expect(listRecentOrders(s)).toEqual([])
  })

  it('swallows a throwing localStorage getter when no storage is passed', () => {
    const spy = vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('denied')
    })
    try {
      expect(listRecentOrders()).toEqual([])
      expect(() => saveRecentOrder({ code: 'A', createdAt: 'd', summary: 's' })).not.toThrow()
      expect(() => clearRecentOrders()).not.toThrow()
    } finally {
      spy.mockRestore()
    }
  })

  it('recentSummary', () => {
    expect(recentSummary(['a.stl'])).toBe('a.stl')
    expect(recentSummary(['a.stl', 'b.stl', 'c.stl'])).toBe('a.stl +2 món')
  })
})
