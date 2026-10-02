import { useEffect, useState } from 'react'

/**
 * Renders a long list in chunks: the first `step` items, then `step` more each time the sentinel scrolls near the viewport.
 * `resetKey` should change whenever the list is replaced (new search, filter or collection) to start again from the top.
 * Put `sentinelRef` on an element after the list and render it only while `hasMore`.
 */
export function useProgressive<T>(items: T[] | null, resetKey: string, step = 60) {
  const [limit, setLimit] = useState(step)
  const [node, setNode] = useState<HTMLElement | null>(null)
  const total = items?.length ?? 0

  useEffect(() => setLimit(step), [resetKey, step])

  useEffect(() => {
    if (!node || limit >= total) return
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && setLimit((l) => l + step), { rootMargin: '800px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, limit, total, step])

  return { visible: items ? items.slice(0, limit) : null, hasMore: limit < total, sentinelRef: setNode }
}
