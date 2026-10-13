import { usePageTitle } from '../hooks/usePageTitle'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { api } from '../services/api'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  Thermometer, Droplets, Gauge,
  Activity, Layers, RefreshCw, BarChart2
} from 'lucide-react'

// Custom tooltip compatible with dark and light themes
function CustomAnalyticsTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: '10px',
        padding: '12px 14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        color: 'var(--ink)',
        minWidth: '180px'
      }}>
        <div style={{
          fontWeight: 700,
          marginBottom: '8px',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '4px',
          fontSize: '13px'
        }}>
          ⏱️ Hora: {label}
        </div>
        {payload.map((entry, idx) => (
          <div key={idx} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '12.5px',
            margin: '4px 0'
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: entry.color
              }} />
              <span style={{ color: 'var(--mut)' }}>{entry.name}:</span>
            </span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
              {entry.value !== null && entry.value !== undefined ? entry.value : '--'}
            </span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export default function Analytics() {
  usePageTitle('Analíticas')

  const [logs, setLogs] = useState([])
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedArea, setSelectedArea] = useState('all')
  const [metricTab, setMetricTab] = useState('all') // 'all' | 'temp' | 'hum' | 'pres'

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const [logsRes, areasRes] = await Promise.all([
        api.get('/sensores/lecturas?limit=500'),
        api.get('/areas')
      ])
      setLogs(logsRes.data?.lecturas?.reverse() || [])
      setAreas(areasRes.data?.areas || [])
      if (isRefresh) toast.success('Datos actualizados')
    } catch (err) {
      toast.error('Error cargando datos para analíticas')
    } finally {
      setLoading(false)
      if (isRefresh) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Estadísticas globales agregadas (Temperatura, Humedad, Presión)
  const globalStats = useMemo(() => {
    if (!logs.length) {
      return {
        temp: { avg: '0.0', min: '0.0', max: '0.0' },
        hum: { avg: '0.0', min: '0.0', max: '0.0' },
        pres: { avg: '0.0', min: '0.0', max: '0.0' },
        total: 0
      }
    }

    let sumTemp = 0, countTemp = 0, minTemp = Infinity, maxTemp = -Infinity
    let sumHum = 0, countHum = 0, minHum = Infinity, maxHum = -Infinity
    let sumPres = 0, countPres = 0, minPres = Infinity, maxPres = -Infinity

    logs.forEach(l => {
      const t = parseFloat(l.temperatura)
      const h = parseFloat(l.humedad)
      const p = parseFloat(l.presion)

      if (!isNaN(t) && l.temperatura !== null) {
        sumTemp += t
        countTemp++
        if (t < minTemp) minTemp = t
        if (t > maxTemp) maxTemp = t
      }
      if (!isNaN(h) && l.humedad !== null) {
        sumHum += h
        countHum++
        if (h < minHum) minHum = h
        if (h > maxHum) maxHum = h
      }
      if (!isNaN(p) && l.presion !== null) {
        sumPres += p
        countPres++
        if (p < minPres) minPres = p
        if (p > maxPres) maxPres = p
      }
    })

    return {
      temp: {
        avg: countTemp ? (sumTemp / countTemp).toFixed(1) : '--',
        min: minTemp !== Infinity ? minTemp.toFixed(1) : '--',
        max: maxTemp !== -Infinity ? maxTemp.toFixed(1) : '--'
      },
      hum: {
        avg: countHum ? (sumHum / countHum).toFixed(1) : '--',
        min: minHum !== Infinity ? minHum.toFixed(1) : '--',
        max: maxHum !== -Infinity ? maxHum.toFixed(1) : '--'
      },
      pres: {
        avg: countPres ? (sumPres / countPres).toFixed(1) : '--',
        min: minPres !== Infinity ? minPres.toFixed(1) : '--',
        max: maxPres !== -Infinity ? maxPres.toFixed(1) : '--'
      },
      total: logs.length
    }
  }, [logs])

  // Agrupación temporal para gráfica general consolidada
  const globalData = useMemo(() => {
    if (!logs.length) return []
    const grouped = {}
    logs.forEach(l => {
      if (!l.fecha_hora) return
      const t = format(new Date(l.fecha_hora), 'HH:mm')
      if (!grouped[t]) {
        grouped[t] = {
          time: t,
          count: 0,
          sumTemp: 0,
          countTemp: 0,
          sumHum: 0,
          countHum: 0,
          sumPres: 0,
          countPres: 0
        }
      }
      const tVal = parseFloat(l.temperatura)
      const hVal = parseFloat(l.humedad)
      const pVal = parseFloat(l.presion)

      if (!isNaN(tVal) && l.temperatura !== null) {
        grouped[t].sumTemp += tVal
        grouped[t].countTemp++
      }
      if (!isNaN(hVal) && l.humedad !== null) {
        grouped[t].sumHum += hVal
        grouped[t].countHum++
      }
      if (!isNaN(pVal) && l.presion !== null) {
        grouped[t].sumPres += pVal
        grouped[t].countPres++
      }
      grouped[t].count++
    })

    return Object.values(grouped).map(g => ({
      time: g.time,
      temp: g.countTemp ? Number((g.sumTemp / g.countTemp).toFixed(2)) : null,
      hum: g.countHum ? Number((g.sumHum / g.countHum).toFixed(2)) : null,
      pres: g.countPres ? Number((g.sumPres / g.countPres).toFixed(2)) : null,
      count: g.count
    }))
  }, [logs])

  // Datos para el área seleccionada
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

  // Estadísticas del área seleccionada
  const selectedAreaStats = useMemo(() => {
    if (!logs.length || selectedArea === 'all') return null
    const filtered = logs.filter(l => l.area_id == selectedArea)
    if (!filtered.length) return null

    let sumT = 0, cT = 0, minT = Infinity, maxT = -Infinity
    let sumH = 0, cH = 0, minH = Infinity, maxH = -Infinity
    let sumP = 0, cP = 0, minP = Infinity, maxP = -Infinity

    filtered.forEach(l => {
      const t = parseFloat(l.temperatura)
      const h = parseFloat(l.humedad)
      const p = parseFloat(l.presion)

      if (!isNaN(t) && l.temperatura !== null) {
        sumT += t; cT++;
        if (t < minT) minT = t; if (t > maxT) maxT = t;
      }
      if (!isNaN(h) && l.humedad !== null) {
        sumH += h; cH++;
        if (h < minH) minH = h; if (h > maxH) maxH = h;
      }
      if (!isNaN(p) && l.presion !== null) {
        sumP += p; cP++;
        if (p < minP) minP = p; if (p > maxP) maxP = p;
      }
    })

    return {
      temp: {
        avg: cT ? (sumT / cT).toFixed(1) : '--',
        min: minT !== Infinity ? minT.toFixed(1) : '--',
        max: maxT !== -Infinity ? maxT.toFixed(1) : '--'
      },
      hum: {
        avg: cH ? (sumH / cH).toFixed(1) : '--',
        min: minH !== Infinity ? minH.toFixed(1) : '--',
        max: maxH !== -Infinity ? maxH.toFixed(1) : '--'
      },
      pres: {
        avg: cP ? (sumP / cP).toFixed(1) : '--',
        min: minP !== Infinity ? minP.toFixed(1) : '--',
        max: maxP !== -Infinity ? maxP.toFixed(1) : '--'
      },
      total: filtered.length
    }
  }, [logs, selectedArea])

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--mut)' }}>
      <Activity size={32} style={{ animation: 'pulse 1.5s infinite', marginBottom: 12 }} />
      <div>Cargando analíticas y estadísticas promedio...</div>
    </div>
  )

  return (
    <div>
      {/* Encabezado */}
      <div className="top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h2>Analíticas y Gráficos</h2>
          <div className="mut">Visión global e histórica del rendimiento ambiental</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn sec sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Actualizando...' : 'Actualizar datos'}
          </button>
        </div>
      </div>

      {/* Tarjetas KPI de Estadísticas Promedio de TODAS las variables */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
        marginBottom: '20px'
      }}>
        {/* Temperatura */}
        <div className="card" style={{ borderLeft: '4px solid #C8102E', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '12.5px', color: 'var(--mut)', fontWeight: 600 }}>Temperatura Media</span>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(200, 16, 46, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Thermometer size={16} color="#C8102E" />
            </div>
          </div>
          <div className="big" style={{ color: '#C8102E' }}>
            {globalStats.temp.avg} <span style={{ fontSize: '18px', fontWeight: 600 }}>°C</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: '12px', color: 'var(--mut)' }}>
            <span>Mín: <strong style={{ color: 'var(--ink)' }}>{globalStats.temp.min}°C</strong></span>
            <span>•</span>
            <span>Máx: <strong style={{ color: 'var(--ink)' }}>{globalStats.temp.max}°C</strong></span>
          </div>
        </div>

        {/* Humedad */}
        <div className="card" style={{ borderLeft: '4px solid #0A84FF', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '12.5px', color: 'var(--mut)', fontWeight: 600 }}>Humedad Media</span>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(10, 132, 255, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Droplets size={16} color="#0A84FF" />
            </div>
          </div>
          <div className="big" style={{ color: '#0A84FF' }}>
            {globalStats.hum.avg} <span style={{ fontSize: '18px', fontWeight: 600 }}>%</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: '12px', color: 'var(--mut)' }}>
            <span>Mín: <strong style={{ color: 'var(--ink)' }}>{globalStats.hum.min}%</strong></span>
            <span>•</span>
            <span>Máx: <strong style={{ color: 'var(--ink)' }}>{globalStats.hum.max}%</strong></span>
          </div>
        </div>

        {/* Presión */}
        <div className="card" style={{ borderLeft: '4px solid #32D74B', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '12.5px', color: 'var(--mut)', fontWeight: 600 }}>Presión Diferencial</span>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(50, 215, 75, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Gauge size={16} color="#32D74B" />
            </div>
          </div>
          <div className="big" style={{ color: '#32D74B' }}>
            {globalStats.pres.avg} <span style={{ fontSize: '18px', fontWeight: 600 }}>Pa</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: '12px', color: 'var(--mut)' }}>
            <span>Mín: <strong style={{ color: 'var(--ink)' }}>{globalStats.pres.min} Pa</strong></span>
            <span>•</span>
            <span>Máx: <strong style={{ color: 'var(--ink)' }}>{globalStats.pres.max} Pa</strong></span>
          </div>
        </div>

        {/* Muestras Totales */}
        <div className="card" style={{ borderLeft: '4px solid var(--wine)', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '12.5px', color: 'var(--mut)', fontWeight: 600 }}>Muestras en Historial</span>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'color-mix(in srgb, var(--wine) 15%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <BarChart2 size={16} color="var(--wine)" />
            </div>
          </div>
          <div className="big">
            {globalStats.total} <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--mut)' }}>lecturas</span>
          </div>
          <div style={{ marginTop: 8, fontSize: '12px', color: 'var(--mut)' }}>
            Consolidado de <strong style={{ color: 'var(--ink)' }}>{areas.length} áreas</strong> de laboratorio
          </div>
        </div>
      </div>

      {/* Gráfica de Promedios Generales con Selector Multivariable */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px' }}>
              Estadísticas y Tendencias Promedio General (Todas las áreas)
            </h3>
            <div className="mut" style={{ fontSize: '12.5px', marginTop: 4 }}>
              Comportamiento promedio consolidado de las variables ambientales
            </div>
          </div>

          {/* Selector de modo / variable */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setMetricTab('all')}
              className={`btn sm ${metricTab === 'all' ? '' : 'sec'}`}
              style={{
                borderRadius: '20px',
                padding: '6px 13px',
                fontSize: '12.5px',
                background: metricTab === 'all' ? 'var(--wine)' : undefined
              }}
            >
              <Layers size={13} /> Todas las variables
            </button>
            <button
              onClick={() => setMetricTab('temp')}
              className={`btn sm ${metricTab === 'temp' ? '' : 'sec'}`}
              style={{
                borderRadius: '20px',
                padding: '6px 13px',
                fontSize: '12.5px',
                background: metricTab === 'temp' ? '#C8102E' : undefined,
                color: metricTab === 'temp' ? '#fff' : undefined,
                borderColor: metricTab === 'temp' ? '#C8102E' : undefined
              }}
            >
              <Thermometer size={13} /> Temp ({globalStats.temp.avg} °C)
            </button>
            <button
              onClick={() => setMetricTab('hum')}
              className={`btn sm ${metricTab === 'hum' ? '' : 'sec'}`}
              style={{
                borderRadius: '20px',
                padding: '6px 13px',
                fontSize: '12.5px',
                background: metricTab === 'hum' ? '#0A84FF' : undefined,
                color: metricTab === 'hum' ? '#fff' : undefined,
                borderColor: metricTab === 'hum' ? '#0A84FF' : undefined
              }}
            >
              <Droplets size={13} /> Humedad ({globalStats.hum.avg} %)
            </button>
            <button
              onClick={() => setMetricTab('pres')}
              className={`btn sm ${metricTab === 'pres' ? '' : 'sec'}`}
              style={{
                borderRadius: '20px',
                padding: '6px 13px',
                fontSize: '12.5px',
                background: metricTab === 'pres' ? '#32D74B' : undefined,
                color: metricTab === 'pres' ? '#fff' : undefined,
                borderColor: metricTab === 'pres' ? '#32D74B' : undefined
              }}
            >
              <Gauge size={13} /> Presión ({globalStats.pres.avg} Pa)
            </button>
          </div>
        </div>

        {/* Gráfico según el modo seleccionado */}
        <div style={{ height: 320, width: '100%', marginTop: 10 }}>
          {globalData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              {metricTab === 'all' ? (
                // Vista consolidada comparativa multieje
                <LineChart data={globalData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} stroke="var(--line)" />
                  <XAxis dataKey="time" stroke="var(--mut)" tick={{ fontSize: 12 }} />
                  <YAxis
                    yAxisId="left"
                    stroke="var(--mut)"
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Temp (°C) / Hum (%)', angle: -90, position: 'insideLeft', style: { fill: 'var(--mut)', fontSize: 11 } }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="var(--mut)"
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Presión (Pa)', angle: 90, position: 'insideRight', style: { fill: 'var(--mut)', fontSize: 11 } }}
                  />
                  <Tooltip content={<CustomAnalyticsTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="temp"
                    stroke="#C8102E"
                    strokeWidth={2.5}
                    name="Temperatura Promedio (°C)"
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="hum"
                    stroke="#0A84FF"
                    strokeWidth={2.5}
                    name="Humedad Promedio (%)"
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="pres"
                    stroke="#32D74B"
                    strokeWidth={2.5}
                    name="Presión Promedio (Pa)"
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              ) : metricTab === 'temp' ? (
                // Vista detallada de Temperatura Promedio
                <AreaChart data={globalData}>
                  <defs>
                    <linearGradient id="colorTempGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C8102E" stopOpacity={0.85}/>
                      <stop offset="95%" stopColor="#C8102E" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} stroke="var(--line)" />
                  <XAxis dataKey="time" stroke="var(--mut)" tick={{ fontSize: 12 }} />
                  <YAxis stroke="var(--mut)" domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 12 }} unit="°C" />
                  <Tooltip content={<CustomAnalyticsTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="temp"
                    stroke="#C8102E"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorTempGrad)"
                    name="Temperatura Promedio (°C)"
                  />
                </AreaChart>
              ) : metricTab === 'hum' ? (
                // Vista detallada de Humedad Promedio
                <AreaChart data={globalData}>
                  <defs>
                    <linearGradient id="colorHumGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.85}/>
                      <stop offset="95%" stopColor="#0A84FF" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} stroke="var(--line)" />
                  <XAxis dataKey="time" stroke="var(--mut)" tick={{ fontSize: 12 }} />
                  <YAxis stroke="var(--mut)" domain={['dataMin - 3', 'dataMax + 3']} tick={{ fontSize: 12 }} unit="%" />
                  <Tooltip content={<CustomAnalyticsTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="hum"
                    stroke="#0A84FF"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorHumGrad)"
                    name="Humedad Promedio (%)"
                  />
                </AreaChart>
              ) : (
                // Vista detallada de Presión Promedio
                <AreaChart data={globalData}>
                  <defs>
                    <linearGradient id="colorPresGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#32D74B" stopOpacity={0.85}/>
                      <stop offset="95%" stopColor="#32D74B" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} stroke="var(--line)" />
                  <XAxis dataKey="time" stroke="var(--mut)" tick={{ fontSize: 12 }} />
                  <YAxis stroke="var(--mut)" domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 12 }} unit="Pa" />
                  <Tooltip content={<CustomAnalyticsTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="pres"
                    stroke="#32D74B"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorPresGrad)"
                    name="Presión Promedio (Pa)"
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--mut)' }}>
              No hay lecturas registradas para generar el gráfico global.
            </div>
          )}
        </div>
      </div>

      {/* Sección 2: Análisis y Estadísticas por Área Individual */}
      <div className="card">
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px' }}>Análisis Detallado por Área</h3>
            <div className="mut" style={{ fontSize: '12.5px', marginTop: 4 }}>
              Filtra por sala específica para inspeccionar sus mediciones individuales
            </div>
          </div>
          <select
            value={selectedArea}
            onChange={e => setSelectedArea(e.target.value)}
            style={{
              width: 260,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'var(--card)',
              color: 'var(--ink)'
            }}
          >
            <option value="all">Seleccione un área...</option>
            {areas.map(a => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>
        </div>

        {/* Resumen estadístico del área seleccionada */}
        {selectedAreaStats && (
          <div style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            padding: '12px 14px',
            background: 'color-mix(in srgb, var(--line) 40%, transparent)',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: '13px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Thermometer size={14} color="#C8102E" />
              <span>Temp Media: <strong>{selectedAreaStats.temp.avg} °C</strong> (Mín {selectedAreaStats.temp.min} / Máx {selectedAreaStats.temp.max})</span>
            </div>
            <div style={{ color: 'var(--line)' }}>|</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Droplets size={14} color="#0A84FF" />
              <span>Humedad Media: <strong>{selectedAreaStats.hum.avg} %</strong> (Mín {selectedAreaStats.hum.min} / Máx {selectedAreaStats.hum.max})</span>
            </div>
            <div style={{ color: 'var(--line)' }}>|</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Gauge size={14} color="#32D74B" />
              <span>Presión Media: <strong>{selectedAreaStats.pres.avg} Pa</strong> (Mín {selectedAreaStats.pres.min} / Máx {selectedAreaStats.pres.max})</span>
            </div>
            <div style={{ color: 'var(--line)' }}>|</div>
            <div style={{ color: 'var(--mut)' }}>
              Total muestras: <strong>{selectedAreaStats.total}</strong>
            </div>
          </div>
        )}

        {selectedArea !== 'all' ? (
          <div style={{ height: 350, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={areaData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} stroke="var(--line)" />
                <XAxis dataKey="time" stroke="var(--mut)" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" stroke="var(--mut)" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" stroke="var(--mut)" tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomAnalyticsTooltip />} />
                <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />
                <Line yAxisId="left" type="monotone" dataKey="temp" stroke="#FF3B30" name="Temp. (°C)" dot={false} strokeWidth={2} activeDot={{ r: 4 }} />
                <Line yAxisId="left" type="monotone" dataKey="hum" stroke="#0A84FF" name="Humedad (%)" dot={false} strokeWidth={2} activeDot={{ r: 4 }} />
                <Line yAxisId="right" type="monotone" dataKey="pres" stroke="#32D74B" name="Presión (Pa)" dot={false} strokeWidth={2} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--mut)' }}>
            Selecciona un área en el menú para ver sus gráficas detalladas y estadísticas individuales.
          </div>
        )}
      </div>
    </div>
  )
}
