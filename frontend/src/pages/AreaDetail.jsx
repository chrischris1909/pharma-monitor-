import { usePageTitle } from '../hooks/usePageTitle'
// ============================================
// PHARMA MONITOR - AREA DETAIL PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, NavLink } from 'react-router-dom'
import { ChevronLeft, Zap, RotateCcw, Image, Save, Cpu, Send } from 'lucide-react'
import { api, ws } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const lab = { ok: 'Estable', warn: 'Regular', bad: 'Irregular' }

export default function AreaDetail() {
  usePageTitle('Detalles de Área')

  const { id } = useParams()
  const { user } = useAuth()
  const isOperador = user?.rol?.toLowerCase() === 'operador'

  const [area, setArea] = useState(null)
  const [loading, setLoading] = useState(true)
  const [emergency, setEmergency] = useState(false)
  const [imgUrl, setImgUrl] = useState('')
  const [notas, setNotas] = useState('')
  const [savingNotas, setSavingNotas] = useState(false)
  const [testReading, setTestReading] = useState({ temperatura: 21.5, humedad: 48, presion: 12.5 })
  const [sendingReading, setSendingReading] = useState(false)

  const loadArea = useCallback(async () => {
    try {
      const [areaRes, paramsRes, lecturasRes] = await Promise.all([
        api.get(`/areas/${id}`),
        api.get(`/areas/${id}/parametros`),
        api.get(`/sensores/lecturas?area_id=${id}&limit=30`)
      ])
      const rawLogs = Array.isArray(lecturasRes.data?.lecturas) ? [...lecturasRes.data.lecturas].reverse() : []
      const historial = {
        temperatura: rawLogs.map(l => Number(l.temperatura || 0)),
        humedad: rawLogs.map(l => Number(l.humedad || 0)),
        presion: rawLogs.map(l => Number(l.presion || 0))
      }
      const a = { ...areaRes.data.area, ...paramsRes.data.parametros, historial }
      setArea(a)
      setImgUrl(a.imagen_url || '')
      setNotas(a.descripcion || '')
      setEmergency(a.estado === 'bad')
    } catch (err) {
      toast.error('Error cargando área')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadArea()
    const unsub = ws.on('lectura:nueva', (l) => {
      if (l.area_id === id) {
        setArea(prev => {
          if (!prev) return prev
          const h = prev.historial || { temperatura: [], humedad: [], presion: [] }
          return {
            ...prev,
            ...l,
            historial: {
              temperatura: [...(h.temperatura || []), Number(l.temperatura)].slice(-30),
              humedad: [...(h.humedad || []), Number(l.humedad)].slice(-30),
              presion: [...(h.presion || []), Number(l.presion)].slice(-30),
            }
          }
        })
      }
    })
    return () => unsub()
  }, [loadArea, id])

  const handleEmergency = async () => {
    try {
      if (emergency) {
        // Normalizar enviando una lectura dentro del rango seguro
        const safeTemp = Number(((Number(area.temp_min || 18) + Number(area.temp_max || 25)) / 2).toFixed(1))
        const safeHum = Number(((Number(area.humedad_min || 35) + Number(area.humedad_max || 65)) / 2).toFixed(0))
        const safePres = Number(((Number(area.presion_min || 10) + Number(area.presion_max || 15)) / 2).toFixed(1))
        await api.post('/sensores/lectura', {
          area_id: id,
          temperatura: safeTemp,
          humedad: safeHum,
          presion: safePres
        })
        setEmergency(false)
        toast.success('Sala normalizada a parámetros estables')
        loadArea()
      } else {
        setEmergency(true)
        toast(`Forzando emergencia en ${area.nombre}...`, { icon: '🚨' })
        const res = await api.post('/alertas/simular', { area_id: id })
        await api.post('/sensores/lectura', {
          area_id: id,
          temperatura: Number(area.temp_max || 25) + 6.5,
          humedad: Number(area.humedad || 50),
          presion: Number(area.presion || 12)
        })
        toast.success(res.data?.message || 'Alerta enviada por correo a los responsables')
        loadArea()
      }
    } catch (err) {
      toast.error('Error al procesar emergencia')
    }
  }

  const handleSendTestReading = async (e) => {
    e.preventDefault()
    setSendingReading(true)
    try {
      const res = await api.post('/sensores/lectura', {
        area_id: id,
        sensor_id: area.sensor_id,
        temperatura: Number(testReading.temperatura),
        humedad: Number(testReading.humedad),
        presion: Number(testReading.presion)
      })
      if (res.data?.alertaGenerada) {
        toast.error(`Lectura registrada: Se disparó alerta automática y correo (${res.data.alertaGenerada.tipo})`)
      } else {
        toast.success('Lectura simulada de Arduino recibida en tiempo real')
      }
      loadArea()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error enviando lectura de prueba')
    } finally {
      setSendingReading(false)
    }
  }

  const handleWatchdogToggle = async () => {
    try {
      const isOffline = Boolean(area.nodo_desconectado || area.estado === 'offline')
      if (isOffline) {
        await api.post('/sensores/watchdog/reconectar', { area_id: id })
        toast.success('📶 Nodo Arduino ESP32 reconectado (Heartbeat activo)')
        loadArea()
      } else {
        toast('🔌 Detectando caída de nodo ESP32 (Watchdog)...', { icon: '⚠️' })
        const res = await api.post('/sensores/watchdog/desconectar', { area_id: id, minutos_sin_reporte: 15 })
        toast.error(res.data?.message || 'Nodo marcado como Sin Conexión y correo técnico enviado')
        loadArea()
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error procesando estado Watchdog')
    }
  }

  const handleImgSave = async () => {
    try {
      await api.patch(`/areas/${id}`, { imagen_url: imgUrl })
      toast.success('Foto actualizada')
      loadArea()
    } catch { toast.error('Error guardando foto') }
  }

  const handleNotasSave = async () => {
    setSavingNotas(true)
    try {
      await api.patch(`/areas/${id}`, { descripcion: notas })
      setArea(prev => ({ ...prev, descripcion: notas }))
      toast.success('Notas de la sala guardadas')
    } catch {
      toast.error('Error guardando notas')
    } finally {
      setSavingNotas(false)
    }
  }

  if (loading) return <div className="loading-screen" style={{ padding: 40, textAlign: 'center' }}>Cargando área...</div>
  if (!area) return <div className="card" style={{ textAlign: 'center', padding: 40 }}>Área no encontrada</div>

  const s = area
  const isOffline = Boolean(s.nodo_desconectado || s.estado === 'offline')
  const params = {
    t: [s.temp_min ?? 18, s.temp_max ?? 25],
    h: [s.humedad_min ?? 30, s.humedad_max ?? 65],
    p: [s.presion_min ?? 5, s.presion_max ?? 25]
  }
  const states = {
    t: s.temperatura < params.t[0] || s.temperatura > params.t[1] ? 'bad' : 'ok',
    h: s.humedad < params.h[0] || s.humedad > params.h[1] ? 'bad' : 'ok',
    p: s.presion < params.p[0] || s.presion > params.p[1] ? 'bad' : 'ok'
  }
  const isBad = emergency || Object.values(states).includes('bad')

  return (
    <div>
      <div className="top">
        <div>
          <NavLink to="/areas" className="btn sec sm" style={{ marginBottom: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <ChevronLeft size={16} /> Volver
          </NavLink>
          <h2 style={{ marginTop: '10px' }}>{area.nombre}</h2>
          <div className="mut">
            {area.descripcion} {area.sensor_id ? `· 🔌 Nodo Arduino: ${area.sensor_id}` : ''}
          </div>
        </div>
        <div className="noprint" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {!isOperador && (
            <>
              <button className="btn sec" onClick={handleWatchdogToggle} style={{ display: 'flex', alignItems: 'center', gap: '6px', borderColor: isOffline ? '#1f9d55' : '#d98e04', color: isOffline ? '#1f9d55' : '#d98e04' }}>
                <Cpu size={16} /> {isOffline ? 'Reconectar Nodo ESP32' : 'Simular Caída ESP32 (Watchdog)'}
              </button>
              <button className="btn red" onClick={handleEmergency} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={16} /> {isBad ? 'Normalizar sala' : 'Forzar emergencia'}
              </button>
            </>
          )}
          <button className="btn sec" onClick={loadArea}><RotateCcw size={16} /> Actualizar</button>
        </div>
      </div>

      <div className={`status ${isOffline ? 'warn' : isBad ? 'bad' : 'ok'}`}>
        <span className="led" />
        <b>
          {isOffline
            ? `🔌 SIN CONEXIÓN — El nodo Arduino (${area.sensor_id || 'ESP32'}) no reporta datos (Watchdog activo)`
            : isBad
            ? 'Irregular (Fuera de rango / Alerta Activa)'
            : 'Estable (Parámetros dentro de rango GMP · Nodo ESP32 En Línea)'}
        </b>
      </div>

      {/* Telemetría de Hardware y Heartbeat del Nodo ESP32 */}
      <div className="card" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Cpu size={20} style={{ color: isOffline ? 'var(--red)' : '#1f9d55' }} />
          <div>
            <b>Telemetría de Hardware · Nodo {area.sensor_id || 'ARD-ESP32'}</b>
            <div className="mut" style={{ fontSize: '12px' }}>
              Watchdog / Heartbeat: {isOffline ? '⚠️ Sin comunicación con el microcontrolador' : '✅ Latido activo y recibiendo paquetes HTTP'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '18px', fontSize: '13px', flexWrap: 'wrap' }}>
          <div><span className="mut">Estado:</span> <b style={{ color: isOffline ? 'var(--red)' : '#1f9d55' }}>{isOffline ? '🔌 Sin conexión' : '📶 En línea'}</b></div>
          <div><span className="mut">Señal Wi-Fi:</span> <b>{isOffline ? '0%' : `${area.senal_calidad ?? 96}%`}</b></div>
          <div><span className="mut">Batería UPS:</span> <b>{area.bateria_nivel ?? 100}%</b></div>
          <div><span className="mut">Firmware:</span> <code>{area.firmware_version || 'v2.4.0-ESP32'}</code></div>
        </div>
      </div>

      <div className="grid g3">
        {[
          { key: 'temperatura', label: 'Temperatura', unit: '°C', range: params.t, color: '#7a1530' },
          { key: 'humedad', label: 'Humedad', unit: '%', range: params.h, color: '#c8102e' },
          { key: 'presion', label: 'Presión', unit: 'Pa', range: params.p, color: '#1f9d55' }
        ].map(p => {
          const rawSeries = s.historial?.[p.key]?.length > 0 ? s.historial[p.key] : [Number(s[p.key] || 0)]
          const minVal = Math.min(...rawSeries)
          const maxVal = Math.max(...rawSeries)
          const span = (maxVal - minVal) || 1
          const points = rawSeries.map((v, i) => {
            const x = 8 + i * (284 / Math.max(1, rawSeries.length - 1))
            const y = 96 - ((v - minVal) / span) * 80
            return `${x.toFixed(1)},${y.toFixed(1)}`
          }).join(' ')

          return (
            <div className="card" key={p.key} style={{ opacity: isOffline ? 0.65 : 1 }}>
              <div className="mut">{p.label} · rango {p.range[0]}–{p.range[1]} {p.unit}</div>
              <div className="big">{s[p.key] != null ? Number(s[p.key]).toFixed(1) : '--'} {p.unit}</div>
              <svg className="ch" viewBox="0 0 300 110" role="img" aria-label={p.label}>
                <polyline fill="none" stroke={p.color} strokeWidth="2.5" points={points} />
              </svg>
            </div>
          )
        })}
      </div>

      {!isOperador && (
        <div className="card noprint" style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <b style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Cpu size={18} /> Prueba de Envío Manual de Paquete Arduino ESP32 ({area.sensor_id || 'ARD-NODE'})
              </b>
              <span className="mut" style={{ fontSize: '12.5px' }}>
                Envía un paquete puntual al endpoint del servidor para probar umbrales o reconectar el nodo si estaba en estado "Sin conexión".
              </span>
            </div>
          </div>
          <form onSubmit={handleSendTestReading} className="row" style={{ marginTop: '12px', alignItems: 'flex-end' }}>
            <div>
              <label>Temperatura (°C)</label>
              <input type="number" step="0.1" value={testReading.temperatura} onChange={e => setTestReading({ ...testReading, temperatura: e.target.value })} required />
            </div>
            <div>
              <label>Humedad (%)</label>
              <input type="number" step="0.1" value={testReading.humedad} onChange={e => setTestReading({ ...testReading, humedad: e.target.value })} required />
            </div>
            <div>
              <label>Presión (Pa)</label>
              <input type="number" step="0.1" value={testReading.presion} onChange={e => setTestReading({ ...testReading, presion: e.target.value })} required />
            </div>
            <div style={{ flex: '0 0 auto' }}>
              <button type="submit" className="btn" disabled={sendingReading}>
                <Send size={15} /> {sendingReading ? 'Enviando...' : 'Enviar lectura ESP32'}
              </button>
            </div>
          </form>
        </div>
      )}

      {!isOperador && (
        <div className="card noprint" style={{ marginTop: '16px' }}>
          <b>Foto de la sala</b>
          <div className="row" style={{ marginTop: '8px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <input id="im" value={imgUrl} onChange={e => setImgUrl(e.target.value)} placeholder="https://… o /images/areas/..." />
            </div>
            <div style={{ flex: 0 }}>
              <button className="btn" onClick={handleImgSave}><Image size={16} /> Guardar</button>
            </div>
          </div>
          {imgUrl && <img src={imgUrl} alt={area.nombre} style={{ marginTop: '12px', borderRadius: '8px', maxHeight: '200px', objectFit: 'cover' }} />}
        </div>
      )}

      <div className="card" style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b>Notas y observaciones de la sala</b>
          {!isOperador && (
            <button className="btn sec sm" onClick={handleNotasSave} disabled={savingNotas}>
              <Save size={14} /> {savingNotas ? 'Guardando...' : 'Guardar notas'}
            </button>
          )}
        </div>
        <textarea
          rows="3"
          value={notas}
          onChange={e => setNotas(e.target.value)}
          disabled={isOperador}
          placeholder="Escribe observaciones de calibración, mantenimiento o lotes…"
          style={{ marginTop: '8px', width: '100%' }}
        />
      </div>
    </div>
  )
}