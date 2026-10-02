import { Disc3, LogOut, Users } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from './auth'

export function Logo() {
  return (
    <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <Disc3 className="size-6 text-wax" />
      WaxCrate
    </span>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
      isActive ? 'bg-ink-800 text-ink-100' : 'text-ink-300 hover:text-ink-100'
    }`

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-ink-800 bg-ink-950/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <Link to="/">
            <Logo />
          </Link>
          <nav className="flex flex-1 items-center gap-1">
            <NavLink to="/" end className={link}>
              Collection
            </NavLink>
            {user?.role === 'admin' && (
              <NavLink to="/admin" className={link}>
                <Users className="size-4" /> Users
              </NavLink>
            )}
          </nav>
          <span className="hidden text-sm text-ink-500 sm:block">{user?.name}</span>
          <button
            onClick={() => void logout()}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-ink-300 hover:text-ink-100"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
