import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { config } from './config.js'
import { setCoverStore } from './covers.js'

// Grids show covers at 110-340px, so a 480px JPEG is sharp enough even on high-density screens.
const THUMB_SIZE = 480

export function useFileCovers(): void {
  const dir = path.join(config.dataDir, 'covers')
  fs.mkdirSync(dir, { recursive: true })
  const full = (id: number) => path.join(dir, `${id}.jpg`)
  const small = (id: number) => path.join(dir, `${id}.thumb.jpg`)
  const thumbJobs = new Map<number, Promise<string | null>>()

  // A thumbnail is made on first request (so existing collections need no migration) and kept next to the original.
  async function thumbFile(id: number): Promise<string | null> {
    if (fs.existsSync(small(id))) return small(id)
    let job = thumbJobs.get(id)
    if (!job) {
      const tmp = `${small(id)}.${process.pid}.tmp`
      job = sharp(full(id))
        .rotate()
        .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toFile(tmp)
        .then(() => {
          fs.renameSync(tmp, small(id))
          return small(id)
        })
        .catch(() => {
          fs.rmSync(tmp, { force: true })
          return null
        })
        .finally(() => thumbJobs.delete(id))
      thumbJobs.set(id, job)
    }
    return job
  }

  setCoverStore({
    async read(id, thumb) {
      if (!Number.isInteger(id) || !fs.existsSync(full(id))) return null
      const file = (thumb ? await thumbFile(id) : null) ?? full(id)
      return new Uint8Array(await fs.promises.readFile(file))
    },
    async write(id, image) {
      fs.writeFileSync(full(id), image)
      fs.rmSync(small(id), { force: true }) // made again from the new image when next needed
    },
    async remove(id) {
      fs.rmSync(full(id), { force: true })
      fs.rmSync(small(id), { force: true })
    },
  })
}
