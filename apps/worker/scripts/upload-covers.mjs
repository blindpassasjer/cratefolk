// Uploads the covers of an existing Cratefolk data directory to the R2 bucket.
//
//   node scripts/upload-covers.mjs <path to data/covers> [--local] [--bucket cratefolk-covers] [--jobs 8]
//
// Only originals (<id>.jpg) go up: thumbnails are made again on demand. Safe to re-run; it overwrites. wrangler starts once per file, so
// big libraries take a while; for thousands of covers rclone against R2's S3 API is faster (see the README).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const dir = args.find((a) => !a.startsWith('--') && ![flag('--bucket'), flag('--jobs'), flag('--persist-to')].includes(a))
const local = args.includes('--local')
const bucket = flag('--bucket', 'cratefolk-covers')
const jobs = Number(flag('--jobs', 8))
const persist = flag('--persist-to') // for trying it against a non-default local state
if (!dir || !fs.existsSync(dir)) {
  console.error('Usage: node scripts/upload-covers.mjs <path to data/covers> [--local] [--bucket name] [--jobs n]')
  process.exit(1)
}

const files = fs.readdirSync(dir).filter((f) => /^-?\d+\.jpg$/.test(f))
console.log(`Uploading ${files.length} covers to ${bucket}${local ? ' (local)' : ''}…`)

const put = (file) =>
  new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', 'r2', 'object', 'put', `${bucket}/covers/${file}`, '--file', path.join(dir, file), '--content-type', 'image/jpeg', ...(local ? ['--local', ...(persist ? ['--persist-to', persist] : [])] : ['--remote'])], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d) => (err += d))
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${file}: ${err.trim().split('\n').pop()}`))))
  })

let done = 0
const failed = []
const queue = [...files]
await Promise.all(
  Array.from({ length: jobs }, async () => {
    for (let file; (file = queue.shift()); ) {
      try {
        await put(file)
      } catch (e) {
        failed.push(e.message)
      }
      if (++done % 25 === 0 || done === files.length) console.log(`  ${done}/${files.length}`)
    }
  }),
)
if (failed.length) {
  console.error(`${failed.length} failed:\n${failed.join('\n')}`)
  process.exit(1)
}
console.log('Done.')
