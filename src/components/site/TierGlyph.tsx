// Hình isometric nhỏ cho từng gói: bản vẽ → mạch trần → mạch có linh kiện → mạch trong vỏ.

const C = Math.cos(Math.PI / 6)
const S = 0.5
const OX = 100
const OY = 44

type P = [number, number]
const iso = (x: number, y: number, z: number): P => [OX + (x - y) * C, OY + (x + y) * S - z]
const pts = (ps: P[]) => ps.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')

interface BoxProps {
  x: number
  y: number
  z: number
  w: number
  d: number
  h: number
  top: string
  left: string
  right: string
  stroke?: string
}

function IsoBox({ x, y, z, w, d, h, top, left, right, stroke = 'none' }: BoxProps) {
  const t = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]
  const l = [iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]
  const r = [iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)]
  return (
    <g stroke={stroke} strokeWidth="0.8" strokeLinejoin="round">
      <polygon points={pts(l)} fill={left} />
      <polygon points={pts(r)} fill={right} />
      <polygon points={pts(t)} fill={top} />
    </g>
  )
}

const BOARD = { x: 0, y: 0, w: 92, d: 64 }
const GREEN = { top: '#178257', left: '#0e5c3d', right: '#0b4b32' }
const WHITE = { top: '#ffffff', left: '#e6eae7', right: '#d6ddd9' }

function Board({ z = 0 }: { z?: number }) {
  // đường đồng nhạt trên mặt mạch
  const lines: [number, number, number, number][] = [
    [10, 14, 60, 14],
    [10, 22, 44, 22],
    [60, 14, 60, 40],
    [20, 50, 80, 50],
  ]
  return (
    <g>
      <IsoBox {...BOARD} z={z} h={3} {...GREEN} />
      {lines.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={iso(x1, y1, z + 3)[0]}
          y1={iso(x1, y1, z + 3)[1]}
          x2={iso(x2, y2, z + 3)[0]}
          y2={iso(x2, y2, z + 3)[1]}
          stroke="#2c9c6c"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      ))}
    </g>
  )
}

function Parts({ z }: { z: number }) {
  return (
    <g>
      <IsoBox x={38} y={22} z={z} w={20} d={20} h={3} top="#2a2f2d" left="#161a19" right="#101312" />
      <IsoBox x={8} y={6} z={z} w={22} d={9} h={8} top="#f7f5ee" left="#dcd8cb" right="#cfcabb" />
      <IsoBox x={70} y={48} z={z} w={8} d={5} h={2} top="#c9b48a" left="#a8946b" right="#97845d" />
      <IsoBox x={14} y={44} z={z} w={6} d={4} h={2} top="#c9b48a" left="#a8946b" right="#97845d" />
      <IsoBox x={76} y={10} z={z} w={10} d={14} h={4} top="#dfe3e6" left="#b8bec2" right="#a7aeb3" />
    </g>
  )
}

export function TierGlyph({ level }: { level: 1 | 2 | 3 | 4 }) {
  return (
    <svg viewBox="0 0 200 150" className="h-auto w-full max-w-[220px]" aria-hidden="true">
      {/* bóng mềm */}
      <ellipse cx={OX} cy={OY + 82} rx="78" ry="16" fill="rgb(27 36 32 / 0.07)" />
      {level === 1 && (
        <g>
          <IsoBox x={-4} y={-4} z={0} w={100} d={72} h={1.5} {...WHITE} stroke="#cfd6d2" />
          {/* nét schematic */}
          {[
            [12, 12, 50, 12],
            [50, 12, 50, 30],
            [50, 30, 80, 30],
            [12, 40, 40, 40],
            [40, 40, 40, 56],
            [62, 46, 84, 46],
          ].map(([x1, y1, x2, y2], i) => (
            <line
              key={i}
              x1={iso(x1, y1, 1.5)[0]}
              y1={iso(x1, y1, 1.5)[1]}
              x2={iso(x2, y2, 1.5)[0]}
              y2={iso(x2, y2, 1.5)[1]}
              stroke="#5b6661"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          ))}
          <polygon points={pts([iso(56, 22, 1.5), iso(70, 22, 1.5), iso(70, 36, 1.5), iso(56, 36, 1.5)])} fill="none" stroke="#12704a" strokeWidth="1.5" />
        </g>
      )}
      {level >= 2 && level < 4 && <Board />}
      {level === 3 && <Parts z={3} />}
      {level === 4 && (
        <g>
          {/* vỏ trắng, nhìn xuyên nắp thấy mạch */}
          <IsoBox x={-8} y={-8} z={0} w={108} d={80} h={26} {...WHITE} stroke="#cfd6d2" />
          <polygon
            points={pts([iso(-3, -3, 26), iso(95, -3, 26), iso(95, 67, 26), iso(-3, 67, 26)])}
            fill="#e9efeb"
          />
          <polygon
            points={pts([iso(2, 2, 26), iso(90, 2, 26), iso(90, 62, 26), iso(2, 62, 26)])}
            fill="#2f8f66"
            opacity="0.55"
          />
          <polygon
            points={pts([iso(38, 22, 26), iso(58, 22, 26), iso(58, 42, 26), iso(38, 42, 26)])}
            fill="#1b2420"
            opacity="0.55"
          />
          {/* khe cổng USB ở vách trước */}
          <polygon
            points={pts([iso(30, 72, 7), iso(46, 72, 7), iso(46, 72, 13), iso(30, 72, 13)])}
            fill="#9aa59f"
          />
        </g>
      )}
    </svg>
  )
}
