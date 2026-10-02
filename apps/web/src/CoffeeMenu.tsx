import { ArrowUpRight, Coffee } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const VIPPS_URL = 'https://qr.vipps.no/box/d4cd2440-08dd-4eb9-b6b1-88130f984233/pay-in'
const COFFEE_URL = 'https://buymeacoffee.com/blindpassasjer'

/** `placement` is where the popover opens: below the button (top bar) or above it (bottom of the sidebar). */
export default function CoffeeMenu({ placement = 'down' }: { placement?: 'down' | 'up' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const option = 'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Buy me a coffee"
        aria-label="Buy me a coffee"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:text-ink-100 sm:px-3 ${open ? 'text-ink-100' : 'text-ink-300'}`}
      >
        <Coffee className="size-4" />
      </button>

      {open && (
        <div role="dialog" aria-label="Buy me a coffee" className={`absolute z-30 overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-xl ${placement === 'up' ? 'bottom-full left-0 mb-2 w-60' : 'right-0 top-full mt-2 w-72'}`}>
          <div className="flex items-center gap-3 border-b border-ink-800 p-4">
            <img src={`${import.meta.env.BASE_URL}developer.jpg`} alt="" aria-hidden="true" className="size-10 rounded-full border-2 border-ink-700 object-cover" />
            <div>
              <h2 className="text-sm font-semibold">Buy me a coffee</h2>
              <p className="text-xs text-ink-500">Support keeps WaxCrate running</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 p-3">
            <a href={VIPPS_URL} target="_blank" rel="noopener noreferrer" className={`${option} bg-wax text-on-wax hover:bg-wax-hover`}>
              Vipps me <ArrowUpRight className="size-4" />
            </a>
            <a href={COFFEE_URL} target="_blank" rel="noopener noreferrer" className={`${option} border border-ink-700 hover:border-wax`}>
              Buy me a coffee <ArrowUpRight className="size-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
