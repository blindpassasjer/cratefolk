import { Image } from 'lucide-react'
import { useState } from 'react'

const SIZE_KEY = 'cratefolk-cover-size'
const SIZE_MIN = 110
const SIZE_MAX = 340
const SIZE_DEFAULT = 190

function loadSize() {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY) ?? localStorage.getItem('cratelog-cover-size') ?? localStorage.getItem('waxcrate-cover-size'))
    if (n >= SIZE_MIN && n <= SIZE_MAX) return n
  } catch {
    /* storage unavailable: fall back to the default */
  }
  return SIZE_DEFAULT
}

/** Cover size shared (via localStorage) by every record grid. */
export function useCoverSize() {
  const [size, setSize] = useState(loadSize)
  const resize = (n: number) => {
    setSize(n)
    try {
      localStorage.setItem(SIZE_KEY, String(n))
    } catch {
      /* the size just won't persist */
    }
  }
  return { size, resize, gridStyle: { gridTemplateColumns: `repeat(auto-fill, minmax(min(${size}px, 100%), 1fr))` } }
}

export function CoverSizeSlider({ size, onChange }: { size: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-500" title="Cover size">
      <Image className="size-4" aria-hidden="true" />
      <input
        type="range"
        aria-label="Cover size"
        min={SIZE_MIN}
        max={SIZE_MAX}
        step={10}
        value={size}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(SIZE_DEFAULT)}
        className="w-28 accent-wax"
      />
    </label>
  )
}
