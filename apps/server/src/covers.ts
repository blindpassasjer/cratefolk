// Where cover images live. Docker keeps them as files next to the database (covers.node.ts); Workers keep them in R2 (covers.r2.ts).

export interface CoverStore {
  /** The JPEG bytes of a cover, or null if there is none. With `thumb`, a smaller copy (falls back to the original if resizing fails). */
  read(id: number, thumb: boolean): Promise<Uint8Array<ArrayBuffer> | null>
  /** Saves the original and drops any thumbnail of the previous image. */
  write(id: number, image: Uint8Array): Promise<void>
  /** Removes the original and its thumbnail. */
  remove(id: number): Promise<void>
}

let store: CoverStore | null = null
export const setCoverStore = (s: CoverStore) => {
  store = s
}
export const covers: CoverStore = {
  read: (id, thumb) => active().read(id, thumb),
  write: (id, image) => active().write(id, image),
  remove: (id) => active().remove(id),
}
const active = (): CoverStore => {
  if (!store) throw new Error('Cover store not set')
  return store
}

/** The `Content-Type`/cache headers every cover response uses. */
export const COVER_TYPE = 'image/jpeg'
