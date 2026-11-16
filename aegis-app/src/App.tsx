import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { hasAuthorizedAccess } from './auth/authorization'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import { isSupabaseConfigured } from './lib/supabase'

function LoadingScreen() {
  return <main className="system-screen"><div className="loading-mark">A</div><p>Preparing your workspace…</p></main>
}

function ConfigurationScreen() {
  return (
    <main className="system-screen">
      <div className="loading-mark">A</div>
      <p className="eyebrow">AEGIS · SETUP REQUIRED</p>
      <h1>Connect the Supabase project</h1>
      <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code> to enable sign-in.</p>
      <p className="system-note">Use only the public/anon key in this browser application. Never use a service-role or secret key here.</p>
    </main>
  )
}

function AccessDenied() {
  const { authError, signOut } = useAuth()
  return (
    <main className="system-screen">
      <div className="loading-mark">A</div>
      <p className="eyebrow">ACCOUNT ACCESS</p>
      <h1>Access is not available</h1>
      <p>{authError || 'This login does not have an active AEGIS account with an assigned role. Contact your administrator.'}</p>
      <button className="primary-button compact-button" onClick={() => void signOut()}>Sign out</button>
    </main>
  )
}

function RequireAuthorization() {
  const { session, account, roles } = useAuth()
  if (!session) return <Navigate to="/login" replace />
  if (!hasAuthorizedAccess(account, roles)) return <AccessDenied />
  return <Outlet />
}

export default function App() {
  const { session, loading } = useAuth()

  if (!isSupabaseConfigured) return <ConfigurationScreen />
  if (loading) return <LoadingScreen />

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<RequireAuthorization />}>
        <Route path="/" element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
    </Routes>
  )
}
