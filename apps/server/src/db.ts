// A small async database interface with two drivers: better-sqlite3 (Docker / Node, see db.node.ts) and Cloudflare D1
// (see db.d1.ts). Everything else talks to `db` and never to a driver, so the same code runs on both.
// D1 has no interactive transactions, so the only atomic unit is `batch`: a list of statements that all apply or none do.

export type Param = string | number | bigint | null | undefined | Uint8Array
export interface RunResult {
  changes: number
  lastInsertRowid: number
}
export interface Stmt {
  sql: string
  params: Param[]
}

export interface Driver {
  get(sql: string, params: Param[]): Promise<unknown>
  all(sql: string, params: Param[]): Promise<unknown[]>
  run(sql: string, params: Param[]): Promise<RunResult>
  /** Runs the statements in order as one transaction and returns each one's result. */
  batch(stmts: Stmt[]): Promise<RunResult[]>
}

type Named = Record<string, Param>
type Args = Param[] | [Named]

/** `@name` placeholders in `sql` become positional `?`, filled from the object. Plain positional args pass through. */
function normalize(sql: string, args: Args): Stmt {
  const first = args[0]
  if (args.length === 1 && first !== null && typeof first === 'object' && !(first instanceof Uint8Array)) {
    const values = first as Named
    const params: Param[] = []
    const text = sql.replace(/@([A-Za-z_]\w*)/g, (_, name: string) => {
      if (!(name in values)) throw new Error(`Missing SQL parameter @${name}`)
      params.push(values[name])
      return '?'
    })
    return { sql: text, params }
  }
  return { sql, params: args as Param[] }
}

let driver: Driver | null = null
export function setDriver(d: Driver): void {
  driver = d
}
const active = (): Driver => {
  if (!driver) throw new Error('Database driver not set')
  return driver
}

/** A statement to hand to `db.batch`. */
export const stmt = (sql: string, ...args: Args): Stmt => normalize(sql, args)

export const db = {
  get: async <T = Record<string, unknown>>(sql: string, ...args: Args): Promise<T | undefined> => {
    const s = normalize(sql, args)
    return (await active().get(s.sql, s.params)) as T | undefined
  },
  all: async <T = Record<string, unknown>>(sql: string, ...args: Args): Promise<T[]> => {
    const s = normalize(sql, args)
    return (await active().all(s.sql, s.params)) as T[]
  },
  run: (sql: string, ...args: Args): Promise<RunResult> => {
    const s = normalize(sql, args)
    return active().run(s.sql, s.params)
  },
  batch: (stmts: Stmt[]): Promise<RunResult[]> => active().batch(stmts),
}
