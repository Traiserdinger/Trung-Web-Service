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
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM rate_hits WHERE key = ?')
    .bind(key)
    .first<{ n: number }>()
  if ((row?.n ?? 0) >= limit) return false
  await db.prepare('INSERT INTO rate_hits (key, at) VALUES (?, ?)').bind(key, now).run()
  return true
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
