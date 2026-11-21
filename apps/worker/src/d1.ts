import { setDriver, type Param, type RunResult, type Stmt } from '../../server/src/db.js'

const bind = (params: Param[]) => params.map((p) => (p === undefined ? null : typeof p === 'bigint' ? Number(p) : p instanceof Uint8Array ? p.slice().buffer : p))
const result = (meta: D1Meta): RunResult => ({ changes: meta.changes ?? 0, lastInsertRowid: Number(meta.last_row_id ?? 0) })

/** Cloudflare D1 is SQLite too, so the SQL is the same. The only atomic unit is `batch`, which is why the server code is written around it. */
export function useD1(d1: D1Database): void {
  const prepare = (sql: string, params: Param[]) => d1.prepare(sql).bind(...bind(params))
  setDriver({
    get: async (sql, params) => (await prepare(sql, params).first()) ?? undefined,
    all: async (sql, params) => (await prepare(sql, params).all()).results,
    run: async (sql, params) => result((await prepare(sql, params).run()).meta),
    batch: async (stmts: Stmt[]) => (await d1.batch(stmts.map((s) => prepare(s.sql, s.params)))).map((r) => result(r.meta)),
  })
}
