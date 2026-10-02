import { LogOut, Menu, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { IS_DEMO } from './api'
import { useAuth } from './auth'
import CoffeeMenu from './CoffeeMenu'
import { CratesProvider } from './crates'
import { resetDemo } from './demo/mockApi'
import { Logo } from './Logo'
import Sidebar, { CrateManager } from './Sidebar'
import { ThemeToggle } from './theme'

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { user, logout } = useAuth()

  // Choosing a destination closes the phone drawer.
  useEffect(() => setOpen(false), [pathname])

  return (
    <CratesProvider>
      <div className="min-h-screen lg:flex">
        <Sidebar open={open} onClose={() => setOpen(false)} />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-ink-800 bg-ink-950/80 px-4 backdrop-blur">
            <button onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="-ml-1.5 rounded-md p-1.5 text-ink-300 hover:text-ink-100 lg:hidden">
              <Menu className="size-5" />
            </button>
            <Link to="/" className="lg:hidden">
              <Logo />
            </Link>
            <div className="ml-auto flex items-center gap-1">
              <Link
                to="/account"
                title="Account settings"
                className={`hidden min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sm lg:flex transition-colors sm:px-3 ${pathname === '/account' ? 'bg-ink-800 text-ink-100' : 'text-ink-300 hover:text-ink-100'}`}
              >
                <UserRound className="size-4 shrink-0" /> <span className="max-w-40 truncate">{user?.name}</span>
              </Link>
              <CoffeeMenu />
              <ThemeToggle />
              <button onClick={() => void logout()} title="Sign out" aria-label="Sign out" className="hidden rounded-md p-2 text-ink-300 transition-colors hover:text-ink-100 lg:block">
                <LogOut className="size-4" />
              </button>
            </div>
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
          <main className="px-4 lg:px-6 py-6 sm:py-8">
            <Outlet />
          </main>
        </div>
      </div>
      <CrateManager />
    </CratesProvider>
  )
}
