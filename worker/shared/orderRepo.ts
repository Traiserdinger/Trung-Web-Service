// Truy cập D1 cho đơn hàng, sự kiện trạng thái và màu in.

export interface OrderRow {
  code: string
  createdAt: string
  orderType: string
  consultReasons: string | null
  customerName: string
  customerPhone: string
  customerEmail: string | null
  customerNote: string | null
  settings: string | null
  dims: string | null
  surfaceArea: number | null
  volume: number | null
  scale: number | null
  estimate: string | null
  colorId: number | null
  colorName: string | null
  colorHex: string | null
  fileName: string | null
  fileSize: number | null
  fileDelivery: string | null
  fileStatus: string | null
  driveUrl: string | null
  fingerprint: string | null
  status: string
  statusUpdatedAt: string
}

export interface ColorRow {
  id: number
  name: string
  hex: string
  active: number
}

export interface OrderEvent {
  id: number
  orderCode: string
  status: string
  note: string | null
  createdAt: string
  emailSent: number | null
}

export async function getColor(db: D1Database, id: number): Promise<ColorRow | null> {
  return db.prepare('SELECT id, name, hex, active FROM colors WHERE id = ?').bind(id).first<ColorRow>()
}

export async function listActiveColors(db: D1Database): Promise<{ id: number; name: string; hex: string }[]> {
  const { results } = await db
    .prepare('SELECT id, name, hex FROM colors WHERE active = 1 ORDER BY sort, id')
    .all<{ id: number; name: string; hex: string }>()
  return results
}

const ORDER_COLS = `code, created_at AS createdAt, order_type AS orderType, consult_reasons AS consultReasons,
  customer_name AS customerName, customer_phone AS customerPhone, customer_email AS customerEmail,
  customer_note AS customerNote, settings, dims, surface_area AS surfaceArea, volume, scale, estimate,
  color_id AS colorId, color_name AS colorName, color_hex AS colorHex, file_name AS fileName,
  file_size AS fileSize, file_delivery AS fileDelivery, file_status AS fileStatus, drive_url AS driveUrl,
  fingerprint, status, status_updated_at AS statusUpdatedAt`

export async function getOrder(db: D1Database, code: string): Promise<OrderRow | null> {
  return db.prepare(`SELECT ${ORDER_COLS} FROM orders WHERE code = ?`).bind(code).first<OrderRow>()
}

export async function insertOrder(db: D1Database, o: OrderRow): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO orders (code, created_at, order_type, consult_reasons, customer_name, customer_phone,
          customer_email, customer_note, settings, dims, surface_area, volume, scale, estimate, color_id,
          color_name, color_hex, file_name, file_size, file_delivery, file_status, drive_url, fingerprint,
          status, status_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        o.code, o.createdAt, o.orderType, o.consultReasons, o.customerName, o.customerPhone,
        o.customerEmail, o.customerNote, o.settings, o.dims, o.surfaceArea, o.volume, o.scale, o.estimate,
        o.colorId, o.colorName, o.colorHex, o.fileName, o.fileSize, o.fileDelivery, o.fileStatus,
        o.driveUrl, o.fingerprint, o.status, o.statusUpdatedAt,
      ),
    db
      .prepare(
        'INSERT INTO order_events (order_code, status, note, created_at, email_sent) VALUES (?, ?, NULL, ?, NULL)',
      )
      .bind(o.code, o.status, o.statusUpdatedAt),
  ])
}

// Đánh dấu file đã lưu Drive; true nếu có đơn đang chờ file được cập nhật.
export async function setFileSaved(db: D1Database, code: string, driveUrl: string): Promise<boolean> {
  const r = await db
    .prepare("UPDATE orders SET file_status = 'saved', drive_url = ? WHERE code = ? AND file_status = 'pending'")
    .bind(driveUrl, code)
    .run()
  return (r.meta.changes ?? 0) > 0
}

export async function listEvents(db: D1Database, code: string): Promise<OrderEvent[]> {
  const { results } = await db
    .prepare(
      `SELECT id, order_code AS orderCode, status, note, created_at AS createdAt, email_sent AS emailSent
       FROM order_events WHERE order_code = ? ORDER BY id`,
    )
    .bind(code)
    .all<OrderEvent>()
  return results
}

export interface OrderListItem {
  code: string
  createdAt: string
  orderType: string
  customerName: string
  customerPhone: string
  colorName: string | null
  colorHex: string | null
  status: string
  statusUpdatedAt: string
}

export const PAGE_SIZE = 30

// Thoát ký tự đại diện của LIKE (dùng với ESCAPE '\').
const likeOf = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

export async function listOrders(
  db: D1Database,
  f: { status?: string; q?: string; phone?: string | null; page: number },
): Promise<{ orders: OrderListItem[]; total: number }> {
  const where: string[] = []
  const args: unknown[] = []
  if (f.status) {
    where.push('status = ?')
    args.push(f.status)
  }
  if (f.q) {
    const like = likeOf(f.q)
    const terms = ['code', 'customer_phone', 'customer_name'].map((c) => `${c} LIKE ? ESCAPE '\\'`)
    args.push(like, like, like)
    if (f.phone) {
      terms.push('customer_phone = ?')
      args.push(f.phone)
    }
    where.push(`(${terms.join(' OR ')})`)
  }
  const sql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const bindArgs = args
  const total = await db.prepare(`SELECT COUNT(*) AS n FROM orders${sql}`).bind(...bindArgs).first<{ n: number }>()
  const { results } = await db
    .prepare(
      `SELECT code, created_at AS createdAt, order_type AS orderType, customer_name AS customerName,
        customer_phone AS customerPhone, color_name AS colorName, color_hex AS colorHex, status,
        status_updated_at AS statusUpdatedAt
       FROM orders${sql} ORDER BY created_at DESC, code DESC LIMIT ${PAGE_SIZE} OFFSET ${(f.page - 1) * PAGE_SIZE}`,
    )
    .bind(...bindArgs)
    .all<OrderListItem>()
  return { orders: results, total: total?.n ?? 0 }
}

// Đổi trạng thái và ghi event trong một batch; trả event vừa tạo (emailSent NULL).
export async function changeStatus(
  db: D1Database,
  code: string,
  status: string,
  note: string | null,
  at: string,
): Promise<OrderEvent> {
  const res = await db.batch([
    db.prepare('UPDATE orders SET status = ?, status_updated_at = ? WHERE code = ?').bind(status, at, code),
    db
      .prepare('INSERT INTO order_events (order_code, status, note, created_at, email_sent) VALUES (?, ?, ?, ?, NULL)')
      .bind(code, status, note, at),
  ])
  return { id: res[1].meta.last_row_id, orderCode: code, status, note, createdAt: at, emailSent: null }
}

export async function setEventEmailSent(db: D1Database, eventId: number, sent: boolean): Promise<void> {
  await db.prepare('UPDATE order_events SET email_sent = ? WHERE id = ?').bind(sent ? 1 : 0, eventId).run()
}

export async function deleteOrder(db: D1Database, code: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM order_events WHERE order_code = ?').bind(code),
    db.prepare('DELETE FROM orders WHERE code = ?').bind(code),
  ])
}

export interface AdminColor {
  id: number
  name: string
  hex: string
  sort: number
  active: number
}

export async function listAllColors(db: D1Database): Promise<AdminColor[]> {
  const { results } = await db
    .prepare('SELECT id, name, hex, sort, active FROM colors ORDER BY sort, id')
    .all<AdminColor>()
  return results
}

export async function insertColor(db: D1Database, name: string, hex: string): Promise<AdminColor> {
  const max = await db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM colors').first<{ m: number }>()
  const sort = (max?.m ?? 0) + 1
  const r = await db
    .prepare('INSERT INTO colors (name, hex, sort, active) VALUES (?, ?, ?, 1)')
    .bind(name, hex, sort)
    .run()
  return { id: r.meta.last_row_id, name, hex, sort, active: 1 }
}

// Chỉ cập nhật bảng colors: đơn cũ giữ nguyên ảnh chụp color_name/color_hex.
export async function updateColor(
  db: D1Database,
  id: number,
  p: { name?: string; hex?: string; active?: number; sort?: number },
): Promise<AdminColor | null> {
  const sets: string[] = []
  const args: unknown[] = []
  for (const k of ['name', 'hex', 'active', 'sort'] as const) {
    if (p[k] !== undefined) {
      sets.push(`${k} = ?`)
      args.push(p[k])
    }
  }
  if (sets.length) await db.prepare(`UPDATE colors SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run()
  return db.prepare('SELECT id, name, hex, sort, active FROM colors WHERE id = ?').bind(id).first<AdminColor>()
}
