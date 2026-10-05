// ============================================
// PHARMA MONITOR - DASHBOARD PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Zap, Download, Factory, Thermometer, Droplet, Gauge, Bell, Plus } from 'lucide-react'
import { api, ws } from '../services/api'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

const lab = { ok: 'Estable', warn: 'Regular', bad: 'Irregular' }

export default function Dashboard() {
  const [areas, setAreas] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [emergency, setEmergency] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [areasRes, alertsRes] = await Promise.all([
        api.get('/areas/estado'),
        api.get('/alertas/pendientes')
      ])
      setAreas(areasRes.data.areas)
      setAlerts(alertsRes.data.alertas)
    } catch (err) {
      console.error('Error fetching dashboard:', err)
      toast.error('Error cargando dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => {
      if (autoRefresh && !loading) fetchData()
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchData, autoRefresh])

  useEffect(() => {
    const unsub = ws.on('lectura:nueva', (lectura) => {
      setAreas(prev => prev.map(a => a.id === lectura.area_id ? { ...a, ...lectura } : a))
    })
    const unsub2 = ws.on('alerta:nueva', (alerta) => {
      setAlerts(prev => [alerta, ...prev.slice(0, 9)])
      toast.error(`Alerta en ${alerta.area_nombre}: ${alerta.mensaje}`)
    })
    const unsub3 = ws.on('estado:actual', (estadoAreas) => {
      setAreas(estadoAreas)
    })
    return () => { unsub(); unsub2(); unsub3() }
  }, [])

  const overall = areas.some(a => a.estado === 'bad') ? 'bad' : areas.some(a => a.estado === 'warn') ? 'warn' : 'ok'
  const badAreas = areas.filter(a => a.estado === 'bad')

  const handleEmergency = async () => {
    if (emergency) {
      setEmergency(null)
      toast.success('Simulación de emergencia terminada')
    } else {
      const firstArea = areas[0]
      if (firstArea) {
        setEmergency(firstArea.id)
        toast(`Simulando emergencia en ${firstArea.nombre}`, { icon: '⚡' })
      }
    }
  }

  const avg = (key) => areas.reduce((s, a) => s + (Number(a[key]) || 0), 0) / (areas.length || 1)

  if (loading) return <div className="loading-screen" style={{ padding: 40, textAlign: 'center' }}>Cargando dashboard...</div>

  return (
    <div>
      <div className="top" style={{ 
        position: 'relative',
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-end', 
        gap: '12px', 
        flexWrap: 'wrap', 
        marginBottom: '22px',
        padding: '30px',
        borderRadius: '12px',
        color: '#fff',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, rgba(122,21,48,0.95) 0%, rgba(122,21,48,0.4) 100%), url(/dashboard-banner.jpg) right center/cover no-repeat',
          zIndex: 0
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontSize: '32px', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>Dashboard</h2>
          <p style={{ opacity: 0.9, marginTop: '4px', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Monitor en tiempo real de áreas productivas</p>
        </div>
        <div className="noprint" style={{ display: 'flex', gap: '10px', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <button className="btn red" onClick={handleEmergency} style={{ display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <Zap size={18} /> {emergency ? 'Terminar simulación' : 'Simular emergencia'}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 500, background: 'rgba(255,255,255,0.2)', padding: '8px 12px', borderRadius: '8px', backdropFilter: 'blur(4px)' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-refresh
          </label>
          <button className="btn" onClick={fetchData} disabled={loading} style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--wine)' }}>
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>
      </div>

      <div className={`status ${overall}`}>
        <span className="led" />
        <div>
          <b style={{ fontSize: '17px' }}>
            {overall === 'bad' ? 'LED rojo · ' : 'LED verde · '}
            {overall === 'bad' ? `Emergencia en: ${badAreas.map(a => a.nombre).join(', ')}` :
             overall === 'warn' ? 'Hay áreas cerca del límite' : 'Todas las áreas operan dentro de rango'}
          </b>
          <div style={{ opacity: '.9', fontSize: '13px', marginTop: '4px' }}>
            Actualización automática cada 10 s {autoRefresh ? '✓' : '✗'}
          </div>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: '16px' }}>
        <div className="card">
          <div className="mut">Temperatura promedio</div>
          <div className="big">{(Number(avg('temperatura')) || 0).toFixed(1)} °C</div>
        </div>
        <div className="card">
          <div className="mut">Humedad promedio</div>
          <div className="big">{(Number(avg('humedad')) || 0).toFixed(0)} %</div>
        </div>
        <div className="card">
          <div className="mut">Presión promedio</div>
          <div className="big">{(Number(avg('presion')) || 0).toFixed(1)} Pa</div>
        </div>
        <div className="card">
          <div className="mut">Alertas registradas</div>
          <div className="big">{alerts.length}</div>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: '16px' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <b>Acceso rápido por área</b>
            <NavLink to="/areas" className="btn sec sm"><Plus size={14} /> Nueva área</NavLink>
          </div>
          <div className="scr">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Área</th>
                  <th>Temp.</th>
                  <th>Humedad</th>
                  <th>Presión</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {areas.map(a => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/areas/${a.id}`}>
                    <td><span className={`led ${a.estado === 'ok' ? '' : a.estado}`} /></td>
                    <td><b style={{ color: 'var(--wine)' }}>{a.nombre}</b></td>
                    <td>{Number(a.temperatura || 0).toFixed(1)} °C</td>
                    <td>{Number(a.humedad || 0).toFixed(0)} %</td>
                    <td>{Number(a.presion || 0).toFixed(1)} Pa</td>
                    <td><span className={`pill ${a.estado === 'ok' ? '' : a.estado}`}>{lab[a.estado]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <b>Últimas novedades</b>
          <div className="scr" style={{ marginTop: '12px' }}>
            <table>
              <thead>
                <tr><th>Fecha y hora</th><th>Área</th><th>Detalle</th></tr>
              </thead>
              <tbody>
                {alerts.slice(0, 5).map((al, i) => (
                  <tr key={i}>
                    <td className="mut">{format(new Date(al.created_at || al.ts), 'dd/MM/yyyy HH:mm', { locale: es })}</td>
                    <td><b>{al.area_nombre || al.a}</b></td>
                    <td>{al.mensaje || al.msg}</td>
                  </tr>
                ))}
                {alerts.length === 0 && (
                  <tr><td colSpan={3} className="mut" style={{ textAlign: 'center', padding: '24px' }}>
                    Sin novedades. Pulsa "Simular emergencia" para probar una alerta.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}