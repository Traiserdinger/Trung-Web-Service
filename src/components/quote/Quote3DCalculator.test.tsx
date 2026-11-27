import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MeshStats } from '../../utils/meshAnalysis'
import type { OrderMeta } from '../../utils/orderPayload'

const h = vi.hoisted(() => ({ parse: vi.fn(), prepare: vi.fn(), orient: vi.fn(), arrange: vi.fn(), submit: vi.fn() }))
vi.mock('./StlViewer', () => ({ StlViewer: forwardRef(() => null) }))
vi.mock('../../lib/stlWorkerClient', () => ({
  parseFileInWorker: h.parse,
  prepareInWorker: h.prepare,
  orientInWorker: h.orient,
  arrangeInWorker: h.arrange,
}))
vi.mock('../../lib/submitOrder', async (orig) => ({
  ...(await orig<typeof import('../../lib/submitOrder')>()),
  submitOrder: h.submit,
}))

import { Quote3DCalculator } from './Quote3DCalculator'

const stats = (edge: number): MeshStats => ({
  dims: { length: edge, width: edge, height: edge },
  surfaceArea: 6 * edge * edge,
  volume: edge ** 3,
  signedVolume: edge ** 3,
  isWatertight: true,
  overhangArea: 0,
  triangleCount: 12,
})
const part = (edge: number, name = '') => ({
  name,
  source: new Float32Array(9),
  positions: new Float32Array(9),
  stats: stats(edge),
  rotated: false,
})
const parsed = (edge: number) => [part(edge)]
const mesh = (edge: number) => ({ positions: new Float32Array(9), stats: stats(edge), rotated: false })

type ArrangeIn = { itemId: string; copies: number }[]
const fitAll = async (inputs: ArrangeIn) => ({
  fits: true,
  placements: Object.fromEntries(
    inputs.map((i, n) => [
      i.itemId,
      Array.from({ length: i.copies }, (_, k) => ({ x: 20 + k * 25, y: 20 + n * 25, rotDeg: 0 })),
    ]),
  ),
  hulls: {},
})

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function stl(name: string, read?: () => Promise<ArrayBuffer>) {
  const f = new File([new Uint8Array([1, 2, 3, 4])], name)
  Object.defineProperty(f, 'arrayBuffer', { value: read ?? (() => Promise.resolve(new ArrayBuffer(4))) })
  return f
}

const pick = (container: HTMLElement, ...f: File[]) =>
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: f } })

const drop = (container: HTMLElement, ...f: File[]) =>
  fireEvent.drop(container.querySelector('input[type="file"]')!.previousElementSibling!, { dataTransfer: { files: f } })

const rows = () => within(screen.getByRole('list', { name: 'Danh sách món' })).getAllByRole('listitem')

async function fillAndSend() {
  await userEvent.type(screen.getByLabelText(/Họ tên/), 'An')
  await userEvent.type(screen.getByLabelText(/Zalo\/SĐT/), '0913014605')
  await userEvent.click(screen.getByRole('checkbox', { name: /Tôi đồng ý/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
}

beforeEach(() => {
  h.parse.mockReset()
  h.prepare.mockReset()
  h.orient.mockReset()
  h.arrange.mockReset()
  h.arrange.mockImplementation(fitAll)
  h.submit.mockReset()
})

describe('Quote3DCalculator', () => {
  it('selects the first color by default and switches to the loaded list', async () => {
    const loadColors = vi.fn().mockResolvedValue([
      { id: 7, name: 'Xanh', hex: '#0000ff' },
      { id: 8, name: 'Vàng', hex: '#ffff00' },
    ])
    render(<Quote3DCalculator loadColors={loadColors} />)
    expect(screen.getByRole('button', { name: 'Đen' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('button', { name: 'Xanh' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Đen' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Vàng' }))
    expect(screen.getByRole('button', { name: 'Vàng' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a new file that fails to parse replaces the old one and the error names it', async () => {
    h.parse.mockResolvedValueOnce(parsed(30)).mockRejectedValueOnce(new Error('File STL không hợp lệ hoặc rỗng'))
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('old-part.stl'))
    await screen.findByRole('button', { name: 'Gửi yêu cầu in' })
    await userEvent.click(screen.getByRole('button', { name: 'Đổi file' }))
    pick(container, stl('new-part.stl'))
    expect(await screen.findByText(/new-part\.stl/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi yêu cầu in' })).toBeNull()
    expect(screen.queryByText('old-part.stl')).toBeNull()
  })

  it('shows an error when the browser cannot read the picked file', async () => {
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('part.stl', () => Promise.reject(new Error('NotReadableError'))))
    expect(await screen.findByText(/Không đọc được "part\.stl"/)).toBeInTheDocument()
  })

  it('lists files in pick order when two picks finish out of order', async () => {
    const slowRead = deferred<ArrayBuffer>()
    h.parse.mockResolvedValue(parsed(20))
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('a-big.stl', () => slowRead.promise))
    pick(container, stl('b-small.stl'))
    await screen.findByText('b-small.stl')
    slowRead.resolve(new ArrayBuffer(4))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Danh sách món' })).not.toBeNull())
    const text = rows().map((r) => r.textContent)
    expect(text[0]).toContain('a-big.stl')
    expect(text[1]).toContain('b-small.stl')
  })

  it('shows the code that was actually sent when a newer file finishes loading mid-send', async () => {
    const parseB = deferred<ReturnType<typeof parsed>>()
    const send = deferred<{ orderCode: string; trackUrl: string; preview: boolean; files: { fileNo: number; uploaded: boolean }[] }>()
    h.parse.mockResolvedValueOnce(parsed(30)).mockReturnValueOnce(parseB.promise)
    h.submit.mockImplementation(() => send.promise)
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('a.stl'))
    await screen.findByText('a.stl')
    pick(container, stl('b.stl'))
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu in' }))
    await fillAndSend()
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(1))
    parseB.resolve(parsed(40))
    await screen.findByRole('list', { name: 'Danh sách món' })
    const sent = h.submit.mock.calls[0][0] as OrderMeta
    send.resolve({ orderCode: sent.orderCode, trackUrl: '', preview: false, files: [{ fileNo: 1, uploaded: true }] })
    expect(await screen.findByRole('status')).toHaveTextContent(sent.orderCode)
    expect(sent.files[0].fileName).toBe('a.stl')
  })

  it('locks the options while sending so the screen matches the order', async () => {
    const send = deferred<{ orderCode: string; trackUrl: string; preview: boolean; files: { fileNo: number; uploaded: boolean }[] }>()
    h.parse.mockResolvedValue(parsed(30))
    h.submit.mockImplementation(() => send.promise)
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('a.stl'))
    await userEvent.click(await screen.findByRole('button', { name: 'Gửi yêu cầu in' }))
    await fillAndSend()
    await waitFor(() => expect(h.submit).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /^PLA/ })).toBeDisabled()
  })

  it('starts a new order (new code) after a successful send', async () => {
    h.parse.mockResolvedValue(parsed(30))
    h.submit.mockImplementation(async (p: OrderMeta) => ({ orderCode: p.orderCode, trackUrl: '', preview: false, files: [{ fileNo: 1, uploaded: true }] }))
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('a.stl'))
    await userEvent.click(await screen.findByRole('button', { name: 'Gửi yêu cầu in' }))
    await fillAndSend()
    await screen.findByRole('status')
    await userEvent.click(screen.getByRole('button', { name: /^PLA/ }))
    expect(screen.queryByRole('status')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu in' }))
    await fillAndSend()
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(2))
    const [first, second] = h.submit.mock.calls.map((c) => c[0] as OrderMeta)
    expect(second.orderCode).not.toBe(first.orderCode)
    expect(second.shared.material).toBe('PLA')
  })

  it('records the inch rescale factor in the order', async () => {
    h.parse.mockResolvedValueOnce(parsed(2))
    h.prepare.mockResolvedValueOnce(mesh(50.8))
    h.submit.mockImplementation(async (p: OrderMeta) => ({ orderCode: p.orderCode, trackUrl: '', preview: false, files: [{ fileNo: 1, uploaded: true }] }))
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('inch.stl'))
    await userEvent.click(await screen.findByRole('button', { name: 'Đổi sang mm' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Đổi sang mm' })).toBeNull())
    expect(h.prepare.mock.calls[0][1]).toBe(25.4)
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu in' }))
    await fillAndSend()
    await waitFor(() => expect(h.submit).toHaveBeenCalled())
    expect((h.submit.mock.calls[0][0] as OrderMeta).items[0].scale).toBe(25.4)
  })

  it('dropping two stl files lists two items and shows savings', async () => {
    h.parse.mockResolvedValue(parsed(20))
    const { container } = render(<Quote3DCalculator />)
    drop(container, stl('a.stl'), stl('b.stl'))
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(await screen.findByText(/Bạn tiết kiệm/)).toBeInTheDocument()
    expect(screen.getByText(/In riêng từng món/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Thêm file' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xếp lại' })).toBeInTheDocument()
    const inputs = h.arrange.mock.calls.at(-1)![0] as ArrangeIn
    expect(inputs.map((i) => i.itemId)).toEqual(['1-0', '2-0'])
  })

  it('dropping a 3mf with three objects lists three items named from the file', async () => {
    h.parse.mockResolvedValue([part(20, 'Nắp'), part(20, '#2'), part(30, 'Thân')])
    const { container } = render(<Quote3DCalculator />)
    drop(container, stl('hop.3mf'))
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(h.parse.mock.calls[0][1]).toBe('3mf')
    const names = rows().map((r) => r.textContent)
    expect(names[0]).toContain('hop.3mf · Nắp')
    expect(names[1]).toContain('hop.3mf #2')
    expect(names[2]).toContain('hop.3mf · Thân')
  })

  it('removing an item back to one hides the list and savings', async () => {
    h.parse.mockResolvedValue(parsed(20))
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('a.stl'), stl('b.stl'))
    expect(await screen.findByText(/Bạn tiết kiệm/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Xoá b.stl' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Danh sách món' })).toBeNull())
    expect(screen.queryByText(/Bạn tiết kiệm/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Đổi file' })).toBeInTheDocument()
    expect(screen.getByText('a.stl')).toBeInTheDocument()
  })

  it("reorienting one item keeps other items' settings", async () => {
    h.parse.mockResolvedValue(parsed(20))
    h.prepare.mockResolvedValue(mesh(20))
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('a.stl'), stl('b.stl'))
    await waitFor(() => expect(rows()).toHaveLength(2))
    await userEvent.click(within(rows()[1]).getByRole('button', { name: 'b.stl' }))
    expect(screen.getByText('Áp dụng cho món đang chọn: b.stl')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '50%' }))
    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'a.stl' }))
    expect(screen.getByRole('button', { name: '15%' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Như file' }))
    await waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(1))
    expect(h.prepare.mock.calls[0][2]).toBe(false)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Như file' })).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(within(rows()[1]).getByRole('button', { name: 'b.stl' }))
    expect(screen.getByRole('button', { name: '50%' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Tự xoay' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('not fitting shows Zalo consult reason', async () => {
    h.parse.mockResolvedValue(parsed(20))
    h.arrange.mockResolvedValue({ fits: false, placements: {}, hulls: {} })
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('a.stl'), stl('b.stl'))
    expect(await screen.findByText('Không vừa một bàn in')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu tư vấn' })).toBeInTheDocument()
  })

  it('rejects .step with the new copy', async () => {
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('part.step'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Chỉ nhận file .stl hoặc .3mf. Với file STEP, hãy gửi qua Zalo.')
    expect(h.parse).not.toHaveBeenCalled()
  })
})
