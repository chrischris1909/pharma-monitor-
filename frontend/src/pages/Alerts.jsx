// ============================================
// PHARMA MONITOR - ALERTS PAGE (CORREGIDO)
// ============================================

import { useState, useEffect } from 'react'
import { Mail, CheckCircle } from 'lucide-react'
import { api, ws } from '../services/api'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [emailTo, setEmailTo] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)

  useEffect(() => {
    loadAlerts()
    loadEmail()
    
    // Escuchar alertas en tiempo real por WebSocket
    const unsub = ws.on?.('alerta:nueva', (a) => setAlerts(prev => [a, ...prev.slice(0, 99)]))
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  const loadAlerts = async () => {
    try {
      const res = await api.get('/alertas')
      const data = res.data?.alertas || res.data || []
      setAlerts(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("Error al cargar alertas:", err)
      toast.error('Error cargando alertas')
    } finally {
      setLoading(false)
    }
  }

  const loadEmail = async () => {
    try {
      const res = await api.get('/alertas/email')
      setEmailTo(res.data.email || '')
    } catch (err) {
      console.warn("No se pudo obtener la configuración de email previa:", err)
    }
  }

  const handleResolve = async (id) => {
    try {
      await api.patch(`/alertas/${id}/resolver`, { notas_resolucion: 'Resuelta desde dashboard' })
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, resuelta: true } : a))
      toast.success('Alerta marcada como resuelta')
    } catch (err) {
      console.error("Error al resolver alerta:", err)
      toast.error('Error resolviendo alerta')
    }
  }

  const handleResend = async (alert) => {
    try {
      await api.post(`/alertas/${alert.id}/reenviar-email`)
      toast.success('Correo reenviado')
    } catch (err) {
      console.error("Error al reenviar correo:", err)
      const msg = err.response?.data?.error || 'Error reenviando correo'
      toast.error(msg)
    }
  }

  const saveEmail = async (e) => {
    if (e) e.preventDefault()
    
    if (!emailTo.trim()) {
      toast.error('Por favor ingresa un correo válido')
      return
    }

    setSavingEmail(true)
    try {
      await api.post('/alertas/email', { email: emailTo.trim() })
      toast.success('Destinatario guardado correctamente')
    } catch (err) {
      console.error("Error definitivo al guardar email:", err)
      const msg = err.response?.data?.message || err.response?.data?.error || 'Error guardando email'
      toast.error(msg)
    } finally {
      setSavingEmail(false)
    }
  }

  if (loading) {
    return (
      <div className="loading-screen" style={{ padding: 40, textAlign: 'center' }}>
        Cargando alertas...
      </div>
    )
  }

  return (
    <div>
      <div className="top">
        <h2>Alertas</h2>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <b>Destinatario de alertas (Outlook o Gmail)</b>
        <form onSubmit={saveEmail} className="row" style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <input 
              type="email" 
              value={emailTo} 
              onChange={e => setEmailTo(e.target.value)} 
              placeholder="gerente@siegfried.com"
              required
            />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <button type="submit" className="btn" disabled={savingEmail}>
              {savingEmail ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>

      <div className="card scr">
        <table>
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Área</th>
              <th>Detalle</th>
              <th>Correo enviado a</th>
              <th style={{ width: '120px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a, i) => {
              const rawDate = a.created_at || a.ts
              const dateFormatted = rawDate ? format(new Date(rawDate), 'dd/MM/yyyy HH:mm', { locale: es }) : '-'
              return (
                <tr key={a.id || i}>
                  <td className="mut">{dateFormatted}</td>
                  <td><b>{a.area_nombre || a.a || 'Área general'}</b></td>
                  <td>{a.mensaje || a.msg}</td>
                  <td>{a.to || a.email_to || emailTo || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {!a.resuelta && (
                        <button className="btn sec sm" onClick={() => handleResolve(a.id)} title="Marcar como resuelta">
                          <CheckCircle size={14} />
                        </button>
                      )}
                      <button className="btn sec sm" onClick={() => handleResend(a)} title="Reenviar correo">
                        <Mail size={14} />
                      </button>
                      {a.resuelta && <span className="mut" style={{ display: 'flex', alignItems: 'center', padding: '0 8px' }}>✓ Resuelta</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
            {alerts.length === 0 && (
              <tr>
                <td colSpan={5} className="mut" style={{ textAlign: 'center', padding: '24px' }}>
                  Aún no hay alertas. Simula una emergencia desde el Dashboard.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}