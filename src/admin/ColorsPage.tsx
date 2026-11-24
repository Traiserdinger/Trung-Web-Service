import { useEffect, useState } from 'react'
import { createColor, listColors, patchColor, type AdminColor } from './adminApi.ts'

const HEX_RE = /^#[0-9a-f]{6}$/i

export function ColorsPage() {
  const [colors, setColors] = useState<AdminColor[]>([])
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [hex, setHex] = useState('#888888')

  useEffect(() => {
    let alive = true
    listColors()
      .then((d) => alive && setColors(d.colors))
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [])

  const replace = (c: AdminColor) => setColors((prev) => prev.map((x) => (x.id === c.id ? c : x)))
  async function run(fn: () => Promise<void>, resync = false) {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
      if (resync) await listColors().then((d) => setColors(d.colors)).catch(() => {})
    }
  }

  const update = (c: AdminColor, patch: Parameters<typeof patchColor>[1]) =>
    run(async () => replace((await patchColor(c.id, patch)).color))

  // Đổi chỗ sort với màu liền kề.
  const move = (i: number, dir: -1 | 1) =>
    run(async () => {
      const a = colors[i]
      const b = colors[i + dir]
      if (!b) return
      const [ra, rb] = await Promise.all([patchColor(a.id, { sort: b.sort }), patchColor(b.id, { sort: a.sort })])
      setColors((prev) => prev.map((x) => (x.id === a.id ? ra.color : x.id === b.id ? rb.color : x)).sort((p, q) => p.sort - q.sort || p.id - q.id))
    }, true)

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const r = await createColor(name.trim(), hex)
      setColors((prev) => [...prev, r.color])
      setName('')
    })
  }
  const canAdd = name.trim().length >= 1 && name.trim().length <= 30 && HEX_RE.test(hex)

  return (
    <section className="space-y-4">
      {error && <p role="alert" className="text-alert">{error}</p>}
      <ul className="space-y-2">
        {colors.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-md bg-paper p-3 ring-1 ring-mist">
            <input type="color" value={c.hex} aria-label={`Màu ${c.name}`} onChange={(e) => void update(c, { hex: e.target.value })} />
            <span className="min-w-24 font-medium">{c.name}</span>
            <span className="tnum text-slate">{c.hex}</span>
            <label className="ml-auto flex items-center gap-2">
              <input type="checkbox" checked={c.active === 1} onChange={(e) => void update(c, { active: e.target.checked })} />
              {c.active === 1 ? 'Đang bật' : 'Đang ẩn'}
            </label>
            <button type="button" aria-label={`Đưa ${c.name} lên`} disabled={i === 0} onClick={() => void move(i, -1)} className="rounded px-2 py-1 ring-1 ring-mist disabled:opacity-40">↑</button>
            <button type="button" aria-label={`Đưa ${c.name} xuống`} disabled={i === colors.length - 1} onClick={() => void move(i, 1)} className="rounded px-2 py-1 ring-1 ring-mist disabled:opacity-40">↓</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 rounded-md bg-paper p-4 ring-1 ring-mist">
        <label className="block">
          <span className="text-slate">Tên màu</span>
          <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} className="mt-1 block rounded-md bg-fog px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-slate">Mã màu</span>
          <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} className="mt-1 block h-10" />
        </label>
        <button type="submit" disabled={!canAdd} className="rounded-md bg-solder-fill px-4 py-2 font-medium text-white disabled:opacity-50">Thêm màu</button>
      </form>
    </section>
  )
}
