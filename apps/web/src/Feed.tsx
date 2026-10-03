import { ChevronDown, Rss } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from './api'
import Cover from './Cover'

interface FeedEvent {
  id: number
  type: 'added' | 'wishlisted' | 'listed' | 'sold'
  createdAt: number
  userId: number
  userName: string
  releaseId: number
  title: string
  artist: string
  hasCover: number
}

const VERBS: Record<FeedEvent['type'], string> = {
  added: 'added',
  wishlisted: 'wishlisted',
  listed: 'is selling',
  sold: 'sold',
}

const OPEN_KEY = 'cratelog-feed-open'
const SEEN_KEY = 'cratelog-feed-seen'

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // storage unavailable: use the defaults
  }
}
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* the choice just won't persist */
  }
}

function ago(ms: number) {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60_000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h`
  return `${Math.round(mins / 1440)}d`
}

/** A collapsible feed of what friends recently added, wishlisted, put up for sale and sold. */
export default function Feed({ onNavigate }: { onNavigate: () => void }) {
  const [events, setEvents] = useState<FeedEvent[] | null>(null)
  const [open, setOpen] = useState(() => read(OPEN_KEY) === '1')
  const [seen, setSeen] = useState(() => Number(read(SEEN_KEY)) || 0)

  useEffect(() => {
    const load = () =>
      api<{ events: FeedEvent[] }>('/friends/feed')
        .then((r) => setEvents(r.events))
        .catch(() => {})
    void load()
    const timer = setInterval(load, 5 * 60_000)
    return () => clearInterval(timer)
  }, [])

  const unread = events?.filter((e) => e.createdAt > seen).length ?? 0

  function toggle() {
    const next = !open
    setOpen(next)
    write(OPEN_KEY, next ? '1' : '0')
    // Opening the feed counts as having seen everything in it.
    if (next && events?.[0]) {
      setSeen(events[0].createdAt)
      write(SEEN_KEY, String(events[0].createdAt))
    }
  }

  return (
    <div className="shrink-0 border-t border-ink-800">
      <button onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-2.5 px-6 py-3 text-sm text-ink-300 transition-colors hover:text-ink-100">
        <Rss className="size-4" /> Friends&apos; activity
        {!open && unread > 0 && <span className="rounded-full bg-wax px-1.5 text-xs font-medium text-on-wax">{unread}</span>}
        <ChevronDown className={`ml-auto size-4 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <ul className="max-h-[35vh] space-y-0.5 overflow-y-auto px-3 pb-3">
          {events?.length === 0 && <li className="px-3 py-2 text-xs text-ink-500">Nothing yet. Activity from friends who share their collection shows up here.</li>}
          {events?.map((e) => (
            <li key={e.id}>
              <Link to={`/release/${e.releaseId}`} onClick={onNavigate} className="flex items-center gap-2.5 rounded-md px-3 py-1.5 hover:bg-ink-900">
                <Cover releaseId={e.releaseId} hasCover={!!e.hasCover} className="size-9 shrink-0 rounded" />
                <div className="min-w-0 flex-1 text-xs leading-snug">
                  <div className="text-ink-300">
                    <span className="font-medium text-ink-100">{e.userName}</span> {VERBS[e.type]}
                  </div>
                  <div className="truncate text-ink-500">{[e.title, e.artist].join(' · ')}</div>
                </div>
                <span className="shrink-0 text-xs text-ink-500">{ago(e.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
