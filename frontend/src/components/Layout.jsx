// ============================================
// PHARMA MONITOR - LAYOUT COMPONENT
// ============================================

import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ws } from '../services/api'
import OfflineBanner from './OfflineBanner'
import { LayoutDashboard, Settings, Users, AlertTriangle, Boxes, ListChecks, LogOut, ChevronLeft, ChevronRight, Factory } from 'lucide-react'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/areas', label: 'Áreas y variables', icon: Boxes },
  { path: '/values', label: 'Valores y registros', icon: ListChecks },
  { path: '/alerts', label: 'Alertas', icon: AlertTriangle },
  { path: '/settings', label: 'Configuración', icon: Settings },
]

const adminNavItems = [
  { path: '/users', label: 'Usuarios y roles', icon: Users },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    const unsub = ws.on('alerta:nueva', () => setAlertCount(c => c + 1))
    const unsub2 = ws.on('connect', () => ws.send('request:estado'))
    return () => { unsub(); unsub2() }
  }, [])

  return (
    <div className={`app on ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="logo" style={{
          padding: '12px 10px 24px',
          display: 'flex',
          alignItems: 'center',
          opacity: collapsed ? 0 : 1,
          width: collapsed ? '0' : 'auto',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          transition: 'opacity 0.2s, width 0.2s'
        }}>
          <div style={{ background: '#fff', padding: '4px', borderRadius: '8px', display: 'flex', width: '100%', justifyContent: 'center' }}>
            <img src="/logo-siegfried.png" alt="Siegfried" style={{ width: '100%', maxHeight: '50px', objectFit: 'contain' }} />
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-link ${isActive ? 'act' : ''}`}
            >
              <item.icon size={20} className="icon" />
              <span className="label" style={{ display: collapsed ? 'none' : 'block' }}>{item.label}</span>
            </NavLink>
          ))}
          {user?.rol === 'Admin' && adminNavItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-link ${isActive ? 'act' : ''}`}
            >
              <item.icon size={20} className="icon" />
              <span className="label" style={{ display: collapsed ? 'none' : 'block' }}>{item.label}</span>
            </NavLink>
          ))}
          <button className="nav-link mobile-logout" onClick={logout}>
            <LogOut size={20} className="icon" />
            <span className="label">Salir</span>
          </button>
        </nav>

        <div className="me" style={{
          marginTop: 'auto',
          fontSize: '13px',
          padding: '10px',
          borderTop: '1px solid rgba(255,255,255,.15)',
          opacity: collapsed ? 0 : 1,
          height: collapsed ? 0 : 'auto',
          overflow: 'hidden',
          transition: 'opacity 0.2s, height 0.2s'
        }}>
          <div><b>{user?.nombre}</b></div>
          <div style={{ color: '#e9d5da', opacity: 0.7 }}>{user?.rol}</div>
          <button
            className="btn sec"
            style={{
              marginTop: '8px',
              width: '100%',
              color: '#fff',
              borderColor: 'rgba(255,255,255,.3)',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: '8px'
            }}
            onClick={logout}
          >
            <LogOut size={16} />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            position: 'absolute',
            right: '-16px',
            top: '20px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'var(--red)',
            border: '2px solid var(--wine2)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,.3)',
            zIndex: 10
          }}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </aside>

      <main className="main-content">
        <OfflineBanner />
        {alertCount > 0 && (
          <div className="status bad noprint" style={{ marginBottom: 18 }}>
            <span className="led" />
            <b>Hay {alertCount} alerta{alertCount > 1 ? 's' : ''} sin revisar</b>
            <NavLink to="/alerts" className="btn sec sm" style={{ marginLeft: 'auto', color: '#fff', borderColor: '#fff' }}>
              Ver alertas
            </NavLink>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}