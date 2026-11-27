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
      timeRatePerHour: 5000,
      minimumOrder: 20000,
      safetyMargin: 1.05,
      layerQuality: { 0.08: 1.3, 0.12: 1.2, 0.16: 1.12, 0.2: 1, 0.28: 0.9 },
    })
    expect(uiOptions.layerHeights.map((l) => l.value)).toEqual([0.08, 0.12, 0.16, 0.2, 0.28])
    for (const m of Object.values(materials)) expect(m.flowRate[0.08]).toBeGreaterThan(0)
    expect(fileLimits.uploadMaxBytes).toBe(35 * 1024 * 1024)
    expect(uiOptions.defaults.material).toBe('PETG')
  })
})
