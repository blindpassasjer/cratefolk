const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

type Searchable = {
  artist: string
  title: string
  label: string | null
  catno: string | null
  country: string | null
  format: string
  year: number | null
  barcode?: string | null
}

/** Every whitespace-separated word of the query must appear somewhere in the record. Accent- and case-insensitive. */
export function matchesQuery(item: Searchable, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = fold([item.artist, item.title, item.label, item.catno, item.country, item.format, item.year, item.barcode].filter(Boolean).join(' '))
  const compact = haystack.replace(/[\s-]+/g, '') // so "tplp71" finds catalog no. "TPLP 71"
  return words.every((w) => haystack.includes(w) || compact.includes(w))
}

export type SortKey = 'added' | 'artist' | 'title' | 'year-desc' | 'year-asc' | 'price'

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'added', label: 'Recently added' },
  { key: 'artist', label: 'Artist A–Z' },
  { key: 'title', label: 'Title A–Z' },
  { key: 'year-desc', label: 'Year, newest' },
  { key: 'year-asc', label: 'Year, oldest' },
  { key: 'price', label: 'Asking price' },
]

export type Filters = { format: string; decade: string; country: string }

type Sortable = Searchable & { askingPrice?: number | null }

const formatTags = (format: string) => format.split(',').map((t) => t.trim()).filter(Boolean)
const decadeOf = (year: number | null) => (year ? String(Math.floor(year / 10) * 10) : '')

/** Distinct filter values present in the given records, for populating the dropdowns. */
export function filterOptions(items: Searchable[]) {
  const formats = new Set<string>()
  const decades = new Set<string>()
  const countries = new Set<string>()
  for (const i of items) {
    formatTags(i.format).forEach((t) => formats.add(t))
    if (i.year) decades.add(decadeOf(i.year))
    if (i.country) countries.add(i.country)
  }
  return {
    formats: [...formats].sort((a, b) => a.localeCompare(b)),
    decades: [...decades].sort().reverse(),
    countries: [...countries].sort((a, b) => a.localeCompare(b)),
  }
}

export function matchesFilters(item: Searchable, f: Filters): boolean {
  if (f.format && !formatTags(item.format).includes(f.format)) return false
  if (f.decade && decadeOf(item.year) !== f.decade) return false
  if (f.country && item.country !== f.country) return false
  return true
}

/** Returns a sorted copy. 'added' keeps the server order (newest first). Missing years/prices sort last. */
export function sortItems<T extends Sortable>(items: T[], key: SortKey): T[] {
  const text = (a: string, b: string) => fold(a).localeCompare(fold(b))
  const num = (a: number | null | undefined, b: number | null | undefined, dir: 1 | -1) =>
    a == null || b == null ? (a == null ? 1 : 0) - (b == null ? 1 : 0) : (a - b) * dir
  const by: Record<SortKey, ((a: T, b: T) => number) | null> = {
    added: null,
    artist: (a, b) => text(a.artist, b.artist) || text(a.title, b.title),
    title: (a, b) => text(a.title, b.title) || text(a.artist, b.artist),
    'year-desc': (a, b) => num(a.year, b.year, -1),
    'year-asc': (a, b) => num(a.year, b.year, 1),
    price: (a, b) => num(a.askingPrice, b.askingPrice, 1),
  }
  const cmp = by[key]
  return cmp ? [...items].sort(cmp) : items
}
