// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeAssets, fakeCtx, makeEnv } from '../test/env.ts'
import worker from './index.ts'

describe('worker công khai', () => {
  beforeEach(() => {
    fakeAssets.calls.length = 0
  })

  it('GET /api/colors trả màu đang bật theo sort', async () => {
    const env = makeEnv()
    await env.DB.prepare('UPDATE colors SET active=0 WHERE id=4').run()
    const res = await worker.fetch(new Request('https://site/api/colors'), env, fakeCtx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      colors: [
        { id: 1, name: 'Đen', hex: '#1f1f1f' },
        { id: 2, name: 'Trắng', hex: '#f2f2f0' },
        { id: 3, name: 'Đỏ', hex: '#c62828' },
      ],
    })
  })

  it('đường không phải /api đi về ASSETS', async () => {
    const res = await worker.fetch(new Request('https://site/tra-cuu'), makeEnv(), fakeCtx())
    expect(fakeAssets.calls).toHaveLength(1)
    expect(await res.text()).toBe('asset')
  })

  it('/api/khong-co trả 404 JSON { ok:false }', async () => {
    const res = await worker.fetch(new Request('https://site/api/khong-co'), makeEnv(), fakeCtx())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ ok: false })
    expect(fakeAssets.calls).toHaveLength(0)
  })
})
