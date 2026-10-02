import { BarChart3, Heart, LogOut, UserRound } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { IS_DEMO } from './api'
import { useAuth } from './auth'
import { resetDemo } from './demo/mockApi'
import CoffeeMenu from './CoffeeMenu'
import { ThemeToggle } from './theme'

export function Logo() {
  return (
    <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8" />
      <span className="hidden sm:inline">WaxCrate</span>
    </span>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors sm:px-3 ${
      isActive ? 'bg-ink-800 text-ink-100' : 'text-ink-300 hover:text-ink-100'
    }`

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-ink-800 bg-ink-950/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-6">
          <Link to="/">
            <Logo />
          </Link>
          <nav className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1">
            <NavLink to="/" end className={link}>
              Collection
            </NavLink>
            <NavLink to="/wishlist" className={link} title="Wishlist">
              <Heart className="size-4" /> <span className="hidden sm:inline">Wishlist</span>
            </NavLink>
            <NavLink to="/stats" className={link} title="Stats">
              <BarChart3 className="size-4" /> <span className="hidden sm:inline">Stats</span>
            </NavLink>
          </nav>
          <NavLink to="/account" className={link} title="Account settings">
            <UserRound className="size-4" />
            <span className="hidden max-w-32 truncate sm:inline">{user?.name}</span>
          </NavLink>
          <CoffeeMenu />
          <ThemeToggle />
          <button
            onClick={() => void logout()}
            title="Sign out"
            aria-label="Sign out"
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-ink-300 hover:text-ink-100 sm:px-3"
          >
            <LogOut className="size-4" /> <span className="hidden sm:inline">Sign out</span>
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
      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
