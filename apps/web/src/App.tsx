import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './Layout'
import Account from './pages/Account'
import Collection from './pages/Collection'
import Member from './pages/Member'
import Members from './pages/Members'
import Login from './pages/Login'
import Release from './pages/Release'
import ResetPassword from './pages/ResetPassword'
import Stats from './pages/Stats'
import Shared from './pages/Shared'
import Wishlist from './pages/Wishlist'

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/s/:token" element={<Shared />} />
      <Route path="/reset/:token" element={<ResetPassword />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Collection />} />
          <Route path="wishlist" element={<Wishlist />} />
          <Route path="members" element={<Members />} />
          <Route path="members/:id" element={<Member />} />
          <Route path="stats" element={<Stats />} />
          <Route path="account" element={<Account />} />
          <Route path="release/:id" element={<Release />} />
          <Route path="admin" element={<Navigate to="/account" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
