import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OrderSubmitError } from '../../lib/submitOrder'
import type { MeshStats } from '../../utils/meshAnalysis'
import type { OrderPayload } from '../../utils/orderPayload'
import type { QuoteState } from '../../utils/quoteState'
import type { PrintSettings } from '../../utils/slicerEstimator'
import { OrderForm } from './OrderForm'

const stats: MeshStats = {
  dims: { length: 10, width: 10, height: 10 },
  surfaceArea: 600,
  volume: 1000,
  signedVolume: 1000,
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
const quote: QuoteState = { orderType: 'consult', consultReasons: ['ABS'], estimate: null, price: null }
const file = () => new File([new Uint8Array([1, 2, 3])], 'part.stl')

type Props = Parameters<typeof OrderForm>[0]
type Submit = NonNullable<Props['submit']>
const CODE = 'P3D-261120-ABCD'

function setup(submit: unknown, f: File = file(), extra: Partial<Props> = {}) {
  render(
    <OrderForm
      quote={quote}
      stats={stats}
      settings={settings}
      file={f}
      orderCode={CODE}
      onClose={vi.fn()}
      submit={submit as Submit}
      {...extra}
    />,
  )
}

async function fillValid() {
  await userEvent.type(screen.getByLabelText(/Họ tên/), 'An')
  await userEvent.type(screen.getByLabelText(/Zalo\/SĐT/), '0913014605')
  await userEvent.click(screen.getByRole('checkbox'))
}

describe('OrderForm', () => {
  it('shows validation errors and does not submit an empty form', async () => {
    const submit = vi.fn()
    setup(submit)
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    expect(screen.getByText('Vui lòng nhập họ tên')).toBeInTheDocument()
    expect(screen.getByText('Số Zalo/SĐT không hợp lệ')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng đồng ý để Trung liên hệ báo giá')).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
  })

  it('sends only once when the button is clicked twice', async () => {
    const submit = vi.fn(() => new Promise<{ orderCode: string }>(() => {}))
    setup(submit)
    await fillValid()
    const button = screen.getByRole('button', { name: 'Gửi đơn' })
    await userEvent.click(button)
    await userEvent.click(button)
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('retries with the same order code and keeps what was typed', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new OrderSubmitError('Không gửi được, kiểm tra mạng và thử lại'))
      .mockImplementationOnce(async (p: OrderPayload) => ({ orderCode: p.orderCode }))
    setup(submit)
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    expect(await screen.findByText(/Không gửi được/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Họ tên/)).toHaveValue('An')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    expect(await screen.findByText(/Nhắn mã này để chốt đơn/)).toBeInTheDocument()
    const codes = submit.mock.calls.map((c) => (c[0] as OrderPayload).orderCode)
    expect(codes).toEqual([CODE, CODE])
  })

  it('does not upload files over 35 MB and points to Zalo instead', () => {
    const submit = vi.fn()
    const big = file()
    Object.defineProperty(big, 'size', { value: 36 * 1024 * 1024 })
    setup(submit, big)
    expect(screen.getByText(/gửi file qua Zalo/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi đơn' })).not.toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
  })

  it('locks the close button and reports busy while sending', async () => {
    const onBusyChange = vi.fn()
    const submit = vi.fn(() => new Promise<{ orderCode: string }>(() => {}))
    setup(submit, file(), { onBusyChange })
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeDisabled()
    expect(onBusyChange).toHaveBeenLastCalledWith(true)
  })

  it('asks Turnstile for a fresh token before retrying', async () => {
    let callback: ((t: string) => void) | null = null
    let issued = 0
    const reset = vi.fn(() => callback?.(`tok${++issued}`))
    window.turnstile = {
      render: (_el, opts) => {
        callback = opts.callback as (t: string) => void
        callback(`tok${++issued}`)
        return 'w1'
      },
      reset,
      remove: vi.fn(),
    }
    try {
      const submit = vi
        .fn()
        .mockRejectedValueOnce(new OrderSubmitError('Quá nhiều đơn'))
        .mockImplementationOnce(async (p: OrderPayload) => ({ orderCode: p.orderCode }))
      setup(submit, file(), { turnstileSiteKey: 'site-key' })
      await fillValid()
      await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
      expect(await screen.findByText('Quá nhiều đơn')).toBeInTheDocument()
      expect(reset).toHaveBeenCalledWith('w1')
      await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
      const tokens = submit.mock.calls.map((c) => (c[0] as OrderPayload).turnstileToken)
      expect(tokens).toEqual(['tok1', 'tok2'])
    } finally {
      delete window.turnstile
    }
  })
})
