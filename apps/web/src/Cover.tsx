import { Disc3 } from 'lucide-react'

export default function Cover({ releaseId, hasCover, className = '' }: { releaseId: number; hasCover: boolean; className?: string }) {
  return (
    <div className={`aspect-square overflow-hidden bg-ink-800 ${className}`}>
      {hasCover ? (
        <img src={`/api/releases/${releaseId}/cover`} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Disc3 className="size-1/3 text-ink-700" />
        </div>
      )}
    </div>
  )
}
