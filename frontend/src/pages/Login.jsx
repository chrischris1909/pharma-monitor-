import { usePageTitle } from '../hooks/usePageTitle'
// ============================================
// PHARMA MONITOR - LOGIN PAGE (CORREGIDO)
// ============================================

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Factory } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  usePageTitle('Iniciar Sesión')

  const navigate = useNavigate()
  const { login } = useAuth() // Usar directamente desde el contexto
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Enviamos el valor tal cual (permite tanto correos como nombres de usuario tipo 'admin')
      await login(correo.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err.response?.data?.message || 
        err.response?.data?.error || 
        'Credenciales inválidas. Verifica los datos e inténtalo de nuevo.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login" id="login" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Fondo a pantalla completa animado y con desenfoque */}
      <div style={{
        position: 'absolute',
        inset: '-20px',
        background: 'url(/bg-login-new.jpg) center/cover no-repeat',
        filter: 'blur(6px)',
        animation: 'pan 25s ease-in-out infinite alternate',
        zIndex: 0
      }} />
      
      {/* Overlay oscuro/vinotinto para mejorar legibilidad */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(135deg, rgba(90, 15, 36, 0.65), rgba(0, 0, 0, 0.7))',
        zIndex: 1
      }} />

      {/* Contenedor del formulario centrado */}
      <div className="card" style={{
        position: 'relative',
        zIndex: 2,
        width: '100%',
        maxWidth: '420px',
        padding: '40px 32px',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <div style={{ background: '#fff', borderRadius: '8px', padding: '10px 20px', marginBottom: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
          <img src="/logo-siegfried.png" alt="Siegfried" style={{ height: '40px', objectFit: 'contain' }} />
        </div>
        
        <h2 style={{ fontSize: '24px', marginBottom: '8px', color: 'var(--wine)', textAlign: 'center' }}>
          Pharma Monitor
        </h2>
        <p style={{ color: 'var(--mut)', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
          Control de áreas en tiempo real
        </p>

        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <label htmlFor="correo">Correo institucional o usuario</label>
          <input
            id="correo"
            type="text"
            autoComplete="username"
            value={correo}
            onChange={e => setCorreo(e.target.value)}
            required
            disabled={loading}
            placeholder="usuario@siegfried.com.ve"
            style={{ marginBottom: '16px' }}
          />

          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            disabled={loading}
            placeholder="••••••••"
          />

          {error && <div className="err" style={{ color: '#ff4d4f', marginTop: '12px', fontSize: '14px', textAlign: 'center' }}>{error}</div>}

          <button className="btn" style={{ width: '100%', marginTop: '24px', padding: '14px' }} disabled={loading}>
            {loading ? 'Entrando...' : 'Ingresar al sistema'}
          </button>

          <div className="hint" style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', opacity: 0.8 }}>
            Acceso autorizado únicamente.
          </div>
        </form>
      </div>

      <style jsx>{`
        @keyframes pan {
          0% { transform: scale(1) translate(0, 0); }
          100% { transform: scale(1.05) translate(-10px, -10px); }
        }
      `}</style>
    </div>
  )
}