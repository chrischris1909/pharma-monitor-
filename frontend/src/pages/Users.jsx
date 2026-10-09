import { usePageTitle } from '../hooks/usePageTitle'
// ============================================
// PHARMA MONITOR - USERS PAGE (ADMIN)
// ============================================

import { useState, useEffect } from 'react'
import { Plus, UserPlus, Mail, Shield, Eye, Edit, Trash2 } from 'lucide-react'
import { api } from '../services/api'
import toast from 'react-hot-toast'

const roles = ['Admin', 'Gerente', 'Calidad', 'Mantenimiento', 'Operador']

export default function Users() {
  usePageTitle('Usuarios')

  const [users, setUsers] = useState([])
  const [institutional, setInstitutional] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState('user') // 'user' | 'institutional'
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ nombre: '', correo: '', password: '', rol: 'Operador' })

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    try {
      const [usersRes, instRes] = await Promise.all([
        api.get('/auth/users'),
        api.get('/correos_institucionales')
      ])
      setUsers(usersRes.data.users)
      setInstitutional(instRes.data)
    } catch { toast.error('Error cargando usuarios') }
    finally { setLoading(false) }
  }

  const openCreate = (type) => {
    setModalType(type)
    setEditing(null)
    if (type === 'user') setForm({ nombre: '', correo: '', password: '', rol: 'Operador' })
    else setForm({ nombre: '', correo: '', cargo: 'Operador' })
    setModalOpen(true)
  }

  const openEdit = (item, type) => {
    setModalType(type)
    setEditing(item)
    if (type === 'user') setForm({ nombre: item.nombre, correo: item.correo_institucional, password: '', rol: item.rol })
    else setForm({ nombre: item.nombre_completo, correo: item.correo, cargo: item.cargo })
    setModalOpen(true)
  }

  const closeModal = () => { setModalOpen(false); setEditing(null) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (modalType === 'user') {
        if (editing) {
          await api.patch(`/auth/users/${editing.id}`, { nombre: form.nombre, rol: form.rol })
          toast.success('Usuario actualizado')
        } else {
          await api.post('/auth/register', { nombre: form.nombre, correo: form.correo, password: form.password, rol: form.rol })
          toast.success('Usuario creado')
        }
      } else {
        if (editing) {
          await api.patch(`/correos_institucionales/${editing.id}`, { nombre_completo: form.nombre, cargo: form.cargo })
        } else {
          await api.post('/correos_institucionales', { correo: form.correo, nombre_completo: form.nombre, cargo: form.cargo, rol_sistema: form.cargo })
        }
        toast.success('Correo institucional guardado')
      }
      closeModal()
      loadAll()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error guardando')
    }
  }

  const handleDelete = async (type, id) => {
    if (!window.confirm('¿Eliminar este registro?')) return
    try {
      if (type === 'user') await api.delete(`/auth/users/${id}`)
      else await api.delete(`/correos_institucionales/${id}`)
      toast.success('Eliminado')
      loadAll()
    } catch { toast.error('Error eliminando') }
  }

  if (loading) return <div className="loading-screen" style={{ padding: 40, textAlign: 'center' }}>Cargando...</div>

  return (
    <div>
      <div className="top">
        <h2>Usuarios y roles</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" onClick={() => openCreate('user')}>
            <UserPlus size={16} /> Crear usuario
          </button>
          <button className="btn" onClick={() => openCreate('institutional')}>
            <Mail size={16} /> Registrar correo institucional
          </button>
        </div>
      </div>

      <div className="card scr">
        <h3 style={{ marginBottom: '12px' }}>Usuarios del sistema</h3>
        <table>
          <thead>
            <tr><th>Nombre</th><th>Correo</th><th>Rol</th><th style={{ width: '100px' }}>Acciones</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.nombre}</td>
                <td>{u.correo_institucional}</td>
                <td><span className="pill">{u.rol}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn sec sm" onClick={() => openEdit(u, 'user')}>
                      <Edit size={14} />
                    </button>
                    <button className="btn red sm" onClick={() => handleDelete('user', u.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card scr" style={{ marginTop: '16px' }}>
        <h3 style={{ marginBottom: '12px' }}>Correos institucionales (permisos por cargo)</h3>
        <table>
          <thead>
            <tr><th>Nombre</th><th>Correo</th><th>Cargo / Rol</th><th style={{ width: '100px' }}>Acciones</th></tr>
          </thead>
          <tbody>
            {institutional.map(c => (
              <tr key={c.id}>
                <td>{c.nombre_completo}</td>
                <td>{c.correo}</td>
                <td><span className="pill">{c.cargo}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn sec sm" onClick={() => openEdit(c, 'institutional')}>
                      <Edit size={14} />
                    </button>
                    <button className="btn red sm" onClick={() => handleDelete('institutional', c.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="modal on" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="card" style={{ maxWidth: '440px' }}>
            <h3 style={{ marginBottom: '16px' }}>
              {modalType === 'user' ? (editing ? 'Editar usuario' : 'Nuevo usuario') : (editing ? 'Editar correo institucional' : 'Nuevo correo institucional')}
            </h3>
            <form onSubmit={handleSubmit}>
              <label>Nombre completo</label>
              <input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} required placeholder="Juan Pérez" />

              <label>Correo institucional</label>
              <input type="email" value={form.correo} onChange={e => setForm({...form, correo: e.target.value})} required placeholder="juan.perez@siegfried.com" />

              {modalType === 'user' && (
                <>
                  <label>Contraseña {editing ? '(dejar vacío para no cambiar)' : ''}</label>
                  <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder={editing ? '••••••••' : 'Mínimo 6 caracteres'} required={!editing} />

                  <label>Rol</label>
                  <select value={form.rol} onChange={e => setForm({...form, rol: e.target.value})}>
                    {roles.map(r => <option key={r} value={r}>{r}</option>)}
                 </select>
                </>
              )}

              {modalType === 'institutional' && (
                <>
                    <label>Cargo / Rol</label>
                    <select value={form.cargo} onChange={e => setForm({...form, cargo: e.target.value})}>
                      {roles.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </>
                )}

              <div className="row" style={{ marginTop: '16px' }}>
                <button className="btn" type="submit" style={{ flex: 1 }}>{editing ? 'Guardar cambios' : 'Registrar'}</button>
                <button className="btn sec" type="button" onClick={closeModal}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}