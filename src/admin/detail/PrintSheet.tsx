import { formatDims, formatDuration } from '../../utils/format.ts'
import type { OrderFileRow, OrderItemRow, OrderRow } from '../adminApi.ts'
import { fileLabel, num, parseObj, vnNum } from '../format.ts'
import { sectionTitle } from '../ui/styles.ts'

const BED = 180

interface Pl {
  x: number
  y: number
  rotDeg: number
}

function parseJson(s: string | null): unknown {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function parsePlacements(s: string | null): Pl[] {
  const v = parseJson(s)
  if (!Array.isArray(v)) return []
  return v.filter((p): p is Pl => !!p && num(p.x) !== null && num(p.y) !== null && num(p.rotDeg) !== null)
}

function parseHull(s: string | null): [number, number][] {
  const v = parseJson(s)
  if (!Array.isArray(v)) return []
  return v.filter((p): p is [number, number] => Array.isArray(p) && num(p[0]) !== null && num(p[1]) !== null)
}

const safeHref = (u: string | null) => (u && u.startsWith('https://') ? u : null)

function PlateSvg({ items }: { items: OrderItemRow[] }) {
  const shapes = items.flatMap((it) => {
    const hull = parseHull(it.footprint)
    if (hull.length < 3) return []
    return parsePlacements(it.placements).map((p, i) => {
      const th = (p.rotDeg * Math.PI) / 180
      const c = Math.cos(th)
      const s = Math.sin(th)
      const pts = hull.map(([u, v]) => [p.x + u * c - v * s, BED - (p.y + u * s + v * c)] as const)
      const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length
      const cy = pts.reduce((a, q) => a + q[1], 0) / pts.length
      return { key: `${it.itemNo}-${i}`, no: it.itemNo, points: pts.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' '), cx, cy }
    })
  })
  if (shapes.length === 0) return null
  return (
    <svg viewBox={`0 0 ${BED} ${BED}`} role="img" aria-label="Sơ đồ xếp trên bàn in 180 × 180 mm" className="w-full max-w-[22rem] rounded-[10px] border border-mist bg-paper">
      <rect x="0" y="0" width={BED} height={BED} fill="none" stroke="currentColor" strokeWidth="1" className="text-slate" />
      {shapes.map((s) => (
        <g key={s.key}>
          <polygon data-hull points={s.points} className="fill-solder/20 stroke-solder" strokeWidth="0.8" />
          <text x={s.cx} y={s.cy} textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="700" className="fill-ink">
            {s.no}
          </text>
        </g>
      ))}
    </svg>
  )
}

function dimsOf(s: string): string {
  const d = parseObj(s)
  if (!d || num(d.length) === null || num(d.width) === null || num(d.height) === null) return '—'
  return formatDims({ length: num(d.length)!, width: num(d.width)!, height: num(d.height)! })
}

const th = 'px-2 py-2 text-left text-[13px] font-medium text-slate'
const td = 'px-2 py-2.5 text-[14px] align-top'

export function PrintSheet({ order, files, items }: { order: OrderRow; files: OrderFileRow[]; items: OrderItemRow[] }) {
  const s = parseObj(order.settings)
  const est = parseObj(order.estimate)
  const plate = files.find((f) => f.role === 'plate')
  const plateUrl = safeHref(plate?.driveUrl ?? null)
  const bits = [
    'BÀN IN',
    typeof s?.material === 'string' ? s.material : '?',
    `lớp ${num(s?.layerHeight) === null ? '?' : vnNum(num(s?.layerHeight)!, 2)}`,
    order.colorName ?? 'chưa chọn màu',
    num(est?.timeSec) === null ? '~?' : `~${formatDuration(num(est?.timeSec)!)}`,
    num(est?.grams) === null ? '?g' : `${vnNum(num(est?.grams)!, 0)}g`,
  ]
  return (
    <section>
      <h2 className={sectionTitle}>Phiếu in</h2>
      <p className="tnum mt-3 text-[15px] font-medium">{bits.join(' · ')}</p>
      <p className="mt-2 text-[14px]">
        {plateUrl ? (
          <a href={plateUrl} target="_blank" rel="noreferrer" className="text-solder underline underline-offset-2">
            Tải file bàn in .3mf
          </a>
        ) : (
          <span className="text-slate">Không có file bàn in</span>
        )}
      </p>
      <div className="mt-4">
        <PlateSvg items={items} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-t border-mist">
          <thead>
            <tr className="border-b border-mist">
              {['#', 'Món', 'SL', 'Đặc', 'Vỏ', 'Support', 'Kích thước', 'File'].map((h) => (
                <th key={h} scope="col" className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const f = files.find((x) => x.role === 'source' && x.fileNo === it.fileNo)
              const url = safeHref(f?.driveUrl ?? null)
              const label = f ? fileLabel(f, order.createdAt) : '—'
              return (
                <tr key={it.itemNo} className="border-b border-mist">
                  <td className={`${td} tnum`}>{it.itemNo}</td>
                  <td className={`${td} break-words`}>{it.name}</td>
                  <td className={`${td} tnum`}>{it.quantity}</td>
                  <td className={`${td} tnum`}>{it.infillPercent}%</td>
                  <td className={`${td} tnum`}>{it.wallLoops}</td>
                  <td className={td}>{it.support ? 'Có' : 'Không'}</td>
                  <td className={`${td} tnum whitespace-nowrap`}>{dimsOf(it.dims)}</td>
                  <td className={td}>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="text-solder underline underline-offset-2">
                        {f?.fileName ?? label}
                      </a>
                    ) : (
                      label
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
