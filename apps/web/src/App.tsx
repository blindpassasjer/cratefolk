import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './Layout'
import AdminUsers from './pages/AdminUsers'
import Collection from './pages/Collection'
import Login from './pages/Login'

function RequireAuth({ admin = false }: { admin?: boolean }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Collection />} />
          <Route element={<RequireAuth admin />}>
            <Route path="admin" element={<AdminUsers />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
