// ============================================
// PHARMA MONITOR - LAYOUT COMPONENT
// ============================================

import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ws } from '../services/api'
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
    <div className="app on" style={{ display: 'grid', gridTemplateColumns: collapsed ? '72px 1fr' : '240px 1fr', minHeight: '100vh' }}>
      <aside style={{
        background: 'var(--wine2)',
        color: '#fff',
        padding: '20px 14px',
        position: 'sticky',
        top: 0,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        overflow: 'hidden',
        transition: 'width 0.2s, padding 0.2s'
      }}>
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
          <div style={{ background: '#fff', padding: '6px', borderRadius: '6px', display: 'flex' }}>
            <img src="/logo-siegfried.png" alt="Siegfried" style={{ height: '28px', objectFit: 'contain' }} />
          </div>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav ${isActive ? 'act' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: collapsed ? 0 : '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'none',
                border: 0,
                color: '#e9d5da',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                textDecoration: 'none',
                justifyContent: collapsed ? 'center' : 'flex-start',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <item.icon size={20} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
          {user?.rol === 'Admin' && adminNavItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav ${isActive ? 'act' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: collapsed ? 0 : '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'none',
                border: 0,
                color: '#e9d5da',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                textDecoration: 'none',
                justifyContent: collapsed ? 'center' : 'flex-start',
              }}
            >
              <item.icon size={20} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
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
            right: '-12px',
            top: '20px',
            width: '24px',
            height: '24px',
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
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      <main style={{
        padding: '28px 32px',
        minWidth: 0,
        background: 'var(--bg)',
        minHeight: '100vh'
      }}>
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