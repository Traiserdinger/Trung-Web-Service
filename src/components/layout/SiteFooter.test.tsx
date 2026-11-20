import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SiteFooter } from './SiteFooter'

describe('SiteFooter', () => {
  it('links to Zalo, phone and email from contactConfig', () => {
    render(<SiteFooter />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('https://zalo.me/0913014605')
    expect(hrefs).toContain('tel:0913014605')
    expect(hrefs).toContain('mailto:minhlaductrung@gmail.com')
  })
})
