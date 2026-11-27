import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ItemList, type ItemRow } from './ItemList'

const row = (id: string, name: string, edge: number, quantity = 1): ItemRow => ({
  id,
  name,
  dims: { length: edge, width: edge, height: edge },
  settings: { infillPercent: 15, wallLoops: 2, support: false, quantity },
})

describe('ItemList', () => {
  it('lists items with size, quantity and fill, marking the selected one', () => {
    render(
      <ItemList
        items={[row('1-0', 'moc-khoa.stl', 40, 2), row('2-0', 'hop.3mf · Nắp', 60)]}
        selectedId="1-0"
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    const items = within(screen.getByRole('list', { name: 'Danh sách món' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('moc-khoa.stl')
    expect(items[0]).toHaveTextContent('40 × 40 × 40 mm')
    expect(items[0]).toHaveTextContent('SL 2')
    expect(items[0]).toHaveTextContent('Đặc 15%')
    expect(items[0]).toHaveTextContent('Vỏ 2')
    expect(within(items[0]).getByRole('button', { name: 'moc-khoa.stl' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(items[1]).getByRole('button', { name: 'hop.3mf · Nắp' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports select and remove', async () => {
    const onSelect = vi.fn()
    const onRemove = vi.fn()
    render(
      <ItemList items={[row('1-0', 'a.stl', 20), row('2-0', 'b.stl', 20)]} selectedId="1-0" onSelect={onSelect} onRemove={onRemove} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'b.stl' }))
    expect(onSelect).toHaveBeenCalledWith('2-0')
    await userEvent.click(screen.getByRole('button', { name: 'Xoá a.stl' }))
    expect(onRemove).toHaveBeenCalledWith('1-0')
  })

  it('disables removal while locked', () => {
    render(<ItemList items={[row('1-0', 'a.stl', 20), row('2-0', 'b.stl', 20)]} selectedId="1-0" onSelect={vi.fn()} onRemove={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: 'Xoá a.stl' })).toBeDisabled()
  })
})
