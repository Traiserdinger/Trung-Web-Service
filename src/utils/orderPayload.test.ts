import { describe, expect, it } from 'vitest'
import type { MeshStats } from './meshAnalysis'
import { buildOrderPayload, canUpload, isValidVnPhone, validateCustomer, type CustomerInfo } from './orderPayload'
import type { PrintSettings } from './slicerEstimator'

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

describe('buildOrderPayload', () => {
  it('consult order carries reasons, null estimate and no consent/honeypot in customer', () => {
    const stats: MeshStats = {
      dims: { length: 210, width: 90, height: 40 },
      surfaceArea: 1,
      volume: 2,
      signedVolume: 2,
      isWatertight: true,
      overhangArea: 0,
      triangleCount: 12,
    }
    const settings: PrintSettings = {
      material: 'PETG',
      layerHeight: 0.2,
      infillPercent: 15,
      wallLoops: 2,
      support: false,
      quantity: 1,
    }
    const p = buildOrderPayload({
      orderCode: 'P3D-261120-AAAA',
      quote: { orderType: 'consult', consultReasons: ['Vượt khổ: 210 × 90 × 40 mm'], estimate: null, price: null },
      stats,
      settings,
      customer: { name: 'An', phone: '0913014605', email: '', note: '', consent: true, honeypot: '' },
      colorId: 3,
      fileName: 'box.stl',
      fileSize: 10,
      fileBase64: 'AAA=',
      turnstileToken: null,
      now: new Date('2026-11-20T01:00:00Z'),
    })
    expect(p.orderType).toBe('consult')
    expect(p.estimate).toBeNull()
    expect(p.colorId).toBe(3)
    expect(p.consultReasons).toEqual(['Vượt khổ: 210 × 90 × 40 mm'])
    expect(p.customer).toEqual({ name: 'An', phone: '0913014605', email: '', note: '' })
    expect(p.dims).toEqual(stats.dims)
    expect(p.createdAt).toBe('2026-11-20T01:00:00.000Z')
  })
})
