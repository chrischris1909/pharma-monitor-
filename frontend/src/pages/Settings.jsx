// ============================================
// PHARMA MONITOR - SETTINGS PAGE
// ============================================

import { useState, useEffect } from 'react'
import { Save, RotateCcw, Bell, Shield, Database, Download, Upload, Factory } from 'lucide-react'
import { api } from '../services/api'
import toast from 'react-hot-toast'

export default function Settings() {
  const [config, setConfig] = useState({})
  const [saving, setSaving] = useState(false)
  const [dbStatus, setDbStatus] = useState('unknown')

  useEffect(() => {
    loadConfig()
    checkDb()
  }, [])

  const loadConfig = async () => {
    try {
      const res = await api.get('/configuracion_sistema')
      const obj = Object.fromEntries(res.data.map(r => [r.clave, r.valor]))
      setConfig(obj)
    } catch { /* ignore */ }
  }

  const checkDb = async () => {
    try {
      await api.get('/health')
      setDbStatus('connected')
    } catch {
      setDbStatus('error')
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const updates = Object.entries(config).map(([clave, valor]) => 
        api.post('/configuracion_sistema', { clave, valor, descripcion: '' })
      )
      await Promise.all(updates)
      toast.success('Configuración guardada')
    } catch { toast.error('Error guardando configuración') }
    finally { setSaving(false) }
  }

  const handleReset = async () => {
    if (!window.confirm('¿Restablecer configuración por defecto?')) return
    try {
      // En producción: endpoint para resetear
      toast.success('Configuración restablecida (simulado)')
    } catch { toast.error('Error') }
  }

  const exportData = async () => {
    try {
      const res = await api.get('/reportes/pdf?fecha_desde=2024-01-01&fecha_hasta=2024-12-31', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `reporte_anual_${new Date().getFullYear()}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch { toast.error('Error exportando reporte') }
  }

  return (
    <div>
      <div className="top">
        <h2>Configuración</h2>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Shield size={20} /> Configuración del sistema
          </h3>
          <form onSubmit={handleSave}>
            {Object.entries(config).map(([key, value]) => (
              <div key={key} style={{ marginBottom: '12px' }}>
                <label>{key}</label>
                <input
                  value={value}
                  onChange={e => setConfig({...config, [key]: e.target.value})}
                  placeholder="Valor"
                />
              </div>
            ))}
            <div className="row" style={{ marginTop: '16px' }}>
              <button className="btn" type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
              <button className="btn sec" type="button" onClick={handleReset}>Restablecer</button>
            </div>
          </form>
        </div>

        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Database size={20} /> Estado de la base de datos
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <span className={`led ${dbStatus === 'connected' ? '' : 'bad'}`} />
            <span>{dbStatus === 'connected' ? 'Conectada' : 'Desconectada'}</span>
            <button className="btn sec sm" onClick={checkDb}><RotateCcw size={14} /> Verificar</button>
          </div>
          <div className="mut" style={{ marginBottom: '16px', fontSize: '13px' }}>
            PostgreSQL + TimescaleDB para series temporales. Hypertable en lecturas_sensores con compresión automática.
          </div>
        </div>

        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Factory size={20} /> Información del sistema
          </h3>
          <table style={{ width: '100%', fontSize: '13px' }}>
            <tbody>
              <tr><td className="mut">Versión</td><td style={{ textAlign: 'right', fontWeight: 600 }}>1.0.0</td></tr>
              <tr><td className="mut">Entorno</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{import.meta.env.MODE}</td></tr>
              <tr><td className="mut">API</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{import.meta.env.VITE_API_URL || '/api'}</td></tr>
              <tr><td className="mut">WebSocket</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{import.meta.env.VITE_WS_URL || (import.meta.env.PROD ? window.location.origin.replace(/^http/, 'ws') : 'ws://localhost:3000')}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Download size={20} /> Exportar / Importar
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button className="btn" onClick={exportData}><Download size={16} /> Exportar reporte anual (PDF)</button>
            <button className="btn sec" onClick={() => { /* import logic */ }}><Upload size={16} /> Importar configuración (JSON)</button>
            <button className="btn sec" onClick={() => { window.print() }}><Download size={16} /> Imprimir / Guardar como PDF</button>
          </div>
        </div>
      </div>
    </div>
  )
}