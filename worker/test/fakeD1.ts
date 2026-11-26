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

const migrationFiles = () => readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()

// Chạy một migration theo tiền tố số (vd '0003'); dùng với createFakeD1({ upTo }).
const migrators = new WeakMap<object, (prefix: string) => void>()
export function applyMigration(d1: D1Database, prefix: string): void {
  const fn = migrators.get(d1)
  if (!fn) throw new Error('không phải DB giả')
  fn(prefix)
}

// DB D1 giả trong bộ nhớ, đã chạy mọi migrations/*.sql (hoặc đến tiền tố upTo).
export function createFakeD1(opts: { upTo?: string } = {}): D1Database {
  const db = new DatabaseSync(':memory:')
  for (const f of migrationFiles()) {
    if (opts.upTo && f.slice(0, opts.upTo.length) > opts.upTo) continue
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

  const d1 = {
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
  migrators.set(d1, (prefix) => {
    for (const f of migrationFiles()) if (f.startsWith(prefix)) db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
  })
  return d1
}
