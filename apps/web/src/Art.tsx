/** Small inline illustrations in the app palette (wax amber on ink), so they follow the light/dark theme. */

/** A record sleeve with a disc sliding out of it. Used by empty states. */
export function CrateArt({ className = 'h-28' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" fill="none" aria-hidden="true" className={className}>
      <rect x="14" y="30" width="86" height="86" rx="6" className="fill-ink-800 stroke-ink-700" strokeWidth="2" />
      <rect x="24" y="40" width="66" height="8" rx="2" className="fill-ink-700" />
      <circle cx="102" cy="74" r="40" className="fill-ink-950 stroke-ink-700" strokeWidth="2" />
      <circle cx="102" cy="74" r="30" className="stroke-ink-800" strokeWidth="2" />
      <circle cx="102" cy="74" r="21" className="stroke-ink-800" strokeWidth="2" />
      <circle cx="102" cy="74" r="13" className="fill-wax" />
      <circle cx="102" cy="74" r="3" className="fill-ink-950" />
      <path d="M62 20h12M68 14v12" className="stroke-wax" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/** A plain record whose label colour is derived from the release id, for covers that have no art. */
export function FallbackDisc({ seed }: { seed: number }) {
  const hue = (Math.abs(seed) * 47) % 360
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="size-full">
      <rect width="100" height="100" className="fill-ink-800" />
      <circle cx="50" cy="50" r="40" className="fill-ink-950" />
      <circle cx="50" cy="50" r="33" fill="none" className="stroke-ink-800" strokeWidth="1" />
      <circle cx="50" cy="50" r="26" fill="none" className="stroke-ink-800" strokeWidth="1" />
      <circle cx="50" cy="50" r="14" fill={`hsl(${hue} 45% 45%)`} />
      <circle cx="50" cy="50" r="2.5" className="fill-ink-800" />
      <path d="M28 24a32 32 0 0 1 20-8" fill="none" stroke="white" strokeOpacity=".12" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** The medium a Discogs-style format string describes ("CD, Album" → "CD"), or null for vinyl and anything unrecognised. */
export function mediumLabel(format: string): string | null {
  const f = format.toLowerCase()
  if (/\bvinyl\b|\blp\b|\b\d+"/.test(f)) return null
  if (/\bcd\b|\bcdr\b|\bsacd\b/.test(f)) return 'CD'
  if (/cassette|\bmc\b/.test(f)) return 'Tape'
  if (/dvd|blu-ray/.test(f)) return 'Video'
  return null
}

/** A small pill on the corner of a cover for non-vinyl releases. */
export function FormatBadge({ format }: { format: string }) {
  const label = mediumLabel(format)
  if (!label) return null
  return <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">{label}</span>
}

/** Faint oversized records for the sign-in backdrop. */
export function RecordBackdrop() {
  const disc = (cx: number, cy: number, r: number) => (
    <g key={`${cx}-${cy}`}>
      <circle cx={cx} cy={cy} r={r} className="stroke-ink-700" strokeWidth="1.5" />
      {[0.8, 0.62, 0.46].map((k) => (
        <circle key={k} cx={cx} cy={cy} r={r * k} className="stroke-ink-800" strokeWidth="1.5" />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.28} className="fill-wax" opacity=".5" />
      <circle cx={cx} cy={cy} r={r * 0.03} className="fill-ink-950" />
    </g>
  )
  return (
    <svg aria-hidden="true" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" fill="none" className="pointer-events-none fixed inset-0 -z-0 size-full opacity-40">
      {disc(120, 130, 190)}
      {disc(1080, 680, 260)}
      {disc(1130, 90, 90)}
      {disc(70, 700, 70)}
    </svg>
  )
}
