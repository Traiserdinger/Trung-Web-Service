import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrderSubmitError } from '../../lib/submitOrder'
import type { MeshStats } from '../../utils/meshAnalysis'
import type { OrderMeta } from '../../utils/orderPayload'
import type { PlateQuote } from '../../utils/plateState'
import { DEFAULT_COLORS } from '../../config/colorConfig'
import { OrderForm } from './OrderForm'
import type { PlateFile, PlateItem } from './usePlateItems'

const stats: MeshStats = {
  dims: { length: 10, width: 10, height: 10 },
  surfaceArea: 600,
  volume: 1000,
  signedVolume: 1000,
  isWatertight: true,
  overhangArea: 0,
  triangleCount: 12,
}
const shared = { material: 'PETG', layerHeight: 0.2 } as const
const consultQuote: PlateQuote = {
  orderType: 'consult',
  consultReasons: ['ABS'],
  estimate: null,
  price: null,
  separateTotal: null,
  savings: null,
  fitsOnePlate: true,
}
const priced = {
  orderType: 'quote',
  consultReasons: [],
  estimate: { grams: 10, timeSec: 600 },
  price: { total: 30000, rangeLow: 27000, rangeHigh: 33000 },
  separateTotal: null,
  savings: null,
  fitsOnePlate: true,
} as unknown as PlateQuote

const bytesOf = (n = 3) => new Uint8Array(n).fill(1)
function plateFile(fileNo: number, name = `part${fileNo}.stl`, size?: number): PlateFile {
  const f = new File([bytesOf()], name)
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size })
  return { fileNo, file: f, buffer: bytesOf().buffer as ArrayBuffer, fileType: name.endsWith('.3mf') ? '3mf' : 'stl' }
}
function plateItem(fileNo: number, name = `part${fileNo}.stl`, idx = 0): PlateItem {
  return {
    id: `${fileNo}-${idx}`,
    fileNo,
    name,
    source: new Float32Array(9),
    positions: new Float32Array(9),
    stats,
    scale: 1,
    orient: 'auto',
    rotated: false,
    settings: { infillPercent: 15, wallLoops: 2, support: false, quantity: 1 },
    inchDismissed: false,
  }
}
const arrangedFor = (items: PlateItem[]) => ({
  fits: true,
  placements: Object.fromEntries(items.map((it, n) => [it.id, [{ x: 20 + n * 30, y: 20, rotDeg: 0 }]])),
  hulls: Object.fromEntries(items.map((it) => [it.id, [[0, 0], [10, 0], [10, 10]] as [number, number][]])),
})

type Props = Parameters<typeof OrderForm>[0]
type Submit = NonNullable<Props['submit']>
const CODE = 'P3D-261120-ABCD'
const okResult = (p: OrderMeta) => ({
  orderCode: p.orderCode,
  trackUrl: '/tra-cuu?ma=' + p.orderCode,
  preview: false,
  files: p.files.filter((f) => f.fileDelivery === 'upload').map((f) => ({ fileNo: f.fileNo, uploaded: true })),
})

function setup(submit: unknown, extra: Partial<Props> = {}) {
  const files = [plateFile(1)]
  const items = [plateItem(1)]
  render(
    <OrderForm
      quote={priced}
      files={files}
      items={items}
      shared={shared}
      arrangement={null}
      orderCode={CODE}
      color={DEFAULT_COLORS[2]}
      onClose={vi.fn()}
      submit={submit as Submit}
      buildPlate={vi.fn(async () => bytesOf(10))}
      {...extra}
    />,
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.useRealTimers())

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
      .mockImplementationOnce(async (p: OrderMeta) => okResult(p))
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

  it('records an order without the files when the total is over 35 MB, for a Zalo hand-off', async () => {
    const submit = vi.fn(async (p: OrderMeta, _blobs: Map<number, Blob>) => okResult(p))
    setup(submit, { files: [plateFile(1, 'part.stl', 36 * 1024 * 1024)] })
    expect(screen.getByText(/gửi file qua Zalo/)).toBeInTheDocument()
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const p = submit.mock.calls[0][0] as OrderMeta
    expect(p).toMatchObject({ orderCode: CODE, files: [{ fileNo: 1, fileDelivery: 'zalo' }] })
    expect(submit.mock.calls[0][1].size).toBe(0)
  })

  it('announces success in a focused status panel showing the sent code', async () => {
    setup(vi.fn(async (p: OrderMeta) => okResult(p)))
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

  it('shows the Zalo hand-off message when a local file could not be uploaded (e.g. unreadable)', async () => {
    setup(vi.fn(async (p: OrderMeta) => ({ orderCode: p.orderCode, trackUrl: '', preview: false, files: [{ fileNo: 1, uploaded: false }] })))
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    expect(await screen.findByText(/file chưa gửi được.*Zalo/)).toBeInTheDocument()
    expect(screen.getByText('part1.stl')).toBeInTheDocument()
  })

  it('locks the close button and reports busy while sending', async () => {
    const onBusyChange = vi.fn()
    const submit = vi.fn(() => new Promise<{ orderCode: string; trackUrl: string; files: { fileNo: number; uploaded: boolean }[] }>(() => {}))
    setup(submit, { onBusyChange })
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
        .mockImplementationOnce(async (p: OrderMeta) => okResult(p))
      setup(submit, { turnstileSiteKey: 'site-key' })
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
    expect(await screen.findByText('Các file chưa gửi được, gửi qua Zalo kèm mã này:')).toBeInTheDocument()
  })

  it('sends plate file when arranged', async () => {
    const items = [plateItem(1, 'a.stl'), plateItem(2, 'b.stl')]
    const buildPlate = vi.fn(async () => bytesOf(10))
    const submit = vi.fn(async (p: OrderMeta, _b: Map<number, Blob>) => okResult(p))
    setup(submit, { files: [plateFile(1, 'a.stl'), plateFile(2, 'b.stl')], items, arrangement: arrangedFor(items), buildPlate })
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const meta = submit.mock.calls[0][0]
    expect(buildPlate).toHaveBeenCalledTimes(1)
    const parts = (buildPlate.mock.calls[0] as unknown[])[0] as { itemNo: number; name: string; placements: unknown[] }[]
    expect(parts.map((p) => p.itemNo)).toEqual([1, 2])
    expect(meta.files.map((f) => [f.fileNo, f.role, f.fileName, f.fileDelivery])).toEqual([
      [1, 'source', 'a.stl', 'upload'],
      [2, 'source', 'b.stl', 'upload'],
      [0, 'plate', 'ban-in.3mf', 'upload'],
    ])
    expect(meta.items[1]).toMatchObject({ itemNo: 2, fileNo: 2, footprint: [[0, 0], [10, 0], [10, 10]] })
    expect(meta.items[1].placements).toEqual([{ x: 50, y: 20, rotDeg: 0 }])
    expect([...submit.mock.calls[0][1].keys()].sort()).toEqual([0, 1, 2])
  })

  it('renumbers files and items 1..n', async () => {
    const items = [plateItem(3, 'c.stl'), plateItem(7, 'd.3mf', 0), plateItem(7, 'd.3mf · x', 1)]
    const submit = vi.fn(async (p: OrderMeta, _b: Map<number, Blob>) => okResult(p))
    setup(submit, { files: [plateFile(3, 'c.stl'), plateFile(7, 'd.3mf')], items })
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const meta = submit.mock.calls[0][0]
    expect(meta.files.map((f) => f.fileNo)).toEqual([1, 2])
    expect(meta.files[1].fileType).toBe('3mf')
    expect(meta.items.map((i) => [i.itemNo, i.fileNo])).toEqual([[1, 1], [2, 2], [3, 2]])
  })

  it('decimates a footprint over 32 points', async () => {
    const items = [plateItem(1)]
    const hull = Array.from({ length: 100 }, (_, i) => [i, i * 2] as [number, number])
    const submit = vi.fn(async (p: OrderMeta, _b: Map<number, Blob>) => okResult(p))
    setup(submit, { items, arrangement: { ...arrangedFor(items), hulls: { '1-0': hull } } })
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const fp = submit.mock.calls[0][0].items[0].footprint!
    expect(fp).toHaveLength(32)
    expect(fp[0]).toEqual([0, 0])
  })

  it('one-item consult uploads its source and skips the plate', async () => {
    const items = [plateItem(1)]
    const buildPlate = vi.fn(async () => bytesOf(10))
    const submit = vi.fn(async (p: OrderMeta, _b: Map<number, Blob>) => okResult(p))
    setup(submit, { quote: consultQuote, items, arrangement: arrangedFor(items), buildPlate })
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(buildPlate).not.toHaveBeenCalled()
    const meta = submit.mock.calls[0][0]
    expect(meta.files).toHaveLength(1)
    expect(meta.files[0].fileDelivery).toBe('upload')
    expect([...submit.mock.calls[0][1].keys()]).toEqual([1])
  })

  it('two-item consult is all zalo with no blobs and no plate', async () => {
    const items = [plateItem(1, 'a.stl'), plateItem(2, 'b.stl')]
    const buildPlate = vi.fn(async () => bytesOf(10))
    const submit = vi.fn(async (p: OrderMeta, _b: Map<number, Blob>) => okResult(p))
    setup(submit, { quote: consultQuote, files: [plateFile(1, 'a.stl'), plateFile(2, 'b.stl')], items, arrangement: arrangedFor(items), buildPlate })
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(buildPlate).not.toHaveBeenCalled()
    const meta = submit.mock.calls[0][0]
    expect(meta.files.map((f) => f.fileDelivery)).toEqual(['zalo', 'zalo'])
    expect(submit.mock.calls[0][1].size).toBe(0)
  })

  it('sends null placements and no plate when the arrangement is stale for the quantity', async () => {
    const items = [plateItem(1)]
    items[0].settings.quantity = 3
    const buildPlate = vi.fn(async () => bytesOf(10))
    const submit = vi.fn(async (p: OrderMeta, _b: Map<number, Blob>) => okResult(p))
    setup(submit, { items, arrangement: arrangedFor(items), buildPlate })
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(buildPlate).not.toHaveBeenCalled()
    const meta = submit.mock.calls[0][0]
    expect(meta.items[0].placements).toBeNull()
    expect(meta.files.map((f) => f.fileNo)).toEqual([1])
  })

  it('a throwing recent-orders store does not turn a recorded order into an error', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    try {
      setup(vi.fn(async (p: OrderMeta) => okResult(p)))
      await fillValid()
      await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
      expect(await screen.findByRole('status')).toHaveTextContent(CODE)
    } finally {
      spy.mockRestore()
    }
  })

  it('continues without the plate when building fails or it is over 35 MiB, without mentioning it', async () => {
    for (const buildPlate of [
      vi.fn(async (): Promise<Uint8Array> => {
        throw new Error('boom')
      }),
      vi.fn(async () => ({ byteLength: 36 * 1024 * 1024 }) as unknown as Uint8Array),
    ]) {
      const items = [plateItem(1)]
      const submit = vi.fn(async (p: OrderMeta, _b: Map<number, Blob>) => okResult(p))
      const { unmount } = render(
        <OrderForm
          quote={priced}
          files={[plateFile(1)]}
          items={items}
          shared={shared}
          arrangement={arrangedFor(items)}
          orderCode={CODE}
          color={DEFAULT_COLORS[0]}
          onClose={vi.fn()}
          submit={submit as Submit}
          buildPlate={buildPlate}
        />,
      )
      await fillValid()
      await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
      expect(submit.mock.calls[0][0].files.map((f) => f.fileNo)).toEqual([1])
      expect(await screen.findByRole('status')).not.toHaveTextContent(/ban-in|bàn in/)
      unmount()
    }
  })

  it('lists failed source files but not plate', async () => {
    const items = [plateItem(1, 'a.stl'), plateItem(2, 'b.stl')]
    const submit = vi.fn(async (p: OrderMeta) => ({
      orderCode: p.orderCode,
      trackUrl: '',
      preview: false,
      files: [
        { fileNo: 1, uploaded: true },
        { fileNo: 2, uploaded: false },
        { fileNo: 0, uploaded: false },
      ],
    }))
    setup(submit, { files: [plateFile(1, 'a.stl'), plateFile(2, 'b.stl')], items, arrangement: arrangedFor(items) })
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    expect(await screen.findByText('Các file chưa gửi được, gửi qua Zalo kèm mã này:')).toBeInTheDocument()
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('b.stl')
    expect(status).not.toHaveTextContent('a.stl')
    expect(status).not.toHaveTextContent(/ban-in|bàn in/)
  })

  it('does not list anything when only the plate failed', async () => {
    const submit = vi.fn(async (p: OrderMeta) => ({
      orderCode: p.orderCode,
      trackUrl: '',
      preview: false,
      files: [
        { fileNo: 1, uploaded: true },
        { fileNo: 0, uploaded: false },
      ],
    }))
    const items = [plateItem(1)]
    setup(submit, { items, arrangement: arrangedFor(items) })
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await screen.findByRole('status')
    expect(screen.queryByText(/chưa gửi được/)).not.toBeInTheDocument()
  })

  it('shows the count of items in the done header', async () => {
    const items = [plateItem(1, 'a.stl'), plateItem(2, 'b.stl')]
    setup(vi.fn(async (p: OrderMeta) => okResult(p)), { files: [plateFile(1, 'a.stl'), plateFile(2, 'b.stl')], items })
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    expect(await screen.findByText('Đã gửi yêu cầu cho 2 món. Mã đơn của bạn')).toBeInTheDocument()
    expect(screen.getByText('Chụp màn hình hoặc lưu mã này để tra cứu sau')).toBeInTheDocument()
  })

  it('copy code button copies', async () => {
    const writeText = vi.fn(async (_t: string) => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    setup(vi.fn(async (p: OrderMeta) => okResult(p)))
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Sao chép mã' }))
    expect(writeText).toHaveBeenCalledWith(CODE)
    expect(await screen.findByRole('button', { name: 'Đã chép' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sao chép mã' })).toBeInTheDocument(), { timeout: 3000 })
  })

  it('copy code falls back to selecting the code when the clipboard fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
      configurable: true,
    })
    setup(vi.fn(async (p: OrderMeta) => okResult(p)))
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Sao chép mã' }))
    await waitFor(() => expect(window.getSelection()?.toString()).toBe(CODE))
    expect(screen.queryByRole('button', { name: 'Đã chép' })).not.toBeInTheDocument()
  })

  it('saves recent order summary', async () => {
    const items = [plateItem(1, 'a.stl'), plateItem(2, 'b.stl')]
    setup(vi.fn(async (p: OrderMeta) => okResult(p)), { files: [plateFile(1, 'a.stl'), plateFile(2, 'b.stl')], items })
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
    await screen.findByRole('status')
    const saved = JSON.parse(localStorage.getItem('recentOrders') ?? '[]')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ code: CODE, summary: 'a.stl +1 món' })
    expect(JSON.stringify(saved)).not.toMatch(/0913|"An"/)
  })
})
