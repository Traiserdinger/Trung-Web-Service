import { describe, expect, it } from 'vitest'
import { generateOrderCode } from './orderCode'

describe('generateOrderCode', () => {
  it('formats date and random suffix', () => {
    expect(generateOrderCode(new Date(2026, 10, 20), () => 0)).toBe('P3D-261120-AAAA')
  })

  it('default random suffix uses A-Z and 2-9', () => {
    for (let i = 0; i < 50; i++) expect(generateOrderCode()).toMatch(/^P3D-\d{6}-[A-Z2-9]{4}$/)
  })
})
