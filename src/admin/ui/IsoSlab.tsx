import type { CSSProperties, ReactNode } from 'react'

interface Props {
  /** Cạnh mặt trên, px (trước khi xoay) */
  size: number
  /** Độ dày khối, px */
  height: number
  /** Màu mặt trên; hai mặt bên tự tối dần */
  color: string
  /** 'paper': tấm sáng có viền Mist */
  tone?: 'solid' | 'paper'
  /** Viền mạ vàng ENIG ở mép khối */
  enig?: boolean
  /** Mọc lên khi tải trang; số là thứ tự để trễ lần lượt */
  rise?: number
  /** Nhún nhẹ (đổi key để chạy lại) */
  bump?: boolean
  className?: string
  children?: ReactNode
}

const COS60 = 0.5
const SIN60 = 0.866

/** Kích thước khung chứa vừa hình chiếu isometric của khối (thêm chỗ cho bóng). */
function isoBox(size: number, height: number) {
  const w = size * Math.SQRT2
  return { width: Math.ceil(w + size * 0.12), height: Math.ceil(w * COS60 + height * SIN60 + size * 0.18) }
}

/** Khối hộp isometric bằng CSS 3D transform: mặt trên, hai mặt bên, bóng mềm. Chỉ để trang trí. */
export function IsoSlab({ size, height, color, tone = 'solid', enig, rise, bump, className = '', children }: Props) {
  const box = isoBox(size, height)
  const style = {
    ...box,
    '--s': `${size}px`,
    '--h': `${height}px`,
    '--c': color,
    '--i': rise ?? 0,
  } as CSSProperties
  const anim = rise !== undefined ? 'iso-rise' : bump ? 'iso-bump' : ''
  return (
    <div
      aria-hidden="true"
      className={`iso ${anim} ${className}`}
      data-tone={tone}
      data-edge={enig ? 'enig' : undefined}
      style={style}
    >
      <div className="iso-plane">
        <div className="iso-shadow" />
        <div className="iso-body">
          <div className="iso-face iso-left" />
          <div className="iso-face iso-right" />
          <div className="iso-top">{children}</div>
        </div>
      </div>
    </div>
  )
}
