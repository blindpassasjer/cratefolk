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

const SKIP_SECTIONS = /^(track listing|personnel|credits|charts?|weekly charts|year-end charts|certifications?|sales and certifications|release history|references|external links|notes|footnotes|further reading|sources|see also|bibliography|accolades|rankings)\b/i
const ANAPHORA = /^(it|its|he|his|she|her|they|their|them|this|these|those|that|however|also|but|and|although|while|then|later|as|so|in addition|according)\b/i
const KEYWORDS = /\b(recorded|studio|produc\w+|copies|sold|number one|no\. ?1|chart\w*|grammy|inspired|cover|artwork|sessions?|improvis\w+|banned|controvers\w+|first|only|award\w*|spent|weeks|debut|rejected|discovered|accident\w*|mistake|reportedly)\b/gi

/** Sentences from the body of the article that read well on their own, best first. */
function pickFacts(text: string, count = 3): string[] {
  const [lead = '', ...sections] = text.split(/\n={2,}\s*(.+?)\s*={2,}\n/)
  // split() with a capture group alternates heading, body, heading, body…
  const bodies: string[] = []
  for (let i = 0; i < sections.length; i += 2) {
    const heading = sections[i] ?? ''
    if (!SKIP_SECTIONS.test(heading)) bodies.push(sections[i + 1] ?? '')
  }
  // Don't break after abbreviations like "U.S." or "No.".
  const sentences = (s: string) => s.replace(/\s+/g, ' ').split(/(?<!\b(?:U\.S|U\.K|Mr|Mrs|Dr|St|No|vs|Jr|Sr|Inc|Co|Ltd|feat|etc|Vol|Op)\.)(?<=[.!?])\s+(?=["“A-Z])/)
  const candidates = [...bodies.flatMap(sentences), ...sentences(lead).slice(2)]

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

async function lookup(artist: string, title: string): Promise<Trivia | null> {
  const page = await findArticle(artist, title)
  if (!page) return null
  const { query } = await wiki<{ query?: { pages?: Page[] } }>({ prop: 'extracts', explaintext: '1', titles: page.title })
  const facts = pickFacts(query?.pages?.[0]?.extract ?? '')
  if (!facts.length) return null
  return { facts, title: page.title, url: page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}` }
}

const inFlight = new Map<number, Promise<Trivia | null>>()

/** Wikipedia trivia for a release, cached (including "nothing found") so each release hits Wikipedia rarely. Network errors are not cached. */
export async function triviaFor(releaseId: number): Promise<Trivia | null> {
  const cached = db.prepare('SELECT facts, title, url, fetched_at AS fetchedAt FROM trivia WHERE release_id = ?').get(releaseId) as
    | { facts: string | null; title: string | null; url: string | null; fetchedAt: number }
    | undefined
  const found = !!cached?.facts
  if (cached && Date.now() - cached.fetchedAt < (found ? FOUND_TTL_MS : MISSING_TTL_MS)) {
    return found ? { facts: JSON.parse(cached.facts!) as string[], title: cached.title!, url: cached.url! } : null
  }

  const release = db.prepare('SELECT artist, title FROM releases WHERE id = ?').get(releaseId) as { artist: string; title: string } | undefined
  if (!release) return null

  let pending = inFlight.get(releaseId)
  if (!pending) {
    pending = lookup(release.artist, release.title).finally(() => inFlight.delete(releaseId))
    inFlight.set(releaseId, pending)
  }
  try {
    const trivia = await pending
    db.prepare('INSERT OR REPLACE INTO trivia (release_id, facts, title, url, fetched_at) VALUES (?, ?, ?, ?, ?)').run(
      releaseId,
      trivia ? JSON.stringify(trivia.facts) : null,
      trivia?.title ?? null,
      trivia?.url ?? null,
      Date.now(),
    )
    return trivia
  } catch {
    return found ? { facts: JSON.parse(cached!.facts!) as string[], title: cached!.title!, url: cached!.url! } : null
  }
}
