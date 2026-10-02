import { Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { IS_DEMO } from './api'
import { CratesProvider } from './crates'
import { resetDemo } from './demo/mockApi'
import { Logo } from './Logo'
import Sidebar, { CrateManager } from './Sidebar'

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  // Choosing a destination closes the phone drawer.
  useEffect(() => setOpen(false), [pathname])

  return (
    <CratesProvider>
      <div className="min-h-screen lg:flex">
        <Sidebar open={open} onClose={() => setOpen(false)} />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-ink-800 bg-ink-950/80 px-4 backdrop-blur lg:hidden">
            <button onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="-ml-1.5 rounded-md p-1.5 text-ink-300 hover:text-ink-100">
              <Menu className="size-5" />
            </button>
            <Link to="/">
              <Logo />
            </Link>
          </header>
          {IS_DEMO && (
            <div className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-center text-xs text-ink-300">
              Demo with sample records. Everything stays in your browser.{' '}
              <button
                onClick={() => {
                  resetDemo()
                  window.location.reload()
                }}
                className="text-wax hover:underline"
              >
                Reset demo data
              </button>
            </div>
          )}
          <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
            <Outlet />
          </main>
        </div>
      </div>
      <CrateManager />
    </CratesProvider>
  )
}
