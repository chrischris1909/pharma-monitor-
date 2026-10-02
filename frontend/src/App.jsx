import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ws } from './services/api'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Areas from './pages/Areas'
import AreaDetail from './pages/AreaDetail'
import Values from './pages/Values'
import Alerts from './pages/Alerts'
import Users from './pages/Users'
import Settings from './pages/Settings'
import LoadingScreen from './components/LoadingScreen'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <LoadingScreen message="Cargando sesión..." />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}

function App() {
  const { user } = useAuth()

  useEffect(() => {
    const token = localStorage.getItem('token')

    if (user && token && !ws.connected) {
      ws.connect(token)
    }

    return () => {
      if (ws.connected) {
        ws.disconnect?.()
      }
    }
  }, [user])

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="areas" element={<Areas />} />
        <Route path="areas/:id" element={<AreaDetail />} />
        <Route path="values" element={<Values />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="users" element={<Users />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App