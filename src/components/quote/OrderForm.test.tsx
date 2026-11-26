import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OrderSubmitError } from '../../lib/submitOrder'
import type { MeshStats } from '../../utils/meshAnalysis'
import type { OrderMeta } from '../../utils/orderPayload'
import type { QuoteState } from '../../utils/quoteState'
import type { PrintSettings } from '../../utils/slicerEstimator'
import { DEFAULT_COLORS } from '../../config/colorConfig'
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
      color={DEFAULT_COLORS[2]}
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
    const submit = vi.fn(() => new Promise<{ orderCode: string; trackUrl: string; files: { fileNo: number; uploaded: boolean }[] }>(() => {}))
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
      .mockImplementationOnce(async (p: OrderMeta) => ({ orderCode: p.orderCode, trackUrl: '/tra-cuu?ma=' + p.orderCode, files: [{ fileNo: 1, uploaded: true }] }))
    setup(submit)
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    expect(await screen.findByText(/Không gửi được/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Họ tên/)).toHaveValue('An')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    expect(await screen.findByText(/Nhắn mã này để chốt đơn/)).toBeInTheDocument()
    const codes = submit.mock.calls.map((c) => (c[0] as OrderMeta).orderCode)
    expect(codes).toEqual([CODE, CODE])
  })

  it('records an order without the file when it is over 35 MB, for a Zalo hand-off', async () => {
    const submit = vi.fn(async (p: OrderMeta, _blobs: Map<number, Blob>) => ({ orderCode: p.orderCode, trackUrl: '/tra-cuu?ma=' + p.orderCode, files: [{ fileNo: 1, uploaded: true }] }))
    const big = file()
    Object.defineProperty(big, 'size', { value: 36 * 1024 * 1024 })
    setup(submit, big)
    expect(screen.getByText(/gửi file qua Zalo/)).toBeInTheDocument()
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const p = submit.mock.calls[0][0] as OrderMeta
    expect(p).toMatchObject({ orderCode: CODE, files: [{ fileNo: 1, fileDelivery: 'zalo' }] })
    expect(submit.mock.calls[0][1].size).toBe(0)
  })

  it('announces success in a focused status panel showing the sent code', async () => {
    setup(vi.fn(async (p: OrderMeta) => ({ orderCode: p.orderCode, trackUrl: '/tra-cuu?ma=' + p.orderCode, files: [{ fileNo: 1, uploaded: true }] })))
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(CODE)
    expect(status).toHaveFocus()
  })

  it('ties field errors to their inputs', async () => {
    setup(vi.fn())
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    const name = screen.getByLabelText(/Họ tên/)
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('Vui lòng nhập họ tên')
  })

  it('locks the close button and reports busy while sending', async () => {
    const onBusyChange = vi.fn()
    const submit = vi.fn(() => new Promise<{ orderCode: string; trackUrl: string; files: { fileNo: number; uploaded: boolean }[] }>(() => {}))
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
        .mockImplementationOnce(async (p: OrderMeta) => ({ orderCode: p.orderCode, trackUrl: '/tra-cuu?ma=' + p.orderCode, files: [{ fileNo: 1, uploaded: true }] }))
      setup(submit, file(), { turnstileSiteKey: 'site-key' })
      await fillValid()
      await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
      expect(await screen.findByText('Quá nhiều đơn')).toBeInTheDocument()
      expect(reset).toHaveBeenCalledWith('w1')
      await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
      const tokens = submit.mock.calls.map((c) => (c[0] as OrderMeta).turnstileToken)
      expect(tokens).toEqual(['tok1', 'tok2'])
    } finally {
      delete window.turnstile
    }
  })

  it('hiện màu đã chọn trong phần tóm tắt và gợi ý email mới', () => {
    setup(vi.fn())
    expect(screen.getByText('Màu: Đỏ')).toBeInTheDocument()
    expect(screen.getByText('không bắt buộc · để nhận email báo tiến độ')).toBeInTheDocument()
  })

  it('meta có colorId của màu đang chọn', async () => {
    const submit = vi.fn(async (p: OrderMeta) => ({ orderCode: p.orderCode, trackUrl: '', files: [{ fileNo: 1, uploaded: true }] }))
    setup(submit)
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(submit.mock.calls[0][0]).toMatchObject({ colorId: 3 })
  })

  it('màn hình xong có link theo dõi tiến độ', async () => {
    setup(vi.fn(async (p: OrderMeta) => ({ orderCode: p.orderCode, trackUrl: `https://site.example/tra-cuu?ma=${p.orderCode}`, files: [{ fileNo: 1, uploaded: true }] })))
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    const link = await screen.findByRole('link', { name: 'Theo dõi tiến độ đơn' })
    expect(link.getAttribute('href')).toContain(`/tra-cuu?ma=${CODE}`)
  })

  it('trackUrl tương đối hoặc thiếu → link dự phòng', async () => {
    setup(vi.fn(async (p: OrderMeta) => ({ orderCode: p.orderCode, trackUrl: '', files: [{ fileNo: 1, uploaded: true }] })))
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    const link = await screen.findByRole('link', { name: 'Theo dõi tiến độ đơn' })
    expect(link.getAttribute('href')).toBe(`/tra-cuu?ma=${CODE}`)
  })

  it('preview → hiện "Đây là bản thử, không lưu file." và không có câu Zalo', async () => {
    setup(vi.fn(async (p: OrderMeta) => ({ orderCode: p.orderCode, trackUrl: '', files: [{ fileNo: 1, uploaded: false }], preview: true })))
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    expect(await screen.findByText('Đây là bản thử, không lưu file.')).toBeInTheDocument()
    expect(screen.queryByText(/file chưa gửi được/)).not.toBeInTheDocument()
  })

  it('fileUploaded false → hiện câu gửi file qua Zalo', async () => {
    setup(vi.fn(async (p: OrderMeta) => ({ orderCode: p.orderCode, trackUrl: '', files: [{ fileNo: 1, uploaded: false }] })))
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    expect(await screen.findByText('Đơn đã được ghi nhận nhưng file chưa gửi được. Gửi file qua Zalo kèm mã này nhé.')).toBeInTheDocument()
  })
})
