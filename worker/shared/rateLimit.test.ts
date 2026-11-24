// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createFakeD1 } from '../test/fakeD1.ts'
import { hit, unhit } from './rateLimit.ts'

const NOW = 1_700_000_000_000

describe('rate limit', () => {
  it('3 lần đầu được, lần 4 bị chặn, sau cửa sổ lại được', async () => {
    const db = createFakeD1()
    for (let i = 0; i < 3; i++) expect(await hit(db, 'k', 3, 600, NOW + i)).toBe(true)
    expect(await hit(db, 'k', 3, 600, NOW + 3)).toBe(false)
    expect(await hit(db, 'k', 3, 600, NOW + 601_000)).toBe(true)
  })

  it('key khác nhau độc lập', async () => {
    const db = createFakeD1()
    for (let i = 0; i < 3; i++) await hit(db, 'a', 3, 600, NOW)
    expect(await hit(db, 'b', 3, 600, NOW)).toBe(true)
  })

  it('unhit hoàn lại lượt mới nhất', async () => {
    const db = createFakeD1()
    for (let i = 0; i < 3; i++) await hit(db, 'k', 3, 600, NOW + i)
    await unhit(db, 'k')
    expect(await hit(db, 'k', 3, 600, NOW + 10)).toBe(true)
  })
})
