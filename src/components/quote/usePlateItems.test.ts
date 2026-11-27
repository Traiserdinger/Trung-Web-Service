import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MeshStats } from '../../utils/meshAnalysis'

const h = vi.hoisted(() => ({ parse: vi.fn(), arrange: vi.fn() }))
vi.mock('../../lib/stlWorkerClient', () => ({
  parseFileInWorker: h.parse,
  prepareInWorker: vi.fn(),
  orientInWorker: vi.fn(),
  arrangeInWorker: h.arrange,
}))

import { usePlateItems } from './usePlateItems'

const stats: MeshStats = {
  dims: { length: 10, width: 10, height: 10 },
  surfaceArea: 600,
  volume: 1000,
  signedVolume: 1000,
  isWatertight: true,
  overhangArea: 0,
  triangleCount: 12,
}
const part = (name = '') => ({ name, source: new Float32Array(9), positions: new Float32Array(9), stats, rotated: false })
const stl = (name: string) => {
  const f = new File([new Uint8Array([1])], name)
  Object.defineProperty(f, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(1)) })
  return f
}

beforeEach(() => {
  h.parse.mockReset()
  h.arrange.mockReset()
  h.arrange.mockResolvedValue({ fits: true, placements: {}, hulls: {} })
})

describe('usePlateItems.removeItem', () => {
  it('two removals in one tick keep both effects (items)', async () => {
    h.parse.mockResolvedValue([part('a'), part('b'), part('c')])
    const { result } = renderHook(() => usePlateItems())
    await act(async () => {
      await result.current.addFiles([stl('x.3mf')])
    })
    expect(result.current.items).toHaveLength(3)
    const [a, b, c] = result.current.items.map((i) => i.id)
    act(() => {
      result.current.removeItem(a)
      result.current.removeItem(b)
    })
    expect(result.current.items.map((i) => i.id)).toEqual([c])
    expect(result.current.files).toHaveLength(1)
  })

  it('two removals in one tick drop both files', async () => {
    h.parse.mockResolvedValue([part()])
    const { result } = renderHook(() => usePlateItems())
    await act(async () => {
      await result.current.addFiles([stl('a.stl'), stl('b.stl')])
    })
    expect(result.current.files).toHaveLength(2)
    const [a, b] = result.current.items.map((i) => i.id)
    act(() => {
      result.current.removeItem(a)
      result.current.removeItem(b)
    })
    expect(result.current.items).toHaveLength(0)
    expect(result.current.files).toHaveLength(0)
    await waitFor(() => expect(result.current.arranging).toBe(false))
  })
})
