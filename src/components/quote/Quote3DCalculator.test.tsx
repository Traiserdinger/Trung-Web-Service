import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MeshStats } from '../../utils/meshAnalysis'
import type { OrderPayload } from '../../utils/orderPayload'

const h = vi.hoisted(() => ({ parse: vi.fn(), submit: vi.fn() }))
vi.mock('./StlViewer', () => ({ StlViewer: forwardRef(() => null) }))
vi.mock('../../lib/stlWorkerClient', () => ({ parseStlInWorker: h.parse, orientInWorker: h.parse }))
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
const parsed = (edge: number) => ({ positions: new Float32Array(9), stats: stats(edge) })

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

const pick = (container: HTMLElement, f: File) =>
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [f] } })

async function fillAndSend() {
  await userEvent.type(screen.getByLabelText(/Họ tên/), 'An')
  await userEvent.type(screen.getByLabelText(/Zalo\/SĐT/), '0913014605')
  await userEvent.click(screen.getByRole('checkbox', { name: /Tôi đồng ý/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn' }))
}

beforeEach(() => {
  h.parse.mockReset()
  h.submit.mockReset()
})

describe('Quote3DCalculator', () => {
  it('a new file that fails to parse replaces the old one and the error names it', async () => {
    h.parse.mockResolvedValueOnce(parsed(30)).mockRejectedValueOnce(new Error('File STL không hợp lệ hoặc rỗng'))
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('old-part.stl'))
    await screen.findByRole('button', { name: 'Gửi yêu cầu in' })
    pick(container, stl('new-part.stl'))
    expect(await screen.findByText(/new-part\.stl/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi yêu cầu in' })).toBeNull()
  })

  it('shows an error when the browser cannot read the picked file', async () => {
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('part.stl', () => Promise.reject(new Error('NotReadableError'))))
    expect(await screen.findByText(/Không đọc được "part\.stl"/)).toBeInTheDocument()
  })

  it('keeps the last picked file when two picks finish out of order', async () => {
    const slowRead = deferred<ArrayBuffer>()
    h.parse.mockResolvedValue(parsed(20))
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('a-big.stl', () => slowRead.promise))
    pick(container, stl('b-small.stl'))
    await screen.findByText('b-small.stl')
    slowRead.resolve(new ArrayBuffer(4))
    await waitFor(() => expect(screen.queryByText(/Đang đọc file/)).toBeNull())
    expect(screen.queryByText('a-big.stl')).toBeNull()
  })

  it('shows the code that was actually sent when a newer file finishes loading mid-send', async () => {
    const parseB = deferred<ReturnType<typeof parsed>>()
    const send = deferred<{ orderCode: string }>()
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
    await screen.findByText('b.stl')
    const sent = h.submit.mock.calls[0][0] as OrderPayload
    send.resolve({ orderCode: sent.orderCode })
    expect(await screen.findByRole('status')).toHaveTextContent(sent.orderCode)
    expect(sent.fileName).toBe('a.stl')
  })

  it('locks the options while sending so the screen matches the order', async () => {
    const send = deferred<{ orderCode: string }>()
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
    h.submit.mockImplementation(async (p: OrderPayload) => ({ orderCode: p.orderCode }))
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
    const [first, second] = h.submit.mock.calls.map((c) => c[0] as OrderPayload)
    expect(second.orderCode).not.toBe(first.orderCode)
    expect(second.settings.material).toBe('PLA')
  })

  it('records the inch rescale factor in the order', async () => {
    h.parse
      .mockResolvedValueOnce({ positions: new Float32Array(9), stats: stats(2) })
      .mockResolvedValueOnce({ positions: new Float32Array(9), stats: stats(50.8) })
    h.submit.mockImplementation(async (p: OrderPayload) => ({ orderCode: p.orderCode }))
    const { container } = render(<Quote3DCalculator />)
    pick(container, stl('inch.stl'))
    await userEvent.click(await screen.findByRole('button', { name: 'Đổi sang mm' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Đổi sang mm' })).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu in' }))
    await fillAndSend()
    await waitFor(() => expect(h.submit).toHaveBeenCalled())
    expect((h.submit.mock.calls[0][0] as OrderPayload).scale).toBe(25.4)
  })
})
