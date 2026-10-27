import { usePageTitle } from '../hooks/usePageTitle'
// ============================================
// PHARMA MONITOR - ALERTS PAGE (CORREGIDO)
// ============================================

import { useState, useEffect } from 'react'
import { Mail, CheckCircle, Zap, Send } from 'lucide-react'
import { api, ws } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

export default function Alerts() {
  usePageTitle('Alertas')

  const { user } = useAuth()
  const isOperador = user?.rol?.toLowerCase() === 'operador'

  const [alerts, setAlerts] = useState([])
  const [areas, setAreas] = useState([])
  const [selectedTestArea, setSelectedTestArea] = useState('')
  const [testingEmail, setTestingEmail] = useState(false)
  const [loading, setLoading] = useState(true)
  const [emailTo, setEmailTo] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)

  useEffect(() => {
    loadAlerts()
    loadEmail()
    loadAreas()
    
    // Escuchar alertas en tiempo real por WebSocket
    const unsub = ws.on?.('alerta:nueva', (a) => {
      if (a?.resuelta) {
        setAlerts(prev => prev.map(x => x.id === a.id ? { ...x, resuelta: true } : x))
      } else {
        setAlerts(prev => [a, ...prev.filter(x => x.id !== a.id).slice(0, 99)])
      }
    })
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  const loadAreas = async () => {
    try {
      const res = await api.get('/areas')
      const list = res.data?.areas || []
      setAreas(list)
      if (list.length > 0) setSelectedTestArea(list[0].id)
    } catch { /* ignore */ }
  }

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
      const res = await api.get('/alertas/configuracion_sistema')
      const configArray = Array.isArray(res.data) ? res.data : []
      const emailConfig = configArray.find(c => c.clave === 'alert_email')
      setEmailTo(emailConfig ? emailConfig.valor : '')
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
      const res = await api.post(`/alertas/${alert.id}/reenviar-email`)
      if (res.data?.destinatarios) {
        setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, email_destinatarios: res.data.destinatarios, email_enviado: true } : a))
      }
      toast.success(`Correo reenviado a: ${(res.data?.destinatarios || []).join(', ') || emailTo}`)
    } catch (err) {
      console.error("Error al reenviar correo:", err)
      const msg = err.response?.data?.error || 'Error reenviando correo'
      toast.error(msg)
    }
  }

  const handleTestAreaAlert = async () => {
    setTestingEmail(true)
    try {
      const res = await api.post('/alertas/simular', { area_id: selectedTestArea || undefined })
      toast.success(res.data?.message || 'Alerta y correo enviados exitosamente')
      loadAlerts()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al probar alerta por correo')
    } finally {
      setTestingEmail(false)
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
      await api.post('/alertas/configuracion_sistema', { valor: emailTo.trim() })
      toast.success('Correo de respaldo guardado correctamente')
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
        <div>
          <h2>Alertas y Notificaciones</h2>
          <div className="mut">
            Historial de incidentes ambientales y despacho automático de correos segmentados por área
          </div>
        </div>
      </div>

      {!isOperador && (
        <div className="grid g2" style={{ marginBottom: '16px' }}>
          <div className="card">
            <b>Correo de respaldo general (Gerencia / Soporte)</b>
            <span className="mut" style={{ fontSize: '12px', display: 'block', marginTop: '2px' }}>
              Las alertas se envían automáticamente al Gerente General y a los Encargados asignados a cada área.
            </span>
            <form onSubmit={saveEmail} className="row" style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
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

          <div className="card">
            <b>Probar notificación por correo según Área</b>
            <span className="mut" style={{ fontSize: '12px', display: 'block', marginTop: '2px' }}>
              Verifica que la alerta de una sala llegue únicamente a los responsables de esa área y al Gerente General.
            </span>
            <div className="row" style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <select value={selectedTestArea} onChange={e => setSelectedTestArea(e.target.value)}>
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>{a.nombre}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '0 0 auto' }}>
                <button type="button" className="btn red" onClick={handleTestAreaAlert} disabled={testingEmail}>
                  <Send size={14} /> {testingEmail ? 'Enviando...' : 'Probar alerta por correo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card scr">
        <table>
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Área</th>
              <th>Detalle</th>
              <th>Correo enviado a (Destinatarios del área)</th>
              <th style={{ width: '130px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a, i) => {
              const rawDate = a.created_at || a.ts
              const dateFormatted = rawDate ? format(new Date(rawDate), 'dd/MM/yyyy HH:mm', { locale: es }) : '-'
              const recipientsText = Array.isArray(a.email_destinatarios) && a.email_destinatarios.length > 0
                ? a.email_destinatarios.join(', ')
                : (a.to || a.email_to || emailTo || '-')
              return (
                <tr key={a.id || i}>
                  <td className="mut">{dateFormatted}</td>
                  <td><b>{a.area_nombre || a.a || 'Área general'}</b></td>
                  <td>{a.mensaje || a.msg}</td>
                  <td style={{ fontSize: '12.5px' }}>{recipientsText}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {!a.resuelta && !isOperador && (
                        <button className="btn sec sm" onClick={() => handleResolve(a.id)} title="Marcar como resuelta">
                          <CheckCircle size={14} />
                        </button>
                      )}
                      {!isOperador && (
                        <button className="btn sec sm" onClick={() => handleResend(a)} title="Reenviar correo a responsables del área">
                          <Mail size={14} />
                        </button>
                      )}
                      {a.resuelta && <span className="mut" style={{ display: 'flex', alignItems: 'center', padding: '0 6px', fontSize: '12px' }}>✓ Resuelta</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
            {alerts.length === 0 && (
              <tr>
                <td colSpan={5} className="mut" style={{ textAlign: 'center', padding: '24px' }}>
                  Aún no hay alertas registradas para este sector.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}