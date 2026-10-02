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
