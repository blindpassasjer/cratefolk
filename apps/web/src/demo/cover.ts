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

/** Generated artwork for the demo, so it ships no copyrighted cover images. Deterministic per release. */
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
