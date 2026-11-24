import { useEffect, useState } from 'react'
import { createColor, listColors, patchColor, type AdminColor } from './adminApi.ts'
import { AddColorForm } from './colors/AddColorForm.tsx'
import { ColorItem } from './colors/ColorItem.tsx'
import { useFail } from './session.ts'
import { PageHeader } from './ui/PageHeader.tsx'
import { alertCls } from './ui/styles.ts'

export function ColorsPage() {
  const [colors, setColors] = useState<AdminColor[]>([])
  const [error, setError] = useState('')
  const fail = useFail(setError)

  useEffect(() => {
    let alive = true
    listColors()
      .then((d) => alive && setColors(d.colors))
      .catch((e: Error) => alive && fail(e))
    return () => {
      alive = false
    }
  }, [fail])

  const replace = (c: AdminColor) => setColors((prev) => prev.map((x) => (x.id === c.id ? c : x)))
  async function run(fn: () => Promise<void>, resync = false) {
    setError('')
    try {
      await fn()
      return true
    } catch (e) {
      fail(e)
      if (resync) await listColors().then((d) => setColors(d.colors)).catch(() => {})
      return false
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

  const add = (name: string, hex: string) =>
    run(async () => {
      const r = await createColor(name, hex)
      setColors((prev) => [...prev, r.color])
    })

  const shown = colors.filter((c) => c.active === 1).length
  return (
    <div className="space-y-8">
      <PageHeader title="Màu nhựa" lead={colors.length ? `${shown} màu đang hiện trên trang báo giá, ${colors.length - shown} màu đang ẩn` : ' '} />
      {error && (
        <p role="alert" className={alertCls}>
          {error}
        </p>
      )}
      <ul className="grid grid-cols-1 border-t border-mist min-[480px]:grid-cols-2 sm:border-l lg:grid-cols-3 xl:grid-cols-4">
        {colors.map((c, i) => (
          <ColorItem
            key={c.id}
            c={c}
            first={i === 0}
            last={i === colors.length - 1}
            onHex={(hex) => void update(c, { hex })}
            onActive={(active) => void update(c, { active })}
            onMove={(dir) => void move(i, dir)}
          />
        ))}
      </ul>
      <AddColorForm onAdd={add} />
    </div>
  )
}
