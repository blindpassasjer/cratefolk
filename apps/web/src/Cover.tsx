import type { ReactNode } from 'react'
import { FallbackDisc } from './Art'
import { IS_DEMO } from './api'
import { demoCover, realCover } from './demo/cover'
import { manualCover } from './demo/mockApi'

export default function Cover({ releaseId, hasCover, className = '', src, badge }: { releaseId: number; hasCover: boolean; className?: string; src?: string; badge?: ReactNode }) {
  return (
    <div className={`relative aspect-square overflow-hidden bg-ink-800 ${className}`}>
      {hasCover ? (
        <img
          src={IS_DEMO ? (manualCover(releaseId) ?? realCover(releaseId) ?? demoCover(releaseId)) : (src ?? `/api/releases/${releaseId}/cover`)}
          onError={IS_DEMO ? (e) => { e.currentTarget.onerror = null; e.currentTarget.src = demoCover(releaseId) } : undefined}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <FallbackDisc seed={releaseId} />
      )}
      {badge && <div className="absolute bottom-2 left-2">{badge}</div>}
    </div>
  )
}
