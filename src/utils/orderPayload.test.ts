import { describe, expect, it } from 'vitest'
import { buildOrderMeta, canUpload, isValidVnPhone, validateCustomer, type CustomerInfo, type OrderMeta } from './orderPayload'
import type { PlateQuote } from './plateState'

const emptyCustomer: CustomerInfo = { name: '', phone: '', email: '', note: '', consent: false, honeypot: '' }

describe('isValidVnPhone', () => {
  it('accepts Vietnamese numbers with spaces, dots or +84', () => {
    for (const p of ['0913014605', '0913 014 605', '+84 913.014.605']) expect(isValidVnPhone(p)).toBe(true)
  })
  it('rejects wrong length or prefix', () => {
    for (const p of ['091301460', '1913014605', 'abc']) expect(isValidVnPhone(p)).toBe(false)
  })
})

describe('validateCustomer', () => {
  it('requires name, phone and consent but not email', () => {
    const errors = validateCustomer(emptyCustomer)
    expect(errors.name).toBe('Vui lòng nhập họ tên')
    expect(errors.phone).toBe('Số Zalo/SĐT không hợp lệ')
    expect(errors.consent).toBe('Vui lòng đồng ý để Trung liên hệ báo giá')
    expect(errors.email).toBeUndefined()
  })
  it('checks email only when given', () => {
    expect(validateCustomer({ ...emptyCustomer, email: 'abc' }).email).toBe('Email không hợp lệ')
  })
})

describe('canUpload', () => {
  it('allows up to exactly 35 MB', () => {
    expect(canUpload(35 * 1024 * 1024)).toBe(true)
    expect(canUpload(35 * 1024 * 1024 + 1)).toBe(false)
  })
})

describe('buildOrderMeta', () => {
  it('trims customer and copies estimate with separateTotal', () => {
    const files: OrderMeta['files'] = [
      { fileNo: 1, role: 'source', fileName: 'a.stl', fileSize: 10, fileType: 'stl', fileDelivery: 'upload' },
    ]
    const items: OrderMeta['items'] = []
    const quote = {
      orderType: 'quote',
      consultReasons: [],
      estimate: { grams: 12, timeSec: 3600 },
      price: { total: 50000, rangeLow: 45000, rangeHigh: 55000 },
      separateTotal: 60000,
      savings: 10000,
      fitsOnePlate: true,
    } as unknown as PlateQuote
    const m = buildOrderMeta({
      orderCode: 'P3D-261120-AAAA',
      quote,
      shared: { material: 'PETG', layerHeight: 0.2 },
      colorId: 3,
      customer: { name: '  An ', phone: '0913 014 605', email: ' a@b.vn ', note: ' hi ', consent: true, honeypot: 'x' },
      files,
      items,
      turnstileToken: 't',
      now: new Date('2026-11-20T01:00:00Z'),
    })
    expect(m.customer).toEqual({ name: 'An', phone: '0913014605', email: 'a@b.vn', note: 'hi' })
    expect(m.estimate).toEqual({ grams: 12, timeSec: 3600, total: 50000, rangeLow: 45000, rangeHigh: 55000, separateTotal: 60000 })
    expect(m).toMatchObject({ orderType: 'quote', colorId: 3, shared: { material: 'PETG', layerHeight: 0.2 }, files, items, turnstileToken: 't', honeypot: 'x', createdAt: '2026-11-20T01:00:00.000Z' })
    const consult = buildOrderMeta({
      orderCode: 'c', quote: { ...quote, orderType: 'consult', consultReasons: ['r'] } as PlateQuote,
      shared: { material: 'PETG', layerHeight: 0.2 }, colorId: 1, customer: { name: 'a', phone: '0913014605', email: '', note: '', consent: true, honeypot: '' },
      files, items, turnstileToken: null,
    })
    expect(consult.estimate).toBeNull()
    expect(consult.consultReasons).toEqual(['r'])
  })
})
