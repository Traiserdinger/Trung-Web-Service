// Giới hạn tần suất bằng bảng D1 `rate_hits`.
// Cột `at` lưu mili giây (cùng đơn vị với `now`); `windowSec` tính bằng giây.

export async function hit(
  db: D1Database,
  key: string,
  limit: number,
  windowSec: number,
  now = Date.now(),
): Promise<boolean> {
  const cutoff = now - windowSec * 1000
  await db.prepare('DELETE FROM rate_hits WHERE key = ? AND at <= ?').bind(key, cutoff).run()
  // Một câu lệnh nguyên tử: đếm và chèn cùng lúc nên request song song không vượt giới hạn.
  const r = await db
    .prepare(
      'INSERT INTO rate_hits (key, at) SELECT ?, ? WHERE (SELECT COUNT(*) FROM rate_hits WHERE key = ? AND at > ?) < ?',
    )
    .bind(key, now, key, cutoff, limit)
    .run()
  return r.meta.changes === 1
}

// Hoàn lại lượt mới nhất của key (khi lưu đơn thất bại).
export async function unhit(db: D1Database, key: string): Promise<void> {
  await db
    .prepare(
      'DELETE FROM rate_hits WHERE rowid = (SELECT rowid FROM rate_hits WHERE key = ? ORDER BY at DESC, rowid DESC LIMIT 1)',
    )
    .bind(key)
    .run()
}

// Chỉ đọc: true nếu key đã đủ `limit` lượt trong cửa sổ (không ghi thêm lượt).
export async function isFull(
  db: D1Database,
  key: string,
  limit: number,
  windowSec: number,
  now = Date.now(),
): Promise<boolean> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM rate_hits WHERE key = ? AND at > ?')
    .bind(key, now - windowSec * 1000)
    .first<{ n: number }>()
  return (row?.n ?? 0) >= limit
}
