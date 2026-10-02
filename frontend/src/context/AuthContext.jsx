// ============================================
// PHARMA MONITOR - AUTH CONTEXT (OPTIMIZADO)
// ============================================

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import api from "../services/api"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Inicialización y verificación del token
  const initAuth = useCallback(async () => {
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')

    if (token && userData) {
      try {
        // Cargar datos locales de inmediato para renderizado rápido
        const parsedUser = JSON.parse(userData)
        setUser(parsedUser)

        // Verificar validez del token en el backend
        const res = await api.get('/auth/me')
        if (res.data) {
          const freshUser = res.data.user || res.data.usuario || res.data
          setUser(freshUser)
          localStorage.setItem('user', JSON.stringify(freshUser))
        }
      } catch (error) {
        console.error("Error al validar sesión:", error)
        // Destruir sesión únicamente si el servidor invalida las credenciales (401 / 403)
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          localStorage.clear()
          setUser(null)
        }
      }
    } else {
      setUser(null)
    }

    setLoading(false)
  }, [])

  // Ejecución única al montar el componente
  useEffect(() => {
    initAuth()
  }, [initAuth])

  // Inicio de sesión
  const login = useCallback(async (correo, password) => {
    const res = await api.post('/auth/login', { correo, password })
    
    const userData = res.data.user || res.data.usuario || res.data
    const token = res.data.accessToken || res.data.token
    const refreshToken = res.data.refreshToken || res.data.refresh_token

    if (token) {
      localStorage.setItem('token', token)
    }
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken)
    }
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData))
      setUser(userData)
    }

    return userData
  }, [])

  // Cierre de sesión
  const logout = useCallback(() => {
    localStorage.clear()
    setUser(null)
    window.location.href = '/login'
  }, [])

  // Memorizar el valor del contexto para evitar re-renders innecesarios en la app
  const value = useMemo(() => ({
    user,
    loading,
    login,
    logout,
    initAuth
  }), [user, loading, login, logout, initAuth])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}