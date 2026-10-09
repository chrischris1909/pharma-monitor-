import { usePageTitle } from '../hooks/usePageTitle'
// ============================================
// PHARMA MONITOR - AREAS PAGE
// ============================================

import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { Plus, Edit, Trash2, Image, ChevronDown, ChevronUp } from 'lucide-react'
import { api, ws } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const lab = { ok: 'Estable', warn: 'Regular', bad: 'Irregular' }

export default function Areas() {
  usePageTitle('Áreas y Variables')

  const { user } = useAuth()
  const isAdminOrSuper = user?.rol === 'Admin' || user?.rol === 'Supervisor'
  
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ nombre: '', descripcion: '', tipo_area: 'solidos', imagen_url: '', temp_min: 18, temp_max: 32, humedad_max: 65, presion_min: 10, presion_max: 15 })

  useEffect(() => {
    loadAreas()
    const unsub = ws.on('lectura:nueva', (l) => setAreas(prev => prev.map(a => a.id === l.area_id ? { ...a, ...l } : a)))
    return () => unsub()
  }, [])

  const loadAreas = async () => {
    try {
      const res = await api.get('/areas')
      setAreas(res.data.areas)
    } catch (err) {
      toast.error('Error cargando áreas')
    } finally {
      setLoading(false)
    }
  }

  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const areaData = { 
        nombre: form.nombre, 
        descripcion: form.descripcion, 
        tipo_area: form.tipo_area, 
        imagen_url: form.imagen_url,
        ultima_calibracion: form.ultima_calibracion,
        frecuencia_calibracion_meses: form.frecuencia_calibracion_meses
      }
      if (editing) {
        await api.patch(`/areas/${editing.id}`, areaData)
        await api.put(`/areas/${editing.id}/parametros`, { temp_min: form.temp_min, temp_max: form.temp_max, humedad_min: 0, humedad_max: form.humedad_max, presion_min: form.presion_min, presion_max: form.presion_max })
        toast.success('Área actualizada')
      } else {
        const res = await api.post('/areas', areaData)
        await api.put(`/areas/${res.data.area.id}/parametros`, { temp_min: form.temp_min, temp_max: form.temp_max, humedad_min: 0, humedad_max: form.humedad_max, presion_min: form.presion_min, presion_max: form.presion_max })
        toast.success('Área creada')
      }
      closeModal()
      loadAreas()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error guardando área')
    } finally {
      setSaving(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ nombre: '', descripcion: '', tipo_area: 'solidos', imagen_url: '', temp_min: 18, temp_max: 32, humedad_max: 65, presion_min: 10, presion_max: 15, ultima_calibracion: new Date().toISOString().split('T')[0], frecuencia_calibracion_meses: 6 })
    setModalOpen(true)
  }

  const openEdit = (a) => {
    setEditing(a)
    setForm({ nombre: a.nombre, descripcion: a.descripcion || '', tipo_area: a.tipo_area || 'solidos', imagen_url: a.imagen_url || '', temp_min: a.temp_min || 18, temp_max: a.temp_max || 32, humedad_max: a.humedad_max || 65, presion_min: a.presion_min || 10, presion_max: a.presion_max || 15, ultima_calibracion: a.ultima_calibracion || new Date().toISOString().split('T')[0], frecuencia_calibracion_meses: a.frecuencia_calibracion_meses || 6 })
    setModalOpen(true)
  }

  const closeModal = () => { setModalOpen(false); setEditing(null) }

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta área? Se borrarán sus lecturas y parámetros.')) return
    try {
      await api.delete(`/areas/${id}`)
      toast.success('Área eliminada')
      loadAreas()
    } catch (err) {
      toast.error('Error eliminando área')
    }
  }

  if (loading) return <div className="loading-screen" style={{ padding: 40, textAlign: 'center' }}>Cargando áreas...</div>

  return (
    <div>
      <div className="top">
        <h2>Áreas y variables</h2>
        {isAdminOrSuper && <button className="btn noprint" onClick={openCreate}><Plus size={16} /> Agregar área</button>}
      </div>

      <div className="grid g3">
        {areas.map(a => {
          const s = a
          return (
            <NavLink to={`/areas/${a.id}`} key={a.id} className="card area" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="ph" style={a.imagen_url ? { background: `linear-gradient(rgba(90,15,36,.3),rgba(90,15,36,.8)),url('${a.imagen_url}') center/cover` } : {}}>
                {a.nombre}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b>{a.nombre}</b>
                <span className={`pill ${s.estado === 'ok' ? '' : s.estado}`}>{lab[s.estado]}</span>
              </div>
              <p className="mut" style={{ margin: '6px 0 10px' }}>{a.descripcion || 'Sin descripción.'}</p>
              <div style={{ display: 'flex', gap: '16px', fontWeight: 700, fontSize: '14px' }}>
                <span>{s.temperatura != null ? Number(s.temperatura).toFixed(1) : '--'} °C</span>
                <span>{s.humedad != null ? Number(s.humedad).toFixed(0) : '--'} %</span>
                <span>{s.presion != null ? Number(s.presion).toFixed(1) : '--'} Pa</span>
              </div>
              <div className="mut" style={{ marginTop: '6px' }}>Rango: {a.temp_min}–{a.temp_max} °C · ≤{a.humedad_max} % · {a.presion_min}–{a.presion_max} Pa</div>
              
              <div style={{ marginTop: '10px', fontSize: '11px', padding: '6px 8px', borderRadius: '6px', background: (a.frecuencia_calibracion_meses && a.ultima_calibracion) ? ((new Date(new Date(a.ultima_calibracion).setMonth(new Date(a.ultima_calibracion).getMonth() + a.frecuencia_calibracion_meses)) - new Date()) / (1000 * 60 * 60 * 24) < 15 ? 'rgba(255, 159, 10, 0.15)' : 'rgba(40, 205, 65, 0.1)') : 'var(--line)', color: 'var(--ink)' }}>
                {a.ultima_calibracion ? (
                  <span>
                    <b>Próx. Calibración:</b> {new Date(new Date(a.ultima_calibracion).setMonth(new Date(a.ultima_calibracion).getMonth() + (a.frecuencia_calibracion_meses || 6))).toLocaleDateString()}
                  </span>
                ) : 'Calibración: No configurada'}
              </div>

              {isAdminOrSuper && (
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button className="btn sec sm" onClick={e => { e.preventDefault(); openEdit(a) }}><Edit size={14} /> Editar</button>
                  <button className="btn red sm" onClick={e => { e.preventDefault(); handleDelete(a.id) }}><Trash2 size={14} /> Eliminar</button>
                </div>
              )}
            </NavLink>
          )
        })}
      </div>

      <div style={{ marginTop: '16px' }} className="mut">
        Las fotos reales de cada sala se cargan desde la URL de imagen al agregar o editar el área.
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="modal on" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="card" style={{ maxWidth: '500px' }}>
            <h3 style={{ marginBottom: '16px' }}>{editing ? 'Editar área' : 'Nueva área'}</h3>
            <form onSubmit={handleSubmit}>
              <label>Nombre</label>
              <input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} required placeholder="Ej: Mezcla Líquidos" />

              <label>Descripción</label>
              <input value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} placeholder="Descripción breve del área" />

              <label>Tipo de área</label>
              <select value={form.tipo_area} onChange={e => setForm({...form, tipo_area: e.target.value})}>
                <option value="liquidos">Líquidos</option>
                <option value="solidos">Sólidos</option>
                <option value="semisolidos">Semisólidos</option>
                <option value="esteriles">Estériles</option>
                <option value="control_calidad">Control Calidad</option>
                <option value="almacen">Almacén</option>
                <option value="otro">Otro</option>
              </select>

              <div className="row">
                <div><label>Temp. mín. °C</label><input type="number" value={form.temp_min} onChange={e => setForm({...form, temp_min: +e.target.value})} /></div>
                <div><label>Temp. máx. °C</label><input type="number" value={form.temp_max} onChange={e => setForm({...form, temp_max: +e.target.value})} /></div>
              </div>
              <div className="row">
                <div><label>Humedad máx. %</label><input type="number" value={form.humedad_max} onChange={e => setForm({...form, humedad_max: +e.target.value})} /></div>
                <div><label>Presión mín. Pa</label><input type="number" value={form.presion_min} onChange={e => setForm({...form, presion_min: +e.target.value})} /></div>
                <div><label>Presión máx. Pa</label><input type="number" value={form.presion_max} onChange={e => setForm({...form, presion_max: +e.target.value})} /></div>
              </div>
              <div className="row">
                <div><label>Última calibración</label><input type="date" value={form.ultima_calibracion ? form.ultima_calibracion.split('T')[0] : ''} onChange={e => setForm({...form, ultima_calibracion: e.target.value})} /></div>
                <div><label>Frecuencia (meses)</label><input type="number" value={form.frecuencia_calibracion_meses} onChange={e => setForm({...form, frecuencia_calibracion_meses: +e.target.value})} /></div>
              </div>

              <label>URL de imagen</label>
              <input value={form.imagen_url} onChange={e => setForm({...form, imagen_url: e.target.value})} placeholder="https://…" />

              <div className="row" style={{ marginTop: '16px' }}>
                <button className="btn" type="submit" style={{ flex: 1 }} disabled={saving}>{saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Guardar área')}</button>
                <button className="btn sec" type="button" onClick={closeModal} disabled={saving}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}