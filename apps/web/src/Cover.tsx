import { Disc3 } from 'lucide-react'
import { IS_DEMO } from './api'
import { demoCover } from './demo/cover'

export default function Cover({ releaseId, hasCover, className = '', src }: { releaseId: number; hasCover: boolean; className?: string; src?: string }) {
  return (
    <div className={`aspect-square overflow-hidden bg-ink-800 ${className}`}>
      {hasCover ? (
        <img src={IS_DEMO ? demoCover(releaseId) : (src ?? `/api/releases/${releaseId}/cover`)} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Disc3 className="size-1/3 text-ink-700" />
        </div>
      )}
    </div>
  )
}
