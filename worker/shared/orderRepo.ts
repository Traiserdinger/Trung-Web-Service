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
