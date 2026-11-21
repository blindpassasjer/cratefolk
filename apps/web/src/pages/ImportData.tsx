import { Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, IS_DEMO } from '../api'
import { useToast } from '../notify'

// Moves the data of an existing Cratefolk (the Docker version) into this one. The SQLite file is read here in the browser and sent to the
// server in pieces, so nothing has to be installed or run anywhere. Parents before children, as the server expects.
const TABLES = [
  'users', 'releases', 'copies', 'wishlist', 'market_stats', 'collections', 'collection_copies', 'shares',
  'password_resets', 'trivia', 'artist_trivia', 'settings', 'events', 'discogs_removals',
]
const CHUNK = 100

interface Status {
  available: boolean
  state?: 'idle' | 'running' | 'done'
  empty?: boolean
  schemaVersion?: number
}

type Row = Record<string, string | number | null>

async function readDatabase(file: File, supported: number): Promise<Record<string, Row[]>> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')])
  const SQL = await initSqlJs({ locateFile: () => wasmUrl, useOldExtensionFunctions: false } as Parameters<typeof initSqlJs>[0])
  let db
  try {
    db = new SQL.Database(new Uint8Array(await file.arrayBuffer()))
    db.exec('SELECT 1 FROM sqlite_master LIMIT 1')
  } catch {
    throw new Error("That doesn't look like a Cratefolk database (cratefolk.db).")
  }
  const version = Number(db.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0)
  if (!version) throw new Error("That doesn't look like a Cratefolk database (cratefolk.db).")
  if (version > supported) throw new Error('That database is from a newer Cratefolk than this one. Update this instance first.')
  const present = new Set((db.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]?.values ?? []).map((r) => String(r[0])))
  const out: Record<string, Row[]> = {}
  for (const table of TABLES) {
    if (!present.has(table)) continue
    const res = db.exec(`SELECT * FROM "${table}"`)[0]
    out[table] = (res?.values ?? []).map((values) => Object.fromEntries(res!.columns.map((c, i) => [c, typeof values[i] === 'object' && values[i] !== null ? null : (values[i] as string | number | null)])))
  }
  db.close()
  return out
}

export default function ImportData() {
  const toast = useToast()
  const [status, setStatus] = useState<Status | null>(null)
  const [dbFile, setDbFile] = useState<File | null>(null)
  const [coverFiles, setCoverFiles] = useState<File[]>([])
  const [keyFile, setKeyFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (IS_DEMO) return
    api<Status>('/admin/import/status').then(setStatus).catch(() => setStatus(null))
  }, [])

  if (!status?.available || (!status.empty && status.state !== 'running')) return null

  async function run() {
    if (!dbFile) return
    setBusy(true)
    setError(null)
    try {
      setProgress('Reading the database…')
      const data = await readDatabase(dbFile, status?.schemaVersion ?? 0)
      const oldKey = keyFile ? (await keyFile.text()).trim() : undefined
      if (status?.state === 'running') await api('/admin/import/reset', { method: 'POST' })
      await api('/admin/import/start', { method: 'POST' })

      for (const table of TABLES) {
        const rows = data[table] ?? []
        for (let i = 0; i < rows.length; i += CHUNK) {
          setProgress(`Importing ${table.replace('_', ' ')} (${Math.min(i + CHUNK, rows.length)} of ${rows.length})…`)
          await api('/admin/import/rows', { method: 'POST', json: { table, rows: rows.slice(i, i + CHUNK), ...(table === 'users' && oldKey ? { oldKey } : {}) } })
        }
      }

      const covers = coverFiles.filter((f) => /^-?\d+\.jpg$/.test(f.name))
      let sent = 0
      const queue = [...covers]
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          for (let f; (f = queue.shift()); ) {
            await api(`/admin/import/cover/${f.name.replace('.jpg', '')}`, { method: 'PUT', body: f, headers: { 'Content-Type': 'image/jpeg' } })
            setProgress(`Uploading covers (${++sent} of ${covers.length})…`)
          }
        }),
      )

      setProgress('Finishing…')
      await api('/admin/import/finish', { method: 'POST' })
      setDone(true)
      toast.success('Import finished')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The import failed')
      setStatus((s) => (s ? { ...s, state: 'running' } : s))
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  const file = 'block w-full text-sm text-ink-300 file:mr-3 file:rounded-md file:border-0 file:bg-ink-800 file:px-3 file:py-2 file:text-sm file:text-ink-100 hover:file:bg-ink-700'

  if (done) {
    return (
      <section className="mb-6 break-inside-avoid space-y-3 rounded-xl border border-ink-800 bg-ink-900/60 p-5">
        <h2 className="font-medium">Import finished</h2>
        <p className="text-sm text-ink-300">Your data is here. Everyone has to sign in again, and you sign in with the admin email and password of this installation.</p>
        <button onClick={() => (window.location.href = '/login')} className="rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax hover:bg-wax-hover">Go to sign-in</button>
      </section>
    )
  }

  return (
    <section className="mb-6 break-inside-avoid space-y-4 rounded-xl border border-ink-800 bg-ink-900/60 p-5">
      <div className="space-y-1">
        <h2 className="font-medium">Import from another Cratefolk</h2>
        <p className="text-sm text-ink-300">
          Bring over the records, wishlists, crates, users and links of a Cratefolk you ran with Docker. Stop that container first (so the database
          file is complete), then pick the files from its <code>data</code> folder. This only works while this installation is still empty.
        </p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Database <span className="font-normal text-ink-400">(data/cratefolk.db)</span></span>
        <input type="file" accept=".db,.sqlite,.sqlite3" className={file} disabled={busy} onChange={(e) => setDbFile(e.target.files?.[0] ?? null)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Covers <span className="font-normal text-ink-400">(the data/covers folder, optional)</span></span>
        <input type="file" multiple {...{ webkitdirectory: '' }} className={file} disabled={busy} onChange={(e) => setCoverFiles([...(e.target.files ?? [])])} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Key <span className="font-normal text-ink-400">(data/secret.key, optional: keeps people's Discogs connections)</span></span>
        <input type="file" className={file} disabled={busy} onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)} />
      </label>

      {error && (
        <p className="text-sm text-danger">
          {error} {status.state === 'running' && 'Pressing Import again starts over: whatever was imported so far is cleared first.'}
        </p>
      )}
      {busy && <p className="text-sm text-ink-300">{progress}</p>}

      <button
        onClick={() => void run()}
        disabled={!dbFile || busy}
        className="inline-flex items-center gap-2 rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax hover:bg-wax-hover disabled:opacity-60"
      >
        <Upload className="size-4" /> {busy ? 'Importing…' : 'Import'}
      </button>
    </section>
  )
}
