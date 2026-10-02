import { db } from './db.js'

const API = 'https://en.wikipedia.org/w/api.php'
const USER_AGENT = 'WaxCrate/0.3 (https://github.com/blindpassasjer/waxcrate)'
const TIMEOUT_MS = 10_000
const FOUND_TTL_MS = 90 * 86_400_000
const MISSING_TTL_MS = 14 * 86_400_000

export interface Trivia {
  facts: string[]
  title: string
  url: string
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const stripParens = (s: string) => s.replace(/\s*[([].*?[)\]]/g, '').trim()

async function wiki<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(API)
  for (const [k, v] of Object.entries({ action: 'query', format: 'json', formatversion: '2', ...params })) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`)
  return (await res.json()) as T
}

interface Page {
  title: string
  extract?: string
  fullurl?: string
}

// "X is a studio album by…" — the first sentence says what kind of release the article is about.
const ALBUM_LEAD = /\bis (?:an?|the) [^.]{0,120}?\b(?:album|ep|mixtape|compilation|soundtrack|lp)\b/i
const SINGLE_LEAD = /\bis (?:an?|the) [^.]{0,120}?\b(?:single|song)\b/i

/**
 * The article about this release: its title must be the release title (ignoring "(album)"), it must name the artist near the top,
 * and its first sentence must call it a record. Albums win over a single or song of the same name.
 */
async function findArticle(artist: string, title: string): Promise<Page | null> {
  const { query } = await wiki<{ query?: { pages?: Page[] } }>({
    generator: 'search',
    gsrsearch: `${stripParens(title)} ${artist} album`,
    gsrlimit: '6',
    prop: 'extracts|info',
    exintro: '1',
    explaintext: '1',
    exlimit: 'max',
    inprop: 'url',
  })
  const wantArtist = fold(stripParens(artist).replace(/^the\s+/i, '').split(/\s*(?:&|,| feat\.| and )\s*/i)[0] ?? '')
  const wantTitle = fold(stripParens(title))
  if (!wantArtist || !wantTitle) return null
  const matches = (query?.pages ?? []).filter((p) => {
    const lead = fold(p.extract ?? '').slice(0, 400)
    return fold(stripParens(p.title)) === wantTitle && lead.includes(wantArtist)
  })
  const firstSentence = (p: Page) => (p.extract ?? '').split(/(?<=\.)\s/)[0] ?? ''
  return matches.find((p) => ALBUM_LEAD.test(firstSentence(p))) ?? matches.find((p) => SINGLE_LEAD.test(firstSentence(p))) ?? null
}

const SKIP_SECTIONS = /^(track listing|personnel|credits|charts?|weekly charts|year-end charts|certifications?|sales and certifications|release history|references|external links|notes|footnotes|further reading|sources|see also|bibliography|accolades|rankings|discography|members|band members|personnel|tours?|filmography|awards and nominations|awards|videography|bibliography)\b/i
const ANAPHORA = /^(it|its|he|his|she|her|they|their|them|this|these|those|that|however|also|but|and|although|while|then|later|as|so|in addition|according)\b/i
const KEYWORDS = /\b(recorded|studio|produc\w+|copies|sold|number one|no\. ?1|chart\w*|grammy|inspired|cover|artwork|sessions?|improvis\w+|banned|controvers\w+|first|only|award\w*|spent|weeks|debut|rejected|discovered|accident\w*|mistake|reportedly)\b/gi

/** Sentences from the body of the article that read well on their own, best first. */
function pickFacts(text: string, leadFrom = 2, count = 3): string[] {
  const [lead = '', ...sections] = text.split(/\n={2,}\s*(.+?)\s*={2,}\n/)
  // split() with a capture group alternates heading, body, heading, body…
  const bodies: string[] = []
  for (let i = 0; i < sections.length; i += 2) {
    const heading = sections[i] ?? ''
    if (!SKIP_SECTIONS.test(heading)) bodies.push(sections[i + 1] ?? '')
  }
  // Don't break after abbreviations like "U.S." or "No.".
  const sentences = (s: string) => s.replace(/\s+/g, ' ').split(/(?<!\b(?:U\.S|U\.K|Mr|Mrs|Dr|St|No|vs|Jr|Sr|Inc|Co|Ltd|feat|etc|Vol|Op)\.)(?<=[.!?])\s+(?=["“A-Z])/)
  const candidates = [...bodies.flatMap(sentences), ...sentences(lead).slice(leadFrom)]

  const scored = candidates
    .map((s) => s.trim())
    .filter((s) => s.length >= 60 && s.length <= 280 && /[.!?]["”]?$/.test(s))
    .filter((s) => !ANAPHORA.test(s) && !/[[\]{}=|]/.test(s) && !/\b(Mr|Mrs|Dr|St|vs|No)\.$/.test(s))
    .map((s, i) => ({
      s,
      i,
      score: (s.match(KEYWORDS)?.length ?? 0) * 2 + (/\b(1[89]|20)\d\d\b/.test(s) ? 1 : 0) + (/\d/.test(s) ? 1 : 0),
    }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || a.i - b.i)

  // Best first, skipping near-repeats of a fact already chosen.
  const words = (s: string) => new Set(fold(s).match(/[a-z0-9]{5,}/g) ?? [])
  const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length / Math.min(a.size, b.size || 1)
  const chosen: typeof scored = []
  for (const x of scored) {
    if (chosen.length === count) break
    if (chosen.every((c) => overlap(words(c.s), words(x.s)) < 0.5)) chosen.push(x)
  }
  return chosen.sort((a, b) => a.i - b.i).map((x) => x.s)
}

const wikiUrl = (p: Page) => p.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`

async function factsFrom(page: Page, leadFrom: number): Promise<Trivia | null> {
  const { query } = await wiki<{ query?: { pages?: Page[] } }>({ prop: 'extracts', explaintext: '1', titles: page.title })
  const facts = pickFacts(query?.pages?.[0]?.extract ?? '', leadFrom)
  return facts.length ? { facts, title: page.title, url: wikiUrl(page) } : null
}

const albumLookup = async (artist: string, title: string) => {
  const page = await findArticle(artist, title)
  return page ? factsFrom(page, 2) : null
}

const ARTIST_LEAD = /\b(?:is|was|were|are) (?:an?|the) [^.]{0,160}?\b(?:band|singer|musician|rapper|duo|group|dj|producer|composer|songwriter|guitarist|pianist|vocalist|trio|quartet|ensemble|orchestra|artist|collective|project|act|saxophonist|trumpeter|drummer|bassist)\b/i

/** The article about the artist: titled with their name (ignoring "(band)") and opening by calling them a band, musician and so on. */
async function artistLookup(artist: string): Promise<Trivia | null> {
  const name = stripParens(artist)
  if (!name || /^(various|unknown|n\/a|no artist)$/i.test(name)) return null
  const { query } = await wiki<{ query?: { pages?: Page[] } }>({
    generator: 'search',
    gsrsearch: `${name} musician band`,
    gsrlimit: '6',
    prop: 'extracts|info',
    exintro: '1',
    explaintext: '1',
    exlimit: 'max',
    inprop: 'url',
  })
  const page = (query?.pages ?? []).find((p) => fold(stripParens(p.title)) === fold(name) && ARTIST_LEAD.test((p.extract ?? '').split(/(?<=\.)\s/)[0] ?? ''))
  return page ? factsFrom(page, 1) : null
}

interface CacheSpec {
  table: 'trivia' | 'artist_trivia'
  keyColumn: 'release_id' | 'artist_key'
}

const inFlight = new Map<string, Promise<Trivia | null>>()

/** Looks a result up in the cache (a stored "nothing found" counts), else asks Wikipedia and stores the answer. Network errors are not stored. */
async function cached(spec: CacheSpec, key: string | number, fetcher: () => Promise<Trivia | null>): Promise<Trivia | null> {
  const row = db.prepare(`SELECT facts, title, url, fetched_at AS fetchedAt FROM ${spec.table} WHERE ${spec.keyColumn} = ?`).get(key) as
    | { facts: string | null; title: string | null; url: string | null; fetchedAt: number }
    | undefined
  const stored = row?.facts ? ({ facts: JSON.parse(row.facts) as string[], title: row.title!, url: row.url! } satisfies Trivia) : null
  if (row && Date.now() - row.fetchedAt < (stored ? FOUND_TTL_MS : MISSING_TTL_MS)) return stored

  const flight = `${spec.table}:${key}`
  let pending = inFlight.get(flight)
  if (!pending) {
    pending = fetcher().finally(() => inFlight.delete(flight))
    inFlight.set(flight, pending)
  }
  try {
    const found = await pending
    db.prepare(`INSERT OR REPLACE INTO ${spec.table} (${spec.keyColumn}, facts, title, url, fetched_at) VALUES (?, ?, ?, ?, ?)`).run(
      key,
      found ? JSON.stringify(found.facts) : null,
      found?.title ?? null,
      found?.url ?? null,
      Date.now(),
    )
    return found
  } catch {
    return stored
  }
}

export interface ReleaseTrivia {
  /** Where the facts come from: the album's article, the artist's article, or the release's own data. */
  source: 'album' | 'artist' | 'data'
  facts: string[]
  /** The Wikipedia article, for the two Wikipedia sources. */
  title: string | null
  url: string | null
}

interface ReleaseRow {
  artist: string
  title: string
  year: number | null
  country: string | null
  label: string | null
  format: string | null
  genres: string
  styles: string
  tracklist: string
}

const seconds = (d: string) => {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(d.trim())
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
}
const json = <T>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Facts worked out from the release's own data, so every record has something to show. */
function dataFacts(r: ReleaseRow, userId: number): string[] {
  const facts: string[] = []
  const age = new Date().getFullYear() - (r.year ?? NaN)
  if (r.year) facts.push(age > 0 ? `Released in ${r.year}, this record is ${plural(age, 'year')} old.` : `Released in ${r.year}, it is brand new.`)

  const tracks = json<Array<{ title: string; duration: string }>>(r.tracklist, [])
  const timed = tracks.map((t) => ({ title: t.title, secs: seconds(t.duration) })).filter((t): t is { title: string; secs: number } => t.secs !== null && t.secs > 0)
  if (timed.length && timed.length === tracks.length) {
    const total = timed.reduce((n, t) => n + t.secs, 0)
    facts.push(`${plural(tracks.length, 'track')}, ${plural(Math.max(1, Math.round(total / 60)), 'minute')} in all.`)
    if (timed.length > 1) {
      const longest = timed.reduce((a, b) => (b.secs > a.secs ? b : a))
      facts.push(`The longest track is “${longest.title}” at ${Math.floor(longest.secs / 60)}:${String(longest.secs % 60).padStart(2, '0')}.`)
    }
  } else if (tracks.length > 1) {
    facts.push(`It has ${plural(tracks.length, 'track')}.`)
  }

  if (r.label && r.country) facts.push(`This edition came out on ${r.label} in ${r.country}.`)
  else if (r.label) facts.push(`This edition came out on ${r.label}.`)
  else if (r.country) facts.push(`This edition was released in ${r.country}.`)

  const tags = [...json<string[]>(r.genres, []).slice(0, 2), ...json<string[]>(r.styles, []).slice(0, 2)]
  if (tags.length) facts.push(`Filed under ${tags.join(', ')}.`)

  const owned = (
    db.prepare('SELECT COUNT(*) AS n FROM copies c JOIN releases x ON x.id = c.release_id WHERE c.user_id = ? AND x.artist = ? COLLATE NOCASE').get(userId, r.artist) as { n: number }
  ).n
  if (owned > 1) facts.push(`You have ${owned} records by ${r.artist} in your collection.`)

  return facts.length ? facts.slice(0, 3) : [`Nothing more is known about “${r.title}” by ${r.artist} yet.`]
}

/** Something to say about a release: its album article, else its artist's article, else facts from its own data. */
export async function triviaFor(releaseId: number, userId: number): Promise<ReleaseTrivia | null> {
  const release = db
    .prepare('SELECT artist, title, year, country, label, format, genres, styles, tracklist FROM releases WHERE id = ?')
    .get(releaseId) as ReleaseRow | undefined
  if (!release) return null

  const album = await cached({ table: 'trivia', keyColumn: 'release_id' }, releaseId, () => albumLookup(release.artist, release.title))
  if (album) return { source: 'album', ...album }

  const artist = await cached({ table: 'artist_trivia', keyColumn: 'artist_key' }, fold(stripParens(release.artist)), () => artistLookup(release.artist))
  if (artist) return { source: 'artist', ...artist }

  return { source: 'data', facts: dataFacts(release, userId), title: null, url: null }
}
