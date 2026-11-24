import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrackView } from '../shared/orderStatus'
import TrackPage from './TrackPage'

const view = (over: Partial<TrackView> = {}): TrackView => ({
  code: 'P3D-241124-AB12',
  createdAt: '2026-11-24T03:00:00Z',
  material: 'PETG',
  colorName: 'Đen',
  colorHex: '#1f1f1f',
  quantity: 2,
  estimateTotal: 150000,
  status: 'printing',
  events: [
    { status: 'received', note: null, at: '2026-11-24T03:00:00Z' },
    { status: 'paid', note: 'cũ', at: '2026-11-24T04:00:00Z' },
    { status: 'paid', note: '<b>x</b>\ny', at: '2026-11-24T05:30:00Z' },
    { status: 'printing', note: null, at: '2026-11-24T06:00:00Z' },
  ],
  ...over,
})

function mockFetch(body: unknown) {
  const f = vi.fn(async () => new Response(JSON.stringify(body)))
  vi.stubGlobal('fetch', f)
  return f
}

async function submit(code = 'P3D-241124-AB12', phone = '0913014605') {
  const user = userEvent.setup()
  const c = screen.getByLabelText('Mã đơn') as HTMLInputElement
  await user.clear(c)
  await user.type(c, code)
  await user.type(screen.getByLabelText('Số điện thoại'), phone)
  await user.click(screen.getByRole('button', { name: 'Tra cứu' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.pushState({}, '', '/')
})

describe('TrackPage', () => {
  it('prefills the code from ?ma=', () => {
    window.history.pushState({}, '', '/tra-cuu?ma=P3D-241124-AB12')
    render(<TrackPage />)
    expect(screen.getByLabelText('Mã đơn')).toHaveValue('P3D-241124-AB12')
    expect(screen.getByLabelText('Số điện thoại')).toHaveAttribute('type', 'tel')
  })

  it('shows passed steps with ✓, current with aria-current, upcoming not reached', async () => {
    const f = mockFetch({ ok: true, order: view() })
    render(<TrackPage />)
    await submit()
    const cur = await screen.findByText('Đang in 3D', { selector: '[aria-current="step"] *' })
    expect(cur.closest('[aria-current="step"]')).toHaveTextContent('●')
    const items = screen.getAllByRole('listitem')
    const byLabel = (l: string) => items.find((i) => within(i).queryByText(l))!
    expect(byLabel('Đã nhận đơn')).toHaveTextContent('✓')
    expect(byLabel('Đã thanh toán')).toHaveTextContent('✓')
    expect(byLabel('Hoàn tất')).toHaveTextContent('○')
    expect(byLabel('Hoàn tất')).not.toHaveAttribute('aria-current')
    expect(byLabel('Đã nhận đơn')).toHaveTextContent('24/11 10:00')
    expect(screen.getByText('150.000đ')).toBeInTheDocument()
    expect(f).toHaveBeenCalledWith('/api/track', expect.objectContaining({ method: 'POST' }))
  })

  it('renders the latest note per step as plain text', async () => {
    mockFetch({ ok: true, order: view() })
    const { container } = render(<TrackPage />)
    await submit()
    await screen.findByText('Đã thanh toán')
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText((_, el) => el?.textContent === '<b>x</b>\ny' && el.children.length === 0)).toBeInTheDocument()
    expect(screen.queryByText('cũ')).toBeNull()
  })

  it('shows the cancelled box instead of the step list', async () => {
    mockFetch({
      ok: true,
      order: view({
        status: 'cancelled',
        events: [
          { status: 'received', note: null, at: '2026-11-24T03:00:00Z' },
          { status: 'cancelled', note: 'Hết vật liệu', at: '2026-11-24T05:30:00Z' },
        ],
      }),
    })
    render(<TrackPage />)
    await submit()
    expect(await screen.findByText('Đơn đã huỷ')).toBeInTheDocument()
    expect(screen.getByText('Hết vật liệu')).toBeInTheDocument()
    expect(screen.getByText(/24\/11 12:30/)).toBeInTheDocument()
    expect(screen.queryByText('Đang giao hàng')).toBeNull()
  })

  it('shows the error in role=alert on ok:false', async () => {
    mockFetch({ ok: false, error: 'Không tìm thấy đơn.' })
    render(<TrackPage />)
    await submit()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy đơn.'))
  })

  it('shows the network error when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('x'))))
    render(<TrackPage />)
    await submit()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không gửi được, kiểm tra mạng và thử lại'))
  })
})
