import { usePageTitle } from '../hooks/usePageTitle'
// ============================================
// PHARMA MONITOR - SETTINGS PAGE
// ============================================

import { useState, useEffect, useRef } from 'react'
import { RotateCcw, Shield, Database, Download, Upload, Factory, Cpu, Copy } from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const CONFIG_LABELS = {
  company_name: 'Nombre de la Planta / Laboratorio',
  alert_email: 'Correo de Respaldo General (Alertas)',
  email_alertas_activo: 'Notificaciones por Correo Activas (true / false)',
  intervalo_lectura_segundos: 'Intervalo de Lectura Arduino (segundos)',
  watchdog_timeout_minutos: 'Tiempo Máximo sin Latido ESP32 - Watchdog (minutos)',
  cooldown_alerta_minutos: 'Tiempo de Espera entre Alertas Repetidas (minutos)',
  dias_retencion_lecturas: 'Retención Histórica de Lecturas (días)',
  timezone: 'Zona Horaria del Sistema'
}

const DEFAULT_CONFIG = {
  company_name: 'Siegfried Pharma Monitor',
  alert_email: 'floreschristian1909@gmail.com',
  email_alertas_activo: 'true',
  intervalo_lectura_segundos: '30',
  watchdog_timeout_minutos: '10',
  cooldown_alerta_minutos: '15',
  dias_retencion_lecturas: '365',
  timezone: 'America/Caracas'
}

export default function Settings() {
  usePageTitle('Configuración')

  const { user } = useAuth()
  const isOperador = user?.rol?.toLowerCase() === 'operador'
  const fileInputRef = useRef(null)

  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [areas, setAreas] = useState([])
  const [saving, setSaving] = useState(false)
  const [dbStatus, setDbStatus] = useState('unknown')

  useEffect(() => {
    loadConfig()
    checkDb()
    loadAreas()
  }, [])

  const loadAreas = async () => {
    try {
      const res = await api.get('/areas')
      setAreas(res.data?.areas || [])
    } catch { /* ignore */ }
  }

  const loadConfig = async () => {
    try {
      const res = await api.get('/configuracion_sistema')
      if (Array.isArray(res.data) && res.data.length > 0) {
        const obj = { ...DEFAULT_CONFIG, ...Object.fromEntries(res.data.map(r => [r.clave, r.valor])) }
        setConfig(obj)
      }
    } catch { /* ignore */ }
  }

  const checkDb = async () => {
    try {
      const res = await api.get('/health')
      setDbStatus(res.data?.status === 'ok' ? 'connected' : 'error')
    } catch {
      setDbStatus('error')
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const updates = Object.entries(config).map(([clave, valor]) => 
        api.post('/configuracion_sistema', { clave, valor: String(valor ?? ''), descripcion: CONFIG_LABELS[clave] || '' })
      )
      await Promise.all(updates)
      toast.success('Configuración guardada en Supabase')
    } catch { toast.error('Error guardando configuración') }
    finally { setSaving(false) }
  }

  const handleReset = async () => {
    if (!window.confirm('¿Restablecer los parámetros de configuración a sus valores recomendados?')) return
    setSaving(true)
    try {
      setConfig(DEFAULT_CONFIG)
      const updates = Object.entries(DEFAULT_CONFIG).map(([clave, valor]) =>
        api.post('/configuracion_sistema', { clave, valor, descripcion: CONFIG_LABELS[clave] || '' })
      )
      await Promise.all(updates)
      toast.success('Configuración restablecida a valores por defecto')
    } catch { toast.error('Error al restablecer') }
    finally { setSaving(false) }
  }

  const exportData = async () => {
    try {
      const desde = new Date(Date.now() - 365 * 86400000).toISOString()
      const hasta = new Date().toISOString()
      const res = await api.get(`/reportes/pdf?fecha_desde=${encodeURIComponent(desde)}&fecha_hasta=${encodeURIComponent(hasta)}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `reporte_anual_${new Date().getFullYear()}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Reporte anual PDF descargado')
    } catch { toast.error('Error exportando reporte PDF') }
  }

  const exportConfigJson = () => {
    const blob = new Blob([JSON.stringify({ config, areas: areas.map(a => ({ nombre: a.nombre, sensor_id: a.sensor_id, temp_min: a.temp_min, temp_max: a.temp_max, humedad_max: a.humedad_max, presion_min: a.presion_min, presion_max: a.presion_max })) }, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'pharma_monitor_config.json')
    document.body.appendChild(link)
    link.click()
    link.remove()
    toast.success('Configuración exportada en JSON')
  }

  const handleImportJson = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const importedConfig = parsed.config || parsed
      if (typeof importedConfig === 'object') {
        const merged = { ...config, ...importedConfig }
        setConfig(merged)
        toast.success('Archivo JSON cargado. Pulsa "Guardar cambios" para aplicar.')
      }
    } catch {
      toast.error('Archivo JSON inválido')
    } finally {
      e.target.value = ''
    }
  }

  const copyArduinoSnippet = () => {
    const snippet = `POST ${window.location.origin}/api/sensores/lectura
Headers:
  Content-Type: application/json
  x-api-key: arduino_secret_key
Body:
  {"sensor_id":"ARD-MEZCLA-SOLIDOS-01","temperatura":21.4,"humedad":48.0,"presion":12.5}`
    navigator.clipboard?.writeText(snippet)
    toast.success('Configuración HTTP para Arduino copiada al portapapeles')
  }

  return (
    <div>
      <div className="top">
        <div>
          <h2>Configuración del Sistema</h2>
          <div className="mut">Parámetros globales, estado de Supabase y guía de integración con Arduino ESP32</div>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Shield size={20} /> Parámetros Generales
          </h3>
          <form onSubmit={handleSave}>
            {Object.entries(config).map(([key, value]) => (
              <div key={key} style={{ marginBottom: '12px' }}>
                <label>{CONFIG_LABELS[key] || key}</label>
                <input
                  value={value ?? ''}
                  disabled={isOperador}
                  onChange={e => setConfig({...config, [key]: e.target.value})}
                  placeholder="Valor"
                />
              </div>
            ))}
            {!isOperador && (
              <div className="row" style={{ marginTop: '16px' }}>
                <button className="btn" type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
                <button className="btn sec" type="button" onClick={handleReset} disabled={saving}>Restablecer</button>
              </div>
            )}
          </form>
        </div>

        <div className="stack">
          <div className="card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Database size={20} /> Estado de la Base de Datos (Supabase)
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span className={`led ${dbStatus === 'connected' ? '' : 'bad'}`} />
              <b>{dbStatus === 'connected' ? 'Conectada y sincronizada en tiempo real' : 'Desconectada'}</b>
              <button className="btn sec sm" onClick={checkDb}><RotateCcw size={14} /> Verificar</button>
            </div>
            <div className="mut" style={{ fontSize: '13px' }}>
              PostgreSQL (Supabase Cloud) + WebSockets bidireccionales + Servidor SMTP Zoho activo para despacho de alertas por área.
            </div>
          </div>

          <div className="card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Factory size={20} /> Información del Servidor
            </h3>
            <table style={{ width: '100%', fontSize: '13px' }}>
              <tbody>
                <tr><td className="mut">Versión</td><td style={{ textAlign: 'right', fontWeight: 600 }}>2.0.0 (Arduino Ready)</td></tr>
                <tr><td className="mut">Entorno</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{import.meta.env.MODE}</td></tr>
                <tr><td className="mut">Endpoint API</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{import.meta.env.VITE_API_URL || '/api'}</td></tr>
                <tr><td className="mut">Endpoint Arduino</td><td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>POST /api/sensores/lectura</td></tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Download size={20} /> Exportar / Respaldo
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button className="btn" onClick={exportData}><Download size={16} /> Descargar reporte ejecutivo (PDF)</button>
              <button className="btn sec" onClick={exportConfigJson}><Download size={16} /> Exportar configuración y nodos (JSON)</button>
              {!isOperador && (
                <>
                  <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportJson} />
                  <button className="btn sec" onClick={() => fileInputRef.current?.click()}><Upload size={16} /> Importar configuración (JSON)</button>
                </>
              )}
              <button className="btn sec" onClick={() => window.print()}><Download size={16} /> Imprimir vista actual</button>
            </div>
          </div>
        </div>
      </div>

      {/* Guía de Conexión Arduino ESP32 */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Cpu size={20} /> Guía de Conexión para Nodos Arduino / ESP32
            </h3>
            <span className="mut" style={{ fontSize: '12.5px' }}>
              Configura tu código de Arduino para enviar un HTTP POST a <code>/api/sensores/lectura</code> con el header <code>x-api-key: arduino_secret_key</code>
            </span>
          </div>
          <button className="btn sec sm" onClick={copyArduinoSnippet}>
            <Copy size={14} /> Copiar ejemplo HTTP
          </button>
        </div>

        <div className="scr">
          <table>
            <thead>
              <tr>
                <th>Área del Laboratorio</th>
                <th>ID de Nodo (sensor_id)</th>
                <th>UUID de Área (area_id)</th>
                <th>Rango Temp.</th>
                <th>Rango Humedad</th>
                <th>Rango Presión</th>
              </tr>
            </thead>
            <tbody>
              {areas.map(a => (
                <tr key={a.id}>
                  <td><b>{a.nombre}</b></td>
                  <td><code style={{ fontWeight: 700, color: 'var(--red)' }}>{a.sensor_id || 'N/A'}</code></td>
                  <td className="mut" style={{ fontFamily: 'monospace', fontSize: '11.5px' }}>{a.id}</td>
                  <td>{a.temp_min ?? 18} – {a.temp_max ?? 25} °C</td>
                  <td>≤ {a.humedad_max ?? 65} %</td>
                  <td>{a.presion_min ?? 5} – {a.presion_max ?? 25} Pa</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}