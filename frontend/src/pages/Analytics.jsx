import { useState, useEffect, useMemo } from 'react'
import { api } from '../services/api'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function Analytics() {
  const [logs, setLogs] = useState([])
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedArea, setSelectedArea] = useState('all')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [logsRes, areasRes] = await Promise.all([
          api.get('/sensores/lecturas?limit=500'),
          api.get('/areas')
        ])
        setLogs(logsRes.data?.lecturas?.reverse() || [])
        setAreas(areasRes.data?.areas || [])
      } catch (err) {
        toast.error('Error cargando datos para analíticas')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Chart 1: Global Temperature (Average of all areas)
  const globalData = useMemo(() => {
    if (!logs.length) return []
    // Group by minute
    const grouped = {}
    logs.forEach(l => {
      if(!l.fecha_hora) return
      const t = format(new Date(l.fecha_hora), 'HH:mm')
      if (!grouped[t]) grouped[t] = { time: t, count: 0, sumTemp: 0 }
      grouped[t].sumTemp += Number(l.temperatura)
      grouped[t].count++
    })
    return Object.values(grouped).map(g => ({ time: g.time, temp: Number((g.sumTemp / g.count).toFixed(2)) }))
  }, [logs])

  // Chart 2: By Area
  const areaData = useMemo(() => {
    if (!logs.length || selectedArea === 'all') return []
    return logs
      .filter(l => l.area_id == selectedArea)
      .map(l => ({
        time: l.fecha_hora ? format(new Date(l.fecha_hora), 'HH:mm:ss') : '',
        temp: Number(l.temperatura),
        hum: Number(l.humedad),
        pres: Number(l.presion)
      }))
  }, [logs, selectedArea])

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Cargando analíticas...</div>

  return (
    <div>
      <div className="top">
        <h2>Analíticas y Gráficos</h2>
        <div className="mut">Visión global e histórica del rendimiento</div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3>Temperatura Promedio General (Todas las áreas)</h3>
        <div style={{ height: 300, width: '100%', marginTop: 20 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={globalData}>
              <defs>
                <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#C8102E" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#C8102E" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="time" stroke="var(--mut)" />
              <YAxis stroke="var(--mut)" domain={['dataMin - 2', 'dataMax + 2']} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }} />
              <Area type="monotone" dataKey="temp" stroke="#C8102E" fillOpacity={1} fill="url(#colorTemp)" name="Temperatura Promedio (°C)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3>Análisis por Área</h3>
          <select 
            value={selectedArea} 
            onChange={e => setSelectedArea(e.target.value)}
            style={{ width: 250, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)' }}
          >
            <option value="all">Seleccione un área...</option>
            {areas.map(a => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>
        </div>

        {selectedArea !== 'all' ? (
          <div style={{ height: 350, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={areaData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="time" stroke="var(--mut)" />
                <YAxis yAxisId="left" stroke="var(--mut)" />
                <YAxis yAxisId="right" orientation="right" stroke="var(--mut)" />
                <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="temp" stroke="#FF3B30" name="Temp. (°C)" dot={false} strokeWidth={2} />
                <Line yAxisId="left" type="monotone" dataKey="hum" stroke="#0A84FF" name="Humedad (%)" dot={false} strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="pres" stroke="#32D74B" name="Presión (Pa)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--mut)' }}>
            Selecciona un área en el menú para ver sus gráficas detalladas.
          </div>
        )}
      </div>
    </div>
  )
}
