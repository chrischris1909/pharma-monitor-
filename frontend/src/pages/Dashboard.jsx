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

const lab = { ok: 'Estable', warn: 'Regular', bad: 'Irregular', offline: '🔌 Sin conexión' }

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
      const [areasRes, alertsRes, lecturasRes] = await Promise.all([
        api.get('/areas/estado'),
        api.get('/alertas/pendientes'),
        api.get('/sensores/lecturas?limit=150')
      ])
      setAreas(areasRes.data.areas || [])
      setAlerts(alertsRes.data.alertas || [])

      const rawLogs = Array.isArray(lecturasRes.data?.lecturas) ? [...lecturasRes.data.lecturas].reverse() : []
      const initialHist = {}
      rawLogs.forEach(l => {
        if (!l.area_id) return
        if (!initialHist[l.area_id]) initialHist[l.area_id] = []
        initialHist[l.area_id].push({
          t: Number(l.temperatura || 0),
          h: Number(l.humedad || 0),
          p: Number(l.presion || 0)
        })
      })
      setHistory(initialHist)
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
      setAreas(prev => prev.map(a => (a.area_id === lectura.area_id || a.id === lectura.area_id) ? { ...a, ...lectura } : a))
      setHistory(prev => {
        const newHist = { ...prev }
        if (!newHist[lectura.area_id]) newHist[lectura.area_id] = []
        newHist[lectura.area_id] = [...newHist[lectura.area_id], { t: Number(lectura.temperatura), h: Number(lectura.humedad), p: Number(lectura.presion) }].slice(-40)
        return newHist
      })
    })
    const unsub2 = ws.on('alerta:nueva', (alerta) => {
      if (alerta?.resuelta) {
        setAlerts(prev => prev.filter(x => x.id !== alerta.id))
      } else {
        setAlerts(prev => [alerta, ...prev.filter(x => x.id !== alerta.id).slice(0, 9)])
        toast.error(`Alerta en ${alerta.area_nombre || 'Laboratorio'}: ${alerta.mensaje}`)
      }
    })
    const unsub3 = ws.on('estado:actual', (estadoAreas) => {
      if (Array.isArray(estadoAreas) && estadoAreas.length > 0) setAreas(estadoAreas)
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
        const targetArea = (user?.area_id && areas.find(a => (a.id === user.area_id || a.area_id === user.area_id))) || areas[0]
        if (targetArea) {
          const areaId = targetArea.id || targetArea.area_id
          setEmergency(areaId)
          toast(`Simulando emergencia en ${targetArea.nombre}`, { icon: '🚨' })
          const res = await api.post('/alertas/simular', { area_id: areaId })
          toast.success(res.data?.message || 'Correo de alerta enviado a los responsables de esta área')
          fetchData()
        } else {
          toast.error('No hay áreas activas disponibles')
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
  const isOperador = user?.rol?.toLowerCase() === 'operador'

  const tasks = [
    ['Calibrar sensor de presión · Pesada', 'Vence 15 nov', '#c8102e'],
    ['Revisar parámetros del área Líquidos', 'Vence 18 nov', '#c8102e'],
    ['Validar informe mensual BPM', 'Vence 24 nov', '#d98e04'],
    ['Verificar conexión ESP32 de Sólidos', 'Vence 30 nov', '#d98e04']
  ]

  const colors = ['#7a1530','#c8102e','#8a8486','#d98e04','#1f9d55']
  const getSeries = (key) => areas.map((a, i) => ({ v: (history[a.area_id || a.id] || []).map(r => r[key]), c: colors[i % colors.length] })).filter(s => s.v.length > 0)

  return (
    <div>
      <div className="top">
        <div>
          <h2>{gr}, {userName}.</h2>
          <div className="mut">
            Planta de producción · {user?.rol?.toLowerCase() === 'admin' ? '👑 Control Global (Todas las áreas)' : `📍 Área Asignada: ${user?.area_nombre || 'Sector'}`} · {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        {!isOperador && (
          <button className="btn red noprint" onClick={handleEmergency}>
            {emergency ? 'Terminar simulación' : 'Simular emergencia'}
          </button>
        )}
      </div>

      {tip && (
        <div className="tipb noprint">
          <span>ⓘ</span>
          <span><b>Tip:</b> pulsa “Simular emergencia” para ver cómo se activa la alerta en vivo y el envío de correo a los responsables del área.</span>
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
          <div className="tx"><b>Alertas pendientes</b><span className="mut">Notificadas por correo</span></div>
        </div>
      </div>

      <div className="cols">
        <div className="card">
          <b>▦ Estado por área</b>
          {areas.map(a => {
            const aid = a.area_id || a.id
            const isEmerg = emergency === aid
            const currentEstado = isEmerg ? 'bad' : (a.nodo_desconectado ? 'offline' : (a.estado || 'ok'))
            return (
              <div key={aid} className="it" onClick={() => navigate(`/areas/${aid}`)}>
                <div>
                  <b>{a.nombre}<span className="tag">{a.temperatura != null ? Number(a.temperatura).toFixed(1) : '--'} °C</span></b>
                  <span className="mut">
                    Humedad {a.humedad != null ? Number(a.humedad).toFixed(0) : '--'} % · Presión {a.presion != null ? Number(a.presion).toFixed(1) : '--'} Pa
                    {a.sensor_id ? ` · ${a.sensor_id}` : ''}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`pill ${currentEstado === 'ok' ? '' : currentEstado === 'offline' ? 'warn' : currentEstado}`}>
                    {lab[currentEstado] || 'Estable'}
                  </span>
                  <div className="mut">Límites: {a.temp_min ?? 18}–{a.temp_max ?? 25} °C</div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="stack">
          <div className="card">
            <b>＋ Acciones rápidas</b>
            <div className="qg noprint">
              <button className="qa" onClick={() => navigate('/tv')}><i>📺</i>Modo Sala / TV</button>
              {!isOperador && <button className="qa" onClick={handleEmergency}><i>▲</i>Simular emergencia</button>}
              <button className="qa" onClick={() => navigate('/values')}><i>☰</i>Ver registros</button>
              <button className="qa" onClick={() => window.print()}><i>⎙</i>Descargar PDF</button>
              {user?.rol?.toLowerCase() === 'admin' && (
                <button className="qa" onClick={() => navigate('/areas')}><i>▦</i>Gestionar áreas</button>
              )}
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