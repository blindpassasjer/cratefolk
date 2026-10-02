import { Disc3 } from 'lucide-react'

export default function Collection() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <Disc3 className="size-12 text-ink-700" />
      <h1 className="text-xl font-semibold">Your crate is empty</h1>
      <p className="max-w-sm text-sm text-ink-500">
        Adding records from Discogs and searching your collection are coming next.
      </p>
    </div>
  )
}
