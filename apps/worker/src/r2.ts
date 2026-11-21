import { setCoverStore } from '../../server/src/covers.js'

const original = (id: number) => `covers/${id}.jpg`
const thumbnail = (id: number) => `covers/${id}.thumb.jpg`

// Grids show covers at 110-340px, so a 480px JPEG is sharp enough even on high-density screens.
const THUMB_SIZE = 480

/** Covers live in an R2 bucket. Thumbnails are made on first request with the Images binding and cached next to the original. */
export function useR2Covers(bucket: R2Bucket, images: ImagesBinding | undefined): void {
  async function bytes(key: string): Promise<Uint8Array<ArrayBuffer> | null> {
    const object = await bucket.get(key)
    return object ? new Uint8Array(await object.arrayBuffer()) : null
  }

  async function makeThumb(id: number, source: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
    if (!images) return null
    try {
      const out = await images
        .input(new Blob([source]).stream())
        .transform({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'scale-down' })
        .output({ format: 'image/jpeg', quality: 80 })
      const small = new Uint8Array(await out.response().arrayBuffer())
      await bucket.put(thumbnail(id), small, { httpMetadata: { contentType: 'image/jpeg' } })
      return small
    } catch {
      return null // the original is served instead
    }
  }

  setCoverStore({
    async read(id, thumb) {
      if (!Number.isInteger(id)) return null
      if (thumb) {
        const cached = await bytes(thumbnail(id))
        if (cached) return cached
      }
      const full = await bytes(original(id))
      if (!full) return null
      return (thumb ? await makeThumb(id, full) : null) ?? full
    },
    async write(id, image) {
      await bucket.put(original(id), image, { httpMetadata: { contentType: 'image/jpeg' } })
      await bucket.delete(thumbnail(id)) // made again from the new image when next needed
    },
    async remove(id) {
      await bucket.delete([original(id), thumbnail(id)])
    },
  })
}
