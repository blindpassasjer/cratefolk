import type { ReactNode } from 'react'
import { FallbackDisc } from './Art'
import { IS_DEMO } from './api'
import { demoCover, realCover } from './demo/cover'
import { manualCover } from './demo/mockApi'

export default function Cover({ releaseId, hasCover, className = '', src, badge, full }: { releaseId: number; hasCover: boolean; className?: string; src?: string; badge?: ReactNode; full?: boolean }) {
  return (
    <div className={`relative aspect-square overflow-hidden bg-ink-800 ${className}`}>
      {hasCover ? (
        <img
          src={IS_DEMO ? (manualCover(releaseId) ?? realCover(releaseId) ?? demoCover(releaseId)) : `${src ?? `/api/releases/${releaseId}/cover`}${full ? '' : '?size=thumb'}`}
          onError={IS_DEMO ? (e) => { e.currentTarget.onerror = null; e.currentTarget.src = demoCover(releaseId) } : undefined}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <FallbackDisc seed={releaseId} />
      )}
      {badge && <div className="absolute bottom-2 left-2">{badge}</div>}
    </div>
  )
}
