import { usePageTitle } from '../hooks/usePageTitle'
// ============================================
// PHARMA MONITOR - USERS & ROLES PAGE (ADMIN)
// ============================================

import { useState, useEffect } from 'react'
import { UserPlus, Mail, Shield, Edit, Trash2, Building, CheckCircle2 } from 'lucide-react'
import { api } from '../services/api'
import toast from 'react-hot-toast'

const roles = [
  { value: 'admin', label: '👑 Gerente General (Control y alertas de todas las áreas)', badge: '👑 Gerente General' },
  { value: 'supervisor', label: '🛡️ Encargado de Área (Gestiona su sala y recibe sus alertas)', badge: '🛡️ Encargado' },
  { value: 'operador', label: '👷 Empleado / Operador (Solo lectura operativa de su área)', badge: '👷 Empleado' }
]

export default function Users() {
  usePageTitle('Usuarios y Roles')

  const [users, setUsers] = useState([])
  const [institutional, setInstitutional] = useState([])
  const [areasList, setAreasList] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState('user') // 'user' | 'institutional'
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    nombre: '',
    correo: '',
    password: '',
    rol: 'operador',
    cargo: 'operador',
    area_id: ''
  })

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    try {
      // Cargar áreas primero
      try {
        const areasRes = await api.get('/areas')
        const list = areasRes.data?.areas || (Array.isArray(areasRes.data) ? areasRes.data : [])
        setAreasList(list)
      } catch (e) {
        console.warn('Error cargando áreas:', e)
      }

      // Cargar usuarios
      try {
        const usersRes = await api.get('/auth/users')
        if (usersRes.data?.users) {
          setUsers(usersRes.data.users)
        }
      } catch (e) {
        console.warn('Error cargando usuarios:', e)
      }

      // Cargar correos
      try {
        const instRes = await api.get('/correos_institucionales')
        if (Array.isArray(instRes.data)) {
          setInstitutional(instRes.data)
        }
      } catch (e) {
        console.warn('Error cargando correos institucionales:', e)
      }
    } finally {
      setLoading(false)
    }
  }

  const openCreate = (type) => {
    setModalType(type)
    setEditing(null)
    if (areasList.length === 0) {
      api.get('/areas').then(r => setAreasList(r.data?.areas || [])).catch(() => {})
    }
    if (type === 'user') {
      setForm({ nombre: '', correo: '', password: '', rol: 'operador', cargo: 'operador', area_id: '' })
    } else {
      setForm({ nombre: '', correo: '', cargo: 'operador', rol: 'operador', area_id: '' })
    }
    setModalOpen(true)
  }

  const openEdit = (item, type) => {
    setModalType(type)
    setEditing(item)
    if (areasList.length === 0) {
      api.get('/areas').then(r => setAreasList(r.data?.areas || [])).catch(() => {})
    }
    if (type === 'user') {
      setForm({
        nombre: item.nombre,
        correo: item.correo_institucional,
        password: '',
        rol: (item.rol || 'operador').toLowerCase(),
        area_id: item.area_id || ''
      })
    } else {
      setForm({
        nombre: item.nombre_completo,
        correo: item.correo,
        cargo: (item.cargo || 'operador').toLowerCase(),
        area_id: item.area_id || ''
      })
    }
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validar que si no es admin, debe tener un área seleccionada
    const currentRol = modalType === 'user' ? form.rol : form.cargo
    if (currentRol !== 'admin' && !form.area_id) {
      toast.error('Debes asignar un área obligatoria para este usuario')
      return
    }

    try {
      if (modalType === 'user') {
        if (editing) {
          const res = await api.patch(`/auth/users/${editing.id}`, {
            nombre: form.nombre,
            rol: form.rol,
            area_id: form.rol === 'admin' ? null : form.area_id
          })
          toast.success('Usuario actualizado correctamente')
          if (res.data?.user) {
            setUsers(prev => prev.map(u => u.id === editing.id ? { ...u, ...res.data.user } : u))
          }
        } else {
          const res = await api.post('/auth/register', {
            nombre: form.nombre,
            correo: form.correo,
            password: form.password,
            rol: form.rol,
            area_id: form.rol === 'admin' ? null : form.area_id
          })
          toast.success('Usuario registrado con éxito en el sistema')
          if (res.data?.user) {
            setUsers(prev => [res.data.user, ...prev.filter(u => u.id !== res.data.user.id)])
          }
        }
      } else {
        if (editing) {
          const res = await api.patch(`/correos_institucionales/${editing.id}`, {
            nombre_completo: form.nombre,
            cargo: form.cargo,
            area_id: form.cargo === 'admin' ? null : form.area_id
          })
          toast.success('Correo institucional actualizado')
          if (res.data) {
            setInstitutional(prev => prev.map(c => c.id === editing.id ? { ...c, ...res.data } : c))
          }
        } else {
          const res = await api.post('/correos_institucionales', {
            correo: form.correo,
            nombre_completo: form.nombre,
            cargo: form.cargo,
            rol_sistema: form.cargo,
            area_id: form.cargo === 'admin' ? null : form.area_id
          })
          toast.success('Correo institucional registrado')
          if (res.data) {
            setInstitutional(prev => [res.data, ...prev.filter(c => c.id !== res.data.id)])
          }
        }
      }
      closeModal()
      loadAll()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar usuario')
    }
  }

  const handleDelete = async (type, id) => {
    if (!window.confirm('¿Eliminar este usuario o correo registrado?')) return
    try {
      if (type === 'user') {
        await api.delete(`/auth/users/${id}`)
        setUsers(prev => prev.filter(u => u.id !== id))
      } else {
        await api.delete(`/correos_institucionales/${id}`)
        setInstitutional(prev => prev.filter(c => c.id !== id))
      }
      toast.success('Registro eliminado')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error eliminando')
    }
  }

  if (loading) return (
    <div className="loading-screen" style={{ padding: 40, textAlign: 'center' }}>
      Cargando usuarios y áreas...
    </div>
  )

  return (
    <div>
      <div className="top">
        <div>
          <h2>Usuarios, Permisos y Áreas</h2>
          <div className="mut">Administración de acceso por áreas y destinatarios de alertas</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" onClick={() => openCreate('user')}>
            <UserPlus size={16} /> Crear usuario
          </button>
          <button className="btn sec" onClick={() => openCreate('institutional')}>
            <Mail size={16} /> Registrar correo de alerta
          </button>
        </div>
      </div>

      {/* Tabla 1: Usuarios con Login */}
      <div className="card scr">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0 }}>Cuentas de Acceso al Sistema</h3>
            <span className="mut" style={{ fontSize: '12.5px' }}>
              Control de roles, permisos de visualización y áreas asignadas
            </span>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Nombre Completo</th>
              <th>Correo Institucional</th>
              <th>Rol y Jerarquía</th>
              <th>Área Asignada</th>
              <th style={{ width: '100px', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const rolLower = (u.rol || '').toLowerCase()
              const isGlobal = rolLower === 'admin'
              return (
                <tr key={u.id}>
                  <td><strong>{u.nombre}</strong></td>
                  <td>{u.correo_institucional}</td>
                  <td>
                    <span
                      className={`pill ${isGlobal ? '' : rolLower === 'supervisor' ? 'warn' : 'sec'}`}
                      style={{ fontSize: '11px', fontWeight: 700 }}
                    >
                      {isGlobal ? '👑 Gerente General' : rolLower === 'supervisor' ? '🛡️ Encargado' : '👷 Empleado'}
                    </span>
                  </td>
                  <td>
                    {isGlobal ? (
                      <span className="pill" style={{ background: 'var(--wine)', color: '#fff', fontSize: '11px' }}>
                        🌐 Global (Todas las áreas)
                      </span>
                    ) : u.area_nombre ? (
                      <span className="pill" style={{ background: '#0A84FF', color: '#fff', fontSize: '11px' }}>
                        📍 {u.area_nombre}
                      </span>
                    ) : (
                      <span className="pill warn" style={{ fontSize: '11px' }}>
                        ⚠️ Sin área asignada
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '4px' }}>
                      <button className="btn sec sm" onClick={() => openEdit(u, 'user')} title="Editar usuario">
                        <Edit size={14} />
                      </button>
                      <button className="btn red sm" onClick={() => handleDelete('user', u.id)} title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Tabla 2: Correos Institucionales y Notificaciones */}
      <div className="card scr" style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0 }}>Destinatarios de Alertas por Correo</h3>
            <span className="mut" style={{ fontSize: '12.5px' }}>
              Personas que reciben correos automáticos cuando ocurre una emergencia en cada sala
            </span>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo Electrónico</th>
              <th>Cargo</th>
              <th>Área de Alerta Asignada</th>
              <th style={{ width: '100px', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {institutional.length === 0 ? (
              <tr>
                <td colSpan="5" className="mut" style={{ textAlign: 'center', padding: '24px' }}>
                  No hay correos adicionales registrados. Las alertas se dirigen a los Encargados de Área y al Gerente General.
                </td>
              </tr>
            ) : (
              institutional.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.nombre_completo}</strong></td>
                  <td>{c.correo}</td>
                  <td><span className="pill sec">{c.cargo}</span></td>
                  <td>
                    {c.area_nombre ? (
                      <span className="pill" style={{ background: '#0A84FF', color: '#fff', fontSize: '11px' }}>
                        📍 {c.area_nombre}
                      </span>
                    ) : (
                      <span className="pill" style={{ background: 'var(--wine)', color: '#fff', fontSize: '11px' }}>
                        🌐 Global (Todas las áreas)
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '4px' }}>
                      <button className="btn sec sm" onClick={() => openEdit(c, 'institutional')} title="Editar">
                        <Edit size={14} />
                      </button>
                      <button className="btn red sm" onClick={() => handleDelete('institutional', c.id)} title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Crear / Editar */}
      {modalOpen && (
        <div className="modal on" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="card" style={{ maxWidth: '460px', width: '100%' }}>
            <h3 style={{ marginBottom: '16px' }}>
              {modalType === 'user'
                ? (editing ? 'Editar Usuario y Permisos' : 'Crear Nuevo Usuario')
                : (editing ? 'Editar Correo de Alerta' : 'Registrar Correo de Alerta')}
            </h3>

            <form onSubmit={handleSubmit}>
              <label>Nombre Completo</label>
              <input
                value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                required
                placeholder="Ej: Carlos Silva"
              />

              <label>Correo Institucional</label>
              <input
                type="email"
                value={form.correo}
                onChange={e => setForm({ ...form, correo: e.target.value })}
                required
                placeholder="csilva@siegfried.com"
              />

              {modalType === 'user' && (
                <>
                  <label>Contraseña {editing ? '(dejar en blanco para no modificar)' : ''}</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder={editing ? '••••••••' : 'Mínimo 6 caracteres'}
                    required={!editing}
                  />

                  <label>Rol y Jerarquía</label>
                  <select
                    value={form.rol}
                    onChange={e => setForm({ ...form, rol: e.target.value })}
                  >
                    {roles.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>

                  {form.rol === 'admin' ? (
                    <div style={{
                      padding: '12px',
                      background: 'color-mix(in srgb, var(--wine) 12%, transparent)',
                      borderRadius: '8px',
                      border: '1px solid color-mix(in srgb, var(--wine) 30%, var(--line))',
                      fontSize: '12.5px',
                      marginTop: '12px'
                    }}>
                      👑 <strong>Gerente General:</strong> Acceso absoluto a todas las áreas, modificación de cualquier configuración y recepción de <strong>todas las alertas</strong> del laboratorio.
                    </div>
                  ) : (
                    <div style={{ marginTop: '12px' }}>
                      <label>
                        Área Asignada <span style={{ color: 'var(--red)' }}>*</span>
                      </label>
                      <select
                        value={form.area_id}
                        onChange={e => setForm({ ...form, area_id: e.target.value })}
                        required
                      >
                        <option value="">Selecciona el área del usuario...</option>
                        {areasList.map(a => (
                          <option key={a.id} value={a.id}>{a.nombre}</option>
                        ))}
                      </select>
                      <span className="mut" style={{ fontSize: '11.5px', display: 'block', marginTop: '4px' }}>
                        {form.rol === 'supervisor'
                          ? '🛡️ El Encargado solo verá y modificará esta sala, y solo le llegarán las alertas de este sector.'
                          : '👷 El Empleado solo tendrá visibilidad de lectura para monitorear esta sala.'}
                      </span>
                    </div>
                  )}
                </>
              )}

              {modalType === 'institutional' && (
                <>
                  <label>Cargo / Función</label>
                  <select
                    value={form.cargo}
                    onChange={e => setForm({ ...form, cargo: e.target.value })}
                  >
                    {roles.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>

                  {form.cargo !== 'admin' && (
                    <div style={{ marginTop: '12px' }}>
                      <label>
                        Área a la que pertenece <span style={{ color: 'var(--red)' }}>*</span>
                      </label>
                      <select
                        value={form.area_id}
                        onChange={e => setForm({ ...form, area_id: e.target.value })}
                        required
                      >
                        <option value="">Selecciona el área...</option>
                        {areasList.map(a => (
                          <option key={a.id} value={a.id}>{a.nombre}</option>
                        ))}
                      </select>
                      <span className="mut" style={{ fontSize: '11.5px', display: 'block', marginTop: '4px' }}>
                        Este correo solo recibirá notificaciones cuando ocurra una emergencia en esta sala.
                      </span>
                    </div>
                  )}
                </>
              )}

              <div className="row" style={{ marginTop: '20px' }}>
                <button className="btn" type="submit" style={{ flex: 1 }}>
                  {editing ? 'Guardar Cambios' : 'Registrar'}
                </button>
                <button className="btn sec" type="button" onClick={closeModal}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}