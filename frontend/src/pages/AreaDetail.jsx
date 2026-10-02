// ============================================
// PHARMA MONITOR - AREA DETAIL PAGE
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, NavLink } from 'react-router-dom'
import { ChevronLeft, Download, Zap, RotateCcw, Image } from 'lucide-react'
import { api, ws } from '../services/api'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

const lab = { ok: 'Estable', warn: 'Regular', bad: 'Irregular' }

export default function AreaDetail() {
  const { id } = useParams()
  const [area, setArea] = useState(null)
  const [loading, setLoading] = useState(true)
  const [emergency, setEmergency] = useState(false)
  const [imgUrl, setImgUrl] = useState('')

  const loadArea = useCallback(async () => {
    try {
      const [areaRes, paramsRes] = await Promise.all([
        api.get(`/areas/${id}`),
        api.get(`/areas/${id}/parametros`)
      ])
      const a = { ...areaRes.data.area, ...paramsRes.data.parametros }
      setArea(a)
      setImgUrl(a.imagen_url || '')
    } catch (err) {
      toast.error('Error cargando área')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadArea()
    const unsub = ws.on('lectura:nueva', (l) => {
      if (area && l.area_id === area.id) setArea(prev => ({ ...prev, ...l }))
    })
    return () => unsub()
  }, [loadArea, area])

  const handleEmergency = () => {
    setEmergency(e => !e)
    toast[setEmergency ? 'error' : 'success'](setEmergency ? 'Simulando emergencia' : 'Emergencia terminada')
  }

  const handleImgSave = async () => {
    try {
      await api.patch(`/areas/${id}`, { imagen_url: imgUrl })
      toast.success('Foto actualizada')
    } catch { toast.error('Error guardando foto') }
  }

  if (loading) return <div className="loading-screen" style={{ padding: 40, textAlign: 'center' }}>Cargando área...</div>
  if (!area) return <div className="card" style={{ textAlign: 'center', padding: 40 }}>Área no encontrada</div>

  const s = area
  const params = { t: [s.temp_min, s.temp_max], h: [0, s.humedad_max], p: [s.presion_min, s.presion_max] }
  const states = { t: s.temperatura < params.t[0] || s.temperatura > params.t[1] ? 'bad' : 'ok', h: s.humedad > params.h[1] ? 'bad' : 'ok', p: s.presion < params.p[0] || s.presion > params.p[1] ? 'bad' : 'ok' }

  return (
    <div>
      <div className="top">
        <div>
          <NavLink to="/areas" className="btn sec sm" style={{ marginBottom: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <ChevronLeft size={16} /> Volver
          </NavLink>
          <h2 style={{ marginTop: '10px' }}>{area.nombre}</h2>
          <div className="mut">{area.descripcion}</div>
        </div>
        <div className="noprint" style={{ display: 'flex', gap: '8px' }}>
          <button className="btn red" onClick={handleEmergency} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={16} /> {emergency ? 'Normalizar' : 'Forzar emergencia'}
          </button>
          <button className="btn sec" onClick={loadArea}><RotateCcw size={16} /> Actualizar</button>
        </div>
      </div>

      <div className={`status ${Object.values(states).includes('bad') ? 'bad' : Object.values(states).includes('warn') ? 'warn' : 'ok'}`}>
        <span className="led" />
        <b>{Object.values(states).includes('bad') ? 'Irregular' : Object.values(states).includes('warn') ? 'Regular' : 'Estable'}</b>
      </div>

      <div className="grid g3">
        {[
          { key: 'temperatura', label: 'Temperatura', unit: '°C', range: params.t, color: '#7a1530' },
          { key: 'humedad', label: 'Humedad', unit: '%', range: params.h, color: '#c8102e' },
          { key: 'presion', label: 'Presión', unit: 'Pa', range: params.p, color: '#1f9d55' }
        ].map(p => (
          <div className="card" key={p.key}>
            <div className="mut">{p.label} · rango {p.range[0]}–{p.range[1]} {p.unit}</div>
            <div className="big">{s[p.key]?.toFixed(1)} {p.unit}</div>
            <svg className="ch" viewBox="0 0 300 110" role="img" aria-label={p.label}>
              <polyline fill="none" stroke={p.color} strokeWidth="2"
                points={(s.historial?.[p.key] || [s[p.key]]).map((v, i) => `${8 + i * (284 / Math.max(1, (s.historial?.[p.key]?.length || 1) - 1))},${102 - (v - Math.min(...(s.historial?.[p.key] || [s[p.key]]))) / (Math.max(...(s.historial?.[p.key] || [s[p.key]])) - Math.min(...(s.historial?.[p.key] || [s[p.key]])) || 1) * 94}`).join(' ')}
              />
            </svg>
        </div>
      ))}
    </div>

    <div className="card noprint" style={{ marginTop: '16px' }}>
      <b>Foto de la sala</b>
        <div className="row" style={{ marginTop: '8px', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <input id="im" value={imgUrl} onChange={e => setImgUrl(e.target.value)} placeholder="https://… (URL de la imagen)" />
          </div>
          <div style={{ flex: 0 }}>
            <button className="btn" onClick={handleImgSave}><Image size={16} /> Guardar</button>
          </div>
        </div>
        {imgUrl && <img src={imgUrl} alt={area.nombre} style={{ marginTop: '12px', borderRadius: '8px', maxHeight: '200px', objectFit: 'cover' }} />}
      </div>

      <div className="card" style={{ marginTop: '16px' }}>
        <b>Notas de la sala</b>
        <textarea rows="3" placeholder="Escribe observaciones de calibración, mantenimiento o lotes…" style={{ marginTop: '8px', width: '100%' }} />
      </div>
    </div>
  )
}