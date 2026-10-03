import { Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

interface MemberSummary {
  id: number
  name: string
  collection: number
  wishlist: number
  records: number | null
}

export default function Members() {
  const [members, setMembers] = useState<MemberSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ members: MemberSummary[] }>('/members')
      .then((r) => setMembers(r.members))
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-ink-500">Collections other members have chosen to share. You can turn on your own under Account.</p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {members?.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <Users className="size-10 text-ink-700" />
          <p className="max-w-sm text-sm text-ink-500">Nobody has shared their collection yet.</p>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members?.map((m) => (
          <li key={m.id}>
            <Link to={`/members/${m.id}`} className="block rounded-xl border border-ink-800 bg-ink-900/60 p-4 transition-colors hover:border-wax/60">
              <div className="font-medium">{m.name}</div>
              <div className="text-sm text-ink-500">
                {[m.collection ? `${m.records ?? 0} ${m.records === 1 ? 'record' : 'records'}` : null, m.wishlist ? 'Wishlist' : null].filter(Boolean).join(' · ')}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
