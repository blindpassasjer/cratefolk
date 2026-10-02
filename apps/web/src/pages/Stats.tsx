import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Counted, type Stats as StatsData } from '../api'
import Cover from '../Cover'
import { money } from '../Market'

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`space-y-3 rounded-xl border border-ink-800 bg-ink-900/60 p-5 ${className}`}>
      <h2 className="text-sm font-medium text-ink-300">{title}</h2>
      {children}
    </section>
  )
}

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-4">
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-sm text-ink-500">{label}</div>
      {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
    </div>
  )
}

/** Horizontal bars, longest first as given. */
function Bars({ items }: { items: Counted[] }) {
  if (!items.length) return <p className="text-sm text-ink-500">Nothing to show yet.</p>
  const max = Math.max(...items.map((i) => i.count))
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-ink-300" title={i.label}>{i.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-ink-800">
            <span className="block h-full rounded-full bg-wax" style={{ width: `${Math.max(3, (i.count / max) * 100)}%` }} />
          </span>
          <span className="tabular-nums text-ink-500">{i.count}</span>
        </li>
      ))}
    </ul>
  )
}

/** Vertical columns in the given (chronological) order. */
function Columns({ items, show }: { items: Counted[]; show: (label: string) => string }) {
  const max = Math.max(1, ...items.map((i) => i.count))
  return (
    <div className="flex h-36 items-end gap-1.5">
      {items.map((i) => (
        <div key={i.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${show(i.label)}: ${i.count}`}>
          <span className="text-[10px] tabular-nums text-ink-500">{i.count || ''}</span>
          <span className="w-full rounded-t bg-wax" style={{ height: `${(i.count / max) * 100}%`, minHeight: i.count ? 3 : 1, opacity: i.count ? 1 : 0.25 }} />
          <span className="w-full truncate text-center text-[10px] text-ink-500">{show(i.label)}</span>
        </div>
      ))}
    </div>
  )
}

const monthName = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleString(undefined, { month: 'short', timeZone: 'UTC' })

export default function Stats() {
  const [data, setData] = useState<StatsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<StatsData>('/stats').then(setData).catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="text-sm text-danger">{error}</p>
  if (!data) return null

  if (data.copies === 0) {
    return (
      <div className="space-y-2 py-24 text-center">
        <h1 className="text-xl font-semibold">No stats yet</h1>
        <p className="text-sm text-ink-500">Add some records to your collection and your numbers show up here.</p>
      </div>
    )
  }

  const { value } = data
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={data.copies === 1 ? 'record' : 'records'} value={data.copies} hint={data.releases !== data.copies ? `${data.releases} different pressings` : undefined} />
        <Tile label="on your wishlist" value={data.wishlist} />
        <Tile label="for sale" value={data.forSale} hint={data.forSaleValue.map((v) => money(v.total, v.currency)).join(' + ') || undefined} />
        <Tile
          label="est. marketplace value"
          value={value.pricedReleases ? money(value.estimated, value.currency) : '—'}
          hint={
            value.pricedReleases
              ? `Lowest Discogs listings, for ${value.pricedReleases} of ${value.totalReleases} pressings with a price`
              : 'Appears once Discogs prices have been looked up for your records'
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Added in the last 12 months">
          <Columns items={data.addedByMonth} show={monthName} />
        </Card>
        <Card title="By decade">
          {data.byDecade.length ? <Columns items={data.byDecade} show={(l) => l.replace(/^(\d{2})(\d{2})s$/, "'$2s")} /> : <p className="text-sm text-ink-500">No release years on your records.</p>}
        </Card>
        <Card title="Formats"><Bars items={data.byFormat} /></Card>
        <Card title="Genres"><Bars items={data.byGenre} /></Card>
        <Card title="Top artists"><Bars items={data.topArtists} /></Card>
        <Card title="Top labels"><Bars items={data.topLabels} /></Card>
        <Card title="Countries"><Bars items={data.byCountry} /></Card>
        <Card title="Recently added">
          <div className="grid grid-cols-3 gap-3">
            {data.recent.map((r, i) => (
              <Link key={`${r.releaseId}-${i}`} to={`/release/${r.releaseId}`} className="group block min-w-0">
                <Cover releaseId={r.releaseId} hasCover={!!r.hasCover} className="rounded-md ring-1 ring-ink-800 transition group-hover:ring-wax/60" />
                <div className="mt-1.5 truncate text-xs font-medium">{r.title}</div>
                <div className="truncate text-xs text-ink-500">{r.artist}</div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
