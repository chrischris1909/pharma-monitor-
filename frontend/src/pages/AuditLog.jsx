import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import api from '../services/api'
import toast from 'react-hot-toast'
import { FileText } from 'lucide-react'

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    try {
      const res = await api.get('/auditoria')
      setLogs(res.data.auditoria)
    } catch (err) {
      toast.error('Error cargando log de auditoría')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading-screen" style={{ padding: 40, textAlign: 'center' }}>Cargando auditoría (CFR 21 Part 11)...</div>

  return (
    <div>
      <div className="top">
        <h2>Log de Auditoría (CFR 21 Parte 11)</h2>
        <div className="noprint" style={{ display: 'flex', gap: '8px' }}>
          <button className="btn sec" onClick={() => window.print()}><FileText size={16} /> Imprimir Registro</button>
        </div>
      </div>
      
      <div className="card">
        <p className="mut" style={{ marginBottom: '16px' }}>Registro inmodificable de cambios y firmas electrónicas en el sistema.</p>
        <div className="scr">
          <table>
            <thead>
              <tr>
                <th>Fecha y Hora</th>
                <th>Usuario / Firma</th>
                <th>Acción</th>
                <th>Entidad Afectada</th>
                <th>Justificación</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan="5" className="mut" style={{ textAlign: 'center' }}>No hay registros de auditoría aún.</td></tr>
              ) : (
                logs.map(l => (
                  <tr key={l.id}>
                    <td>{format(new Date(l.fecha_hora), 'dd MMM yyyy, HH:mm:ss', { locale: es })}</td>
                    <td><b>{l.usuario_nombre}</b></td>
                    <td><span className="pill warn" style={{ background: 'rgba(90,15,36,0.1)', color: 'var(--ink)', border: '1px solid var(--line)' }}>{l.accion}</span></td>
                    <td>{l.entidad} (ID: {l.entidad_id})</td>
                    <td className="mut" style={{ fontSize: '13px' }}>{l.justificacion}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
