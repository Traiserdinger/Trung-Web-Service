import type { OrderItemRow, OrderRow } from './orderRepo.ts'

// Port của formatMessage_ trong apps-script/Code.gs: dòng Drive đổi thành Admin, thêm dòng Màu.
const TELEGRAM_MAX = 4000

// Một dòng: bỏ xuống dòng để chữ của khách không giả được các dòng hệ thống.
function oneLine(v: unknown): string {
  return String(v ?? '').replace(/[\r\n]+/g, ' ').trim()
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function vnd(n: unknown): string {
  const v = num(n)
  if (v === null) return '?'
  return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ'
}

function duration(sec: number): string {
  const total = Math.max(1, Math.ceil(sec / 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  return h === 0 ? `${m} phút` : `${h} giờ ${m < 10 ? '0' : ''}${m} phút`
}

function parse(s: string | null): Record<string, unknown> {
  try {
    const v = s ? JSON.parse(s) : null
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function formatOwnerMessage(o: OrderRow, adminUrl: string, items: OrderItemRow[]): string {
  const s = parse(o.settings)
  const d = parse(o.dims)
  const est = o.estimate ? parse(o.estimate) : null
  const r = (v: unknown) => {
    const n = num(v)
    return n === null ? '?' : String(Math.round(n))
  }
  const r1 = (v: unknown) => {
    const n = num(v)
    return n === null ? '?' : String(n)
  }
  const lines: string[] = []

  lines.push((o.orderType === 'consult' ? '🟠 CẦN TƯ VẤN ' : '🟢 ĐƠN IN 3D ') + o.code)
  // Link admin thật đặt ngay đầu, trước mọi chữ do khách nhập
  lines.push('Admin: ' + adminUrl)
  if (o.orderType === 'consult') {
    let reasons: unknown = []
    try {
      reasons = o.consultReasons ? JSON.parse(o.consultReasons) : []
    } catch {
      reasons = []
    }
    const list = Array.isArray(reasons) ? reasons : [reasons]
    lines.push('Lý do: ' + oneLine(list.join('; ')))
  }
  lines.push(
    'Khách: ' + oneLine(o.customerName) + ', ' + oneLine(o.customerPhone) +
      (o.customerEmail ? ', ' + oneLine(o.customerEmail) : ''),
  )
  if (items.length > 0) {
    // Đơn nhiều món: thông số riêng nằm ở từng dòng món bên dưới.
    lines.push(`Nhựa ${oneLine(s.material)}, lớp ${r1(s.layerHeight)} mm`)
  } else {
    lines.push(
      `Nhựa ${oneLine(s.material)}, lớp ${r1(s.layerHeight)} mm, infill ${r1(s.infillPercent)}%, ` +
        `${r1(s.wallLoops)} tường, support ${s.support ? 'có' : 'không'}, SL ${r1(s.quantity)}`,
    )
  }
  lines.push('Màu: ' + oneLine(o.colorName))
  for (const it of items) {
    lines.push(
      `#${it.itemNo} ${oneLine(it.name)} ×${it.quantity} · đặc ${r1(it.infillPercent)}% · ${r1(it.wallLoops)} vỏ` +
        (it.support ? ' · support' : ''),
    )
  }
  if (items.length <= 1) lines.push(`Kích thước: ${r(d.length)} × ${r(d.width)} × ${r(d.height)} mm`)
  const scale = num(o.scale)
  if (scale !== null && scale !== 1) {
    lines.push('⚠ File gốc tính bằng inch: khách đã nhân ×' + String(scale).replace('.', ',') + ' khi báo giá')
  }

  if (o.orderType !== 'consult' && est) {
    const g = num(est.grams)
    const t = num(est.timeSec)
    lines.push((g === null ? '? g' : '~' + g.toFixed(1) + ' g') + ', ' + (t === null ? '?' : '~' + duration(t)))
    if (num(est.total) !== null) {
      lines.push(`Tạm tính ${vnd(est.total)} (khoảng ${vnd(est.rangeLow)}–${vnd(est.rangeHigh)})`)
    }
  }

  if (o.fileDelivery === 'zalo') {
    lines.push('📎 File lớn, khách sẽ gửi qua Zalo: ' + oneLine(o.fileName))
  } else {
    const size = num(o.fileSize)
    lines.push('File: ' + oneLine(o.fileName) + (size === null ? '' : ` (${(size / 1024 / 1024).toFixed(1)} MB)`))
  }
  if (o.customerNote) {
    // Ghi chú nhiều dòng: thụt lề để không dòng nào giả được "Admin:" hay các dòng hệ thống
    lines.push('Ghi chú:\n  ' + o.customerNote.replace(/\r?\n/g, '\n  '))
  }
  const text = lines.join('\n')
  return text.length > TELEGRAM_MAX ? text.slice(0, TELEGRAM_MAX - 1) + '…' : text
}
