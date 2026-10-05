// ============================================
// PHARMA MONITOR - VALUES PAGE (CORREGIDO)
// ============================================

import { useState, useEffect, useMemo } from 'react'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../services/api'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

const lab = { ok: 'Estable', warn: 'Regular', bad: 'Irregular' }

export default function Values() {
  const [logs, setLogs] = useState([])
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ area_id: '', fecha: '' })
  const [page, setPage] = useState(1)
  const pageSize = 50

  useEffect(() => {
    loadAreas()
  }, [])

  useEffect(() => {
    loadLogs()
  }, [filters, page])

  const loadAreas = async () => {
    try {
      const res = await api.get('/areas')
      const list = Array.isArray(res.data?.areas) ? res.data.areas : (Array.isArray(res.data) ? res.data : [])
      setAreas(list)
    } catch {
      setAreas([])
    }
  }

  const loadLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: pageSize })
      if (filters.area_id) params.append('area_id', filters.area_id)
      if (filters.fecha) params.append('fecha_desde', filters.fecha + 'T00:00:00')
      if (filters.fecha) params.append('fecha_hasta', filters.fecha + 'T23:59:59')

      const res = await api.get(`/sensores/lecturas?${params}`)
      const list = Array.isArray(res.data?.lecturas) ? res.data.lecturas : (Array.isArray(res.data) ? res.data : [])
      setLogs(list)
    } catch (err) {
      toast.error('Error cargando registros')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  const exportCSV = async () => {
    try {
      const params = new URLSearchParams()
      if (filters.area_id) params.append('area_id', filters.area_id)
      if (filters.fecha) params.append('fecha_desde', filters.fecha + 'T00:00:00')
      if (filters.fecha) params.append('fecha_hasta', filters.fecha + 'T23:59:59')
      const res = await api.get(`/sensores/lecturas/export?${params}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `lecturas_${format(new Date(), 'yyyyMMdd')}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      toast.error('Error exportando CSV')
    }
  }

  const exportPDF = () => {
    if (!logs || logs.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Reporte de Valores y Registros (Pharma Monitor)', 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Fecha de generación: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);
    doc.text(`Filtro Área: ${filters.area_id ? areas.find(a => a.id === filters.area_id)?.nombre : 'Todas'}`, 14, 36);
    doc.text(`Filtro Fecha: ${filters.fecha || 'Todo el histórico'}`, 14, 42);

    const tableData = logs.map(l => [
      l.fecha_hora ? format(new Date(l.fecha_hora), 'dd/MM/yyyy HH:mm') : '--',
      areas.find(a => a.id === l.area_id)?.nombre || 'N/A',
      l.temperatura != null ? Number(l.temperatura).toFixed(1) + ' °C' : '--',
      l.humedad != null ? Number(l.humedad).toFixed(0) + ' %' : '--',
      l.presion != null ? Number(l.presion).toFixed(1) + ' Pa' : '--',
      lab[l.estado] || 'Estable'
    ]);

    doc.autoTable({
      startY: 50,
      head: [['Fecha y hora', 'Área', 'Temp.', 'Humedad', 'Presión', 'Estado']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [114, 47, 55] }, // Corporate Wine Color
    });

    doc.save(`reporte_pharma_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    toast.success('PDF generado exitosamente');
  }

  const cards = useMemo(() => {
    const safeAreas = Array.isArray(areas) ? areas : []
    const safeLogs = Array.isArray(logs) ? logs : []

    return safeAreas.map(a => {
      const aLogs = safeLogs.filter(l => l.area_id === a.id)
      const last = aLogs[0]
      const params = { t: [a.temp_min, a.temp_max], h: [0, a.humedad_max], p: [a.presion_min, a.presion_max] }
      const state = last
        ? (last.temperatura < params.t[0] || last.temperatura > params.t[1] || last.humedad > params.h[1] || last.presion < params.p[0] || last.presion > params.p[1] ? 'bad' : 'ok')
        : 'ok'

      // Cálculo corregido y seguro de puntos SVG
      const hist = last?.historial?.temperatura || [last?.temperatura || 0]
      const min = Math.min(...hist)
      const max = Math.max(...hist)
      const range = (max - min) || 1
      const points = hist.map((v, i) => {
        const x = 4 + (i * (252 / Math.max(1, hist.length - 1)))
        const y = 52 - (((v - min) / range) * 44)
        return `${x},${y}`
      }).join(' ')

      return (
        <div className="card" key={a.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <b>{a.nombre}</b>
            <span className={`pill ${state}`}>{lab[state] || 'Estable'}</span>
          </div>
          <svg className="ch" viewBox="0 0 260 60" role="img" aria-label={a.nombre}>
            <polyline
              fill="none"
              stroke="#7a1530"
              strokeWidth="2"
              points={points}
            />
          </svg>
          <div className="mut">
            {last?.temperatura != null ? Number(last.temperatura).toFixed(1) : '--'} °C · {last?.humedad != null ? Number(last.humedad).toFixed(0) : '--'} % · {last?.presion != null ? Number(last.presion).toFixed(1) : '--'} Pa
          </div>
        </div>
      )
    })
  }, [areas, logs])

  if (loading) return <div className="loading-screen" style={{ padding: 40, textAlign: 'center' }}>Cargando registros...</div>

  const safeLogsList = Array.isArray(logs) ? logs : []
  const safeAreasList = Array.isArray(areas) ? areas : []

  return (
    <div>
      <div className="top">
        <h2>Valores y registros</h2>
        <div className="noprint" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn sec" onClick={exportPDF}>📄 Descargar PDF</button>
          <button className="btn" onClick={exportCSV}><Download size={16} /> Descargar CSV</button>
        </div>
      </div>

      <div className="grid g3" style={{ marginBottom: '16px' }}>
        {cards}
      </div>

      <div className="card">
        <div className="row noprint" style={{ marginBottom: '12px', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label>Área</label>
            <select value={filters.area_id} onChange={e => { setPage(1); setFilters({...filters, area_id: e.target.value}); }}>
              <option value="">Todas</option>
              {safeAreasList.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <label>Fecha</label>
            <input type="date" value={filters.fecha} onChange={e => { setPage(1); setFilters({...filters, fecha: e.target.value}); }} />
          </div>
        </div>

        <div className="scr" style={{ marginTop: '12px' }}>
          <table>
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Área</th>
                <th>Temp.</th>
                <th>Humedad</th>
                <th>Presión</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {safeLogsList.map((l, i) => (
                <tr key={i}>
                  <td>{l.fecha_hora ? format(new Date(l.fecha_hora), 'dd/MM/yyyy HH:mm', { locale: es }) : '--'}</td>
                  <td>{safeAreasList.find(a => a.id === l.area_id)?.nombre || l.area_id || 'N/A'}</td>
                  <td>{l.temperatura != null ? Number(l.temperatura).toFixed(1) : '--'} °C</td>
                  <td>{l.humedad != null ? Number(l.humedad).toFixed(0) : '--'} %</td>
                  <td>{l.presion != null ? Number(l.presion).toFixed(1) : '--'} Pa</td>
                  <td><span className={`pill ${l.estado === 'ok' ? '' : (l.estado || '')}`}>{lab[l.estado] || l.estado || 'Estable'}</span></td>
                </tr>
              ))}
              {safeLogsList.length === 0 && (
                <tr>
                  <td colSpan={6} className="mut" style={{ textAlign: 'center', padding: '24px' }}>
                    No hay registros para ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="noprint" style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
          <button className="btn sec" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft size={16} /> Anterior</button>
          <span style={{ display: 'flex', alignItems: 'center', padding: '0 16px', color: 'var(--mut)' }}>Página {page}</span>
          <button className="btn sec" onClick={() => setPage(p => p + 1)} disabled={safeLogsList.length < pageSize}>Siguiente <ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  )
}