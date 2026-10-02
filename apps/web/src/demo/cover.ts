import { RELEASES } from './seed'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function wrap(text: string, max: number, lines: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > max) {
      out.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) out.push(line)
  return out.slice(0, lines).map((l, i, a) => (i === a.length - 1 && out.length > lines ? l.slice(0, max - 1) + '…' : l))
}

/** MusicBrainz release-group IDs for the seed records, used to hotlink real covers from the Cover Art Archive. */
const CAA_IDS: Record<number, string> = {
  1001: '8e8a594f-2175-38c7-a871-abb68ec363e7',
  1002: '77cf47ba-58cd-3f3d-a5f9-79bf89860421',
  1003: '322f18bb-5491-38e9-9044-c0a468651eec',
  1004: 'b1392450-e666-3926-a536-22c65f834433',
  1005: '810272e0-aef1-3d85-b2d3-e512e87fc38c',
  1006: '1b022e01-4da6-387b-8658-8678046e4cef',
  1007: '8b6f133a-2fdf-3cc2-b84d-1c889adc0939',
  1008: '48140466-cff6-3222-bd55-63c27e43190d',
  1009: 'f5093c06-23e3-404f-aeaa-40f72885ee3a',
  1010: '416bb5e5-c7d1-3977-8fd7-7c9daf6c2be6',
  1011: '42d725fb-a8b7-388c-8866-3b02789af326',
  1012: 'f6b1b900-6108-32f0-abbd-2855af9151eb',
  1013: '6c9ae3dd-32ad-472c-96be-69d0a3536261',
  1015: 'b9dd6193-4cb7-4ea0-8dd7-e92bb9109f1d',
  1016: '5cbd9d7b-597a-3c5e-bfd1-c2b364215560',
  1017: '2e61da88-39e9-3473-81d2-c964cb394952',
}

/** Real cover, hotlinked at runtime (nothing is bundled). Undefined for records without a known ID. */
export function realCover(releaseId: number): string | undefined {
  const mbid = CAA_IDS[releaseId]
  return mbid ? `https://coverartarchive.org/release-group/${mbid}/front-500` : undefined
}

/** Generated artwork, used as the fallback when a real cover is unavailable. Deterministic per release. */
export function demoCover(releaseId: number): string {
  const r = RELEASES.get(releaseId)
  const hue = (releaseId * 47) % 360
  const title = wrap(r?.title ?? 'Unknown', 14, 4)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<rect width="200" height="200" fill="hsl(${hue} 42% 24%)"/>
<circle cx="150" cy="58" r="64" fill="hsl(${(hue + 35) % 360} 55% 48%)" opacity=".85"/>
<circle cx="150" cy="58" r="40" fill="hsl(${(hue + 70) % 360} 60% 62%)" opacity=".7"/>
<circle cx="150" cy="58" r="6" fill="hsl(${hue} 42% 24%)"/>
<g font-family="Helvetica,Arial,sans-serif" fill="#fff">
<text x="14" y="${190 - title.length * 20}" font-size="17" font-weight="700">${title.map((l, i) => `<tspan x="14" dy="${i ? 20 : 0}">${esc(l)}</tspan>`).join('')}</text>
<text x="14" y="188" font-size="11" opacity=".8">${esc((r?.artist ?? '').slice(0, 30))}</text></g></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
