import { describe, expect, it } from 'vitest'
import { fileLimits, materials, pricingRules, printerConfig, uiOptions } from './pricingConfig'

describe('pricingConfig', () => {
  it('holds the agreed prices, limits and defaults', () => {
    expect(materials.PETG.pricePerGram).toBe(450)
    expect(materials.ABS.contactOnly).toBe(true)
    expect(materials.TPU.flowRate[0.2]).toBe(3)
    expect(printerConfig.bed).toEqual({ x: 180, y: 180, z: 180 })
    expect(pricingRules).toMatchObject({
      freeMinutes: 30,
      blockMinutes: 30,
      pricePerBlock: 1850,
      minimumOrder: 20000,
      safetyMargin: 1.05,
    })
    expect(fileLimits.uploadMaxBytes).toBe(35 * 1024 * 1024)
    expect(uiOptions.defaults.material).toBe('PETG')
  })
})
