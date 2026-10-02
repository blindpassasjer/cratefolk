import { Search, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

/** Filter box. Press "/" anywhere to focus it, Esc to clear. */
export default function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, select, [contenteditable]')) return
      e.preventDefault()
      input.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('')
            e.currentTarget.blur()
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-md border border-ink-700 bg-ink-900 py-2 pl-9 pr-8 text-sm outline-none placeholder:text-ink-500 focus:border-wax [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-100">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
