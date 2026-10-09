import { usePageTitle } from '../hooks/usePageTitle'
// ============================================
// PHARMA MONITOR - DASHBOARD PAGE (NUEVO DISEÑO)
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { AlertTriangle, Zap, RefreshCw, Plus } from 'lucide-react'
import { api, ws } from '../services/api'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

const lab = { ok: 'Estable', warn: 'Regular', bad: 'Irregular' }

function Sparkline({ series, w, h }) {
  if (!series || !series.length) return null;
  const all = series.flatMap(s => s.v);
  let lo = Math.min(...all, 1e9), hi = Math.max(...all, -1e9);
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * 0.1;
  lo -= pad; hi += pad;
  const X = (i, n) => 8 + i * (w - 16) / Math.max(1, n - 1);
  const Y = v => h - 8 - (v - lo) / (hi - lo) * (h - 16);
  
  return (
    <svg className="ch" viewBox={`0 0 ${w} ${h}`} role="img">
      {series.map((s, i) => (
        <polyline key={i} fill="none" stroke={s.c} strokeWidth="2" points={s.v.map((v, j) => `${X(j, s.v.length)},${Y(v)}`).join(' ')} />
      ))}
    </svg>
  );
}

export default function Dashboard() {
  usePageTitle('Dashboard')

  const navigate = useNavigate()
  const { user } = useAuth()
  const [areas, setAreas] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [emergency, setEmergency] = useState(null)
  const [tip, setTip] = useState(true)
  const [history, setHistory] = useState({}) // { areaId: [{ t, h, p }, ...] }

  const fetchData = useCallback(async () => {
    try {
      const [areasRes, alertsRes] = await Promise.all([
        api.get('/areas/estado'),
        api.get('/alertas/pendientes')
      ])
      setAreas(areasRes.data.areas || [])
      setAlerts(alertsRes.data.alertas || [])
    } catch (err) {
      console.error('Error fetching dashboard:', err)
      toast.error('Error cargando dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const unsub = ws.on('lectura:nueva', (lectura) => {
      setAreas(prev => prev.map(a => a.area_id === lectura.area_id ? { ...a, ...lectura } : a))
      setHistory(prev => {
        const newHist = { ...prev }
        if (!newHist[lectura.area_id]) newHist[lectura.area_id] = []
        newHist[lectura.area_id] = [...newHist[lectura.area_id], { t: Number(lectura.temperatura), h: Number(lectura.humedad), p: Number(lectura.presion) }].slice(-40)
        return newHist
      })
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
  const okAreas = areas.filter(a => a.estado === 'ok').length
  const nAreas = areas.length
  
  // Total history count
  const logCount = Object.values(history).reduce((acc, curr) => acc + curr.length, 0)

  const handleEmergency = async () => {
    if (emergency) {
      setEmergency(null)
      toast.success('Simulación de emergencia terminada')
    } else {
      try {
        const firstArea = areas[0]
        if (firstArea) {
          setEmergency(firstArea.area_id)
          toast(`Simulando emergencia en ${firstArea.nombre}`, { icon: '⚡' })
          await api.post('/alertas/simular')
          toast.success('Correo de emergencia enviado al gerente.')
        }
      } catch (err) {
        toast.error('Error al notificar emergencia')
      }
    }
  }

  if (loading) return <div className="loading-screen" style={{ padding: 40, textAlign: 'center' }}>Cargando dashboard...</div>

  const hr = new Date().getHours()
  const gr = hr < 12 ? 'Buenos días' : hr < 19 ? 'Buenas tardes' : 'Buenas noches'
  const userName = user?.nombre?.split(' ')[0] || 'Usuario'

  const tasks = [
    ['Calibrar sensor de presión · Pesada', 'Vence 15 oct', '#c8102e'],
    ['Revisar parámetros del área Líquidos', 'Vence 18 oct', '#c8102e'],
    ['Validar informe mensual BPM', 'Vence 24 oct', '#d98e04'],
    ['Revisar ESP32 de Empaque', 'Vence 30 oct', '#d98e04']
  ]

  const colors = ['#7a1530','#c8102e','#8a8486','#d98e04','#1f9d55']
  const getSeries = (key) => areas.map((a, i) => ({ v: (history[a.area_id] || []).map(r => r[key]), c: colors[i % colors.length] })).filter(s => s.v.length > 0)

  return (
    <div>
      <div className="top">
        <div>
          <h2>{gr}, {userName}.</h2>
          <div className="mut">Planta de producción · Control ambiental BPM · {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <button className="btn red noprint" onClick={handleEmergency}>
          {emergency ? 'Terminar simulación' : 'Simular emergencia'}
        </button>
      </div>

      {tip && (
        <div className="tipb noprint">
          <span>ⓘ</span>
          <span><b>Tip:</b> pulsa “Simular emergencia” para ver cómo se activa el LED rojo, la alerta y el correo al gerente.</span>
          <button onClick={() => setTip(false)} aria-label="Cerrar">✕</button>
        </div>
      )}

      <div className="grid g4">
        <div className="card kpi">
          <div className="bd" style={{ background: '#5a0f24' }}><span>▦</span><b>{nAreas}</b></div>
          <div className="tx"><b>Áreas monitoreadas</b><span className="mut">Sólidos, líquidos y más</span></div>
        </div>
        <div className="card kpi">
          <div className="bd" style={{ background: '#1f9d55' }}><span>✔</span><b>{okAreas}</b></div>
          <div className="tx"><b>Áreas en rango</b><span className="mut">Condición estable</span></div>
        </div>
        <div className="card kpi">
          <div className="bd" style={{ background: '#d98e04' }}><span>☰</span><b>{logCount}</b></div>
          <div className="tx"><b>Lecturas en sesión</b><span className="mut">Temperatura, humedad, presión</span></div>
        </div>
        <div className="card kpi">
          <div className="bd" style={{ background: '#c8102e' }}><span>▲</span><b>{alerts.length}</b></div>
          <div className="tx"><b>Alertas registradas</b><span className="mut">Correo al gerente</span></div>
        </div>
      </div>

      <div className="cols">
        <div className="card">
          <b>▦ Estado por área</b>
          {areas.filter(a => a.estado !== 'sin_datos').map(a => (
            <div key={a.area_id} className="it" onClick={() => navigate(`/areas/${a.area_id}`)}>
              <div>
                <b>{a.nombre}<span className="tag">{Number(a.temperatura || 0).toFixed(1)} °C</span></b>
                <span className="mut">Humedad {Number(a.humedad || 0).toFixed(0)} % · Presión {Number(a.presion || 0).toFixed(1)} Pa</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`pill ${a.estado === 'ok' ? '' : a.estado}`}>{lab[a.estado] || 'Estable'}</span>
                <div className="mut">Limites: {a.temp_min || '--'}–{a.temp_max || '--'}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="stack">
          <div className="card">
            <b>＋ Acciones rápidas</b>
            <div className="qg noprint">
              <button className="qa" onClick={handleEmergency}><i>▲</i>Simular emergencia</button>
              <button className="qa" onClick={() => navigate('/values')}><i>☰</i>Ver registros</button>
              <button className="qa" onClick={() => window.print()}><i>⎙</i>Descargar PDF</button>
              <button className="qa" onClick={() => navigate('/areas')}><i>▦</i>Nueva área</button>
            </div>
          </div>
          <div className="card">
            <b>◔ Tareas pendientes</b>
            {tasks.map((t, i) => (
              <div key={i} style={{ marginTop: '10px' }}>
                <span className="dot" style={{ background: t[2] }}></span>{t[0]}
                <div className="mut" style={{ marginLeft: '16px' }}>{t[1]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="cols">
        <div className="card">
          <b>◷ Actividad reciente</b>
          {alerts.slice(0, 5).map((a, i) => (
            <div key={i} className="it">
              <div>
                <b>{a.area_nombre || a.a}</b>
                <span className="mut" style={{ display: 'block' }}>{a.mensaje || a.msg}</span>
              </div>
              <span className="mut">{format(new Date(a.created_at || a.ts), 'dd/MM/yyyy HH:mm', { locale: es })}</span>
            </div>
          ))}
          {alerts.length === 0 && <p className="mut" style={{ marginTop: 12 }}>Sin novedades. Todo opera dentro de rango.</p>}
        </div>

        <div className="card">
          <b>↗ Tendencias de la sesión</b>
          {[['t', 'Temperatura (°C)'], ['h', 'Humedad (%)'], ['p', 'Presión (Pa)']].map(([k, l]) => {
            const s = getSeries(k);
            return (
              <div key={k}>
                <div className="mut" style={{ marginTop: '8px' }}>{l}</div>
                {s.length > 0 ? <Sparkline series={s} w={300} h={64} /> : <div className="mut" style={{ height: 64, display: 'flex', alignItems: 'center' }}>Esperando datos...</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  )
}