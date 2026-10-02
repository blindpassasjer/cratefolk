import { X } from 'lucide-react'
import { SORTS, type Filters, type SortKey } from './search'

type Options = { formats: string[]; decades: string[]; countries: string[] }

const select = 'rounded-md border border-ink-700 bg-ink-900 py-2 pl-3 pr-2 text-sm outline-none focus:border-wax'

/** Sort + filter dropdowns. Filters only list values that exist in the current records. */
export default function FilterBar({
  sort, onSort, filters, onFilter, options, sorts = SORTS,
}: {
  sort: SortKey
  onSort: (s: SortKey) => void
  filters: Filters
  onFilter: (name: keyof Filters, value: string) => void
  options: Options
  sorts?: typeof SORTS
}) {
  const active = Object.values(filters).some(Boolean)
  const dropdown = (name: keyof Filters, label: string, values: string[], show = (v: string) => v) =>
    values.length > 0 && (
      <select aria-label={`Filter by ${label.toLowerCase()}`} value={filters[name]} onChange={(e) => onFilter(name, e.target.value)} className={`${select} ${filters[name] ? 'border-wax' : ''}`}>
        <option value="">{label}</option>
        {values.map((v) => <option key={v} value={v}>{show(v)}</option>)}
      </select>
    )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {dropdown('format', 'Format', options.formats)}
      {dropdown('decade', 'Decade', options.decades, (d) => `${d}s`)}
      {dropdown('country', 'Country', options.countries)}
      {active && (
        <button onClick={() => (Object.keys(filters) as (keyof Filters)[]).forEach((k) => onFilter(k, ''))} className="flex items-center gap-1 rounded-md px-2 py-2 text-sm text-ink-500 hover:text-ink-100">
          <X className="size-3.5" /> Clear filters
        </button>
      )}
      <label className="ml-auto flex items-center gap-2 text-sm text-ink-500">
        Sort
        <select aria-label="Sort records" value={sort} onChange={(e) => onSort(e.target.value as SortKey)} className={select}>
          {sorts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>
    </div>
  )
}
