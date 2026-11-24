import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// node:sqlite còn đánh dấu thử nghiệm: bỏ cảnh báo cho output test sạch.
const origEmit = process.emitWarning
process.emitWarning = ((w: unknown, ...rest: unknown[]) => {
  const msg = typeof w === 'string' ? w : (w as Error)?.message
  if (typeof msg === 'string' && msg.includes('SQLite')) return
  return (origEmit as (...a: unknown[]) => void).call(process, w, ...rest)
}) as typeof process.emitWarning

// Nạp node:sqlite sau khi đã chặn cảnh báo (import tĩnh sẽ phát cảnh báo trước).
const { DatabaseSync } = process.getBuiltinModule('node:sqlite')

const MIGRATIONS = join(import.meta.dirname, '../../migrations')

type SqlValue = null | number | bigint | string | NodeJS.ArrayBufferView

// DB D1 giả trong bộ nhớ, đã chạy mọi migrations/*.sql.
export function createFakeD1(): D1Database {
  const db = new DatabaseSync(':memory:')
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
  }

  class Stmt {
    private args: SqlValue[] = []
    private sql: string
    constructor(sql: string) {
      this.sql = sql
    }
    bind(...args: unknown[]) {
      this.args = args.map((a) => (a === undefined ? null : a)) as SqlValue[]
      return this
    }
    async first<T = unknown>(col?: string): Promise<T | null> {
      const row = db.prepare(this.sql).get(...this.args) as Record<string, unknown> | undefined
      if (!row) return null
      return (col ? row[col] : { ...row }) as T
    }
    async all<T = unknown>() {
      const rows = db.prepare(this.sql).all(...this.args) as T[]
      return { results: rows.map((r) => ({ ...r })), success: true, meta: {} }
    }
    async run() {
      const r = db.prepare(this.sql).run(...this.args)
      return {
        success: true,
        results: [],
        meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
      }
    }
  }

  return {
    prepare: (sql: string) => new Stmt(sql),
    // D1 batch là một giao dịch: lỗi thì hoàn tác tất cả.
    async batch(stmts: Stmt[]) {
      db.exec('BEGIN')
      try {
        const out = []
        for (const s of stmts) out.push(await s.run())
        db.exec('COMMIT')
        return out
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
  } as unknown as D1Database
}
