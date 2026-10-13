// ============================================
// PHARMA MONITOR - MODO SALA / PANTALLA TV
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Tv, 
  Maximize2, 
  Minimize2, 
  ArrowLeft, 
  Play, 
  Pause, 
  AlertTriangle, 
  CheckCircle2, 
  Flame, 
  Droplets, 
  Gauge, 
  Clock, 
  Layers, 
  LayoutGrid,
  Radio
} from 'lucide-react'
import { api, ws } from '../services/api'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { usePageTitle } from '../hooks/usePageTitle'

const lab = { ok: 'Estable', warn: 'Advertencia', bad: 'Crítico', sin_datos: 'Sin datos' }

export default function TvMode() {
  usePageTitle('Modo Sala (TV)')
  const navigate = useNavigate()

  const [areas, setAreas] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState('carousel') // 'carousel' | 'grid'
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(0)

  const ROTATION_INTERVAL = 10000 // 10 segundos por área

  // Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Listener para estado de pantalla completa
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error('Error al activar pantalla completa:', err)
      })
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
    }
  }

  // Carga inicial de datos
  const fetchData = useCallback(async () => {
    try {
      const [areasRes, alertsRes] = await Promise.all([
        api.get('/areas/estado'),
        api.get('/alertas/pendientes')
      ])
      const activeAreas = (areasRes.data.areas || []).filter(a => a.estado !== 'sin_datos')
      setAreas(activeAreas)
      setAlerts(alertsRes.data.alertas || [])
    } catch (err) {
      console.error('Error cargando datos para Modo TV:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    // Polling de respaldo cada 20 segundos
    const interval = setInterval(fetchData, 20000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Suscripción WebSocket para tiempo real
  useEffect(() => {
    const unsub1 = ws.on('lectura:nueva', (lectura) => {
      setAreas(prev => prev.map(a => a.area_id === lectura.area_id ? { ...a, ...lectura } : a))
    })
    const unsub2 = ws.on('alerta:nueva', (alerta) => {
      setAlerts(prev => [alerta, ...prev.filter(a => a.id !== alerta.id).slice(0, 9)])
    })
    const unsub3 = ws.on('estado:actual', (estadoAreas) => {
      setAreas((estadoAreas || []).filter(a => a.estado !== 'sin_datos'))
    })
    return () => {
      unsub1()
      unsub2()
      unsub3()
    }
  }, [])

  // Rotación automática del carrusel
  useEffect(() => {
    if (viewMode !== 'carousel' || isPaused || areas.length <= 1) {
      setProgress(0)
      return
    }

    const stepMs = 100
    const increment = (stepMs / ROTATION_INTERVAL) * 100

    const progressTimer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          setCurrentIndex(curr => (curr + 1) % areas.length)
          return 0
        }
        return prev + increment
      })
    }, stepMs)

    return () => clearInterval(progressTimer)
  }, [viewMode, isPaused, areas.length])

  // Evaluación general del estado de la planta
  const overall = useMemo(() => {
    if (areas.some(a => a.estado === 'bad')) return 'bad'
    if (areas.some(a => a.estado === 'warn')) return 'warn'
    return 'ok'
  }, [areas])

  const okCount = useMemo(() => areas.filter(a => a.estado === 'ok').length, [areas])
  const currentArea = areas[currentIndex] || areas[0]

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0c0a0c',
      color: '#f3ecee',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 32px',
      boxSizing: 'border-box',
      overflow: 'hidden',
      userSelect: 'none'
    }}>
      {/* BARRA SUPERIOR / HEADER TV */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: '20px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        marginBottom: '20px'
      }}>
        {/* Logo & Título de Planta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            background: '#ffffff',
            padding: '6px 14px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)'
          }}>
            <img src="/logo-siegfried.png" alt="Siegfried" style={{ height: '36px', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                fontSize: '11px', 
                textTransform: 'uppercase', 
                letterSpacing: '2px', 
                fontWeight: 700, 
                color: '#c8102e',
                background: 'rgba(200,16,46,0.15)',
                padding: '2px 8px',
                borderRadius: '4px'
              }}>
                Control de Planta cGMP
              </span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>•</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#28cd41', fontSize: '12px', fontWeight: 600 }}>
                <Radio size={14} className="pulse" />
                ENLACE PLC EN VIVO
              </div>
            </div>
            <h1 style={{ 
              margin: '2px 0 0', 
              fontSize: '22px', 
              fontWeight: 800, 
              letterSpacing: '-0.5px',
              fontFamily: "'Inter', sans-serif" 
            }}>
              SISTEMA AMBIENTAL FARMACÉUTICO
            </h1>
          </div>
        </div>

        {/* Estado General Centrado */}
        <div style={{
          padding: '10px 24px',
          borderRadius: '999px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: overall === 'bad' 
            ? 'rgba(255, 59, 48, 0.2)' 
            : overall === 'warn' 
            ? 'rgba(255, 159, 10, 0.2)' 
            : 'rgba(40, 205, 65, 0.15)',
          border: `1.5px solid ${overall === 'bad' ? '#ff3b30' : overall === 'warn' ? '#ff9f0a' : '#28cd41'}`,
          boxShadow: overall === 'bad' ? '0 0 24px rgba(255,59,48,0.4)' : 'none'
        }}>
          {overall === 'bad' ? (
            <Flame size={22} style={{ color: '#ff3b30' }} />
          ) : overall === 'warn' ? (
            <AlertTriangle size={22} style={{ color: '#ff9f0a' }} />
          ) : (
            <CheckCircle2 size={22} style={{ color: '#28cd41' }} />
          )}
          <div style={{ textAlign: 'left' }}>
            <div style={{
              fontSize: '15px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: overall === 'bad' ? '#ff453a' : overall === 'warn' ? '#ffd60a' : '#30d158'
            }}>
              {overall === 'bad' 
                ? 'DESVIACIÓN CRÍTICA EN SALAS' 
                : overall === 'warn' 
                ? 'ADVERTENCIA EN LÍMITES' 
                : 'CONDICIONES NOMINALES (TODO OK)'}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.8, color: '#f3ecee' }}>
              {okCount} de {areas.length} áreas operando en tolerancia
            </div>
          </div>
        </div>

        {/* Reloj Digital & Botones de Control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Reloj */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ 
              fontSize: '28px', 
              fontWeight: 800, 
              fontFamily: "'Courier New', Courier, monospace",
              letterSpacing: '1px',
              color: '#ffffff'
            }}>
              {format(currentTime, 'HH:mm:ss')}
            </div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', textTransform: 'capitalize' }}>
              {format(currentTime, "EEEE, d 'de' MMMM", { locale: es })}
            </div>
          </div>

          {/* Selector de Modo (Rotativo vs Mosaico) */}
          <div style={{ 
            display: 'flex', 
            background: 'rgba(255,255,255,0.08)', 
            padding: '4px', 
            borderRadius: '10px' 
          }}>
            <button
              onClick={() => setViewMode('carousel')}
              style={{
                background: viewMode === 'carousel' ? 'var(--wine, #722f37)' : 'transparent',
                border: 'none',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 600
              }}
              title="Modo Rotativo Gran Angular"
            >
              <Layers size={16} />
              Rotativo
            </button>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                background: viewMode === 'grid' ? 'var(--wine, #722f37)' : 'transparent',
                border: 'none',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 600
              }}
              title="Modo Mosaico Todas las Áreas"
            >
              <LayoutGrid size={16} />
              Mosaico
            </button>
          </div>

          {/* Pantalla Completa & Salir */}
          <button
            onClick={toggleFullscreen}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff',
              padding: '10px',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title={isFullscreen ? 'Salir de Pantalla Completa' : 'Pantalla Completa'}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>

          <button
            onClick={() => navigate('/')}
            style={{
              background: 'rgba(200, 16, 46, 0.2)',
              border: '1px solid #c8102e',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontWeight: 700
            }}
          >
            <ArrowLeft size={16} />
            Salir de TV
          </button>
        </div>
      </header>

      {/* CUERPO PRINCIPAL */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', opacity: 0.6 }}>
            Cargando visualización de planta...
          </div>
        ) : areas.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', opacity: 0.6 }}>
            No hay áreas activas registradas en el sistema.
          </div>
        ) : viewMode === 'carousel' && currentArea ? (
          /* ======================================================== */
          /* MODO ROTATIVO / CARRUSEL (ULTRA-LEGIBLE A LARGA DISTANCIA) */
          /* ======================================================== */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Barra de progreso de transición */}
            <div style={{
              height: '4px',
              width: '100%',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, var(--red, #c8102e), #ff3b30)',
                transition: 'width 0.1s linear'
              }} />
            </div>

            {/* Cabecera del área enfocada */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 24px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.08)'
            }}>
              <div>
                <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
                  Área {currentIndex + 1} de {areas.length} • Tipo: {currentArea.tipo_area || 'Laboratorio'}
                </div>
                <h2 style={{ fontSize: '38px', margin: '4px 0 0', fontWeight: 800, color: '#ffffff' }}>
                  {currentArea.nombre}
                </h2>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                {/* Controles de pausa */}
                <button
                  onClick={() => setIsPaused(!isPaused)}
                  style={{
                    background: isPaused ? 'rgba(255, 159, 10, 0.2)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${isPaused ? '#ff9f0a' : 'rgba(255,255,255,0.1)'}`,
                    color: isPaused ? '#ff9f0a' : '#ffffff',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontWeight: 600
                  }}
                >
                  {isPaused ? <Play size={16} /> : <Pause size={16} />}
                  {isPaused ? 'Reanudar Rotación' : 'Pausar Aquí'}
                </button>

                {/* Badge de Estado del Área */}
                <div style={{
                  padding: '10px 24px',
                  borderRadius: '12px',
                  fontSize: '18px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  background: currentArea.estado === 'bad' 
                    ? 'rgba(255,59,48,0.25)' 
                    : currentArea.estado === 'warn' 
                    ? 'rgba(255,159,10,0.25)' 
                    : 'rgba(40,205,65,0.2)',
                  color: currentArea.estado === 'bad' 
                    ? '#ff453a' 
                    : currentArea.estado === 'warn' 
                    ? '#ffd60a' 
                    : '#30d158',
                  border: `2px solid ${currentArea.estado === 'bad' ? '#ff3b30' : currentArea.estado === 'warn' ? '#ff9f0a' : '#28cd41'}`
                }}>
                  {lab[currentArea.estado] || 'Estable'}
                </div>
              </div>
            </div>

            {/* 3 TARJETAS GIGANTES DE VARIABLES */}
            <div style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '24px'
            }}>
              {/* 1. TEMPERATURA */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '24px',
                padding: '36px 32px',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
                    Temperatura
                  </span>
                  <Flame size={32} style={{ color: '#ff9f0a' }} />
                </div>

                <div style={{ textAlign: 'center', margin: '20px 0' }}>
                  <div style={{
                    fontSize: '84px',
                    fontWeight: 900,
                    lineHeight: 1,
                    color: currentArea.temperatura < currentArea.temp_min || currentArea.temperatura > currentArea.temp_max
                      ? '#ff453a'
                      : '#ffffff'
                  }}>
                    {currentArea.temperatura != null ? Number(currentArea.temperatura).toFixed(1) : '--'}
                    <span style={{ fontSize: '40px', fontWeight: 500, marginLeft: '8px', color: 'rgba(255,255,255,0.5)' }}>°C</span>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(255,255,255,0.05)',
                  padding: '16px',
                  borderRadius: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '15px'
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>Rango Validado:</span>
                  <b style={{ color: '#ffffff' }}>{currentArea.temp_min || 18} °C — {currentArea.temp_max || 25} °C</b>
                </div>
              </div>

              {/* 2. HUMEDAD RELATIVA */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '24px',
                padding: '36px 32px',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
                    Humedad Relativa
                  </span>
                  <Droplets size={32} style={{ color: '#0a84ff' }} />
                </div>

                <div style={{ textAlign: 'center', margin: '20px 0' }}>
                  <div style={{
                    fontSize: '84px',
                    fontWeight: 900,
                    lineHeight: 1,
                    color: currentArea.humedad > currentArea.humedad_max ? '#ff453a' : '#ffffff'
                  }}>
                    {currentArea.humedad != null ? Number(currentArea.humedad).toFixed(0) : '--'}
                    <span style={{ fontSize: '40px', fontWeight: 500, marginLeft: '8px', color: 'rgba(255,255,255,0.5)' }}>%</span>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(255,255,255,0.05)',
                  padding: '16px',
                  borderRadius: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '15px'
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>Límite Máximo:</span>
                  <b style={{ color: '#ffffff' }}>≤ {currentArea.humedad_max || 65} %</b>
                </div>
              </div>

              {/* 3. PRESIÓN DIFERENCIAL */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '24px',
                padding: '36px 32px',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
                    Presión Diferencial
                  </span>
                  <Gauge size={32} style={{ color: '#30d158' }} />
                </div>

                <div style={{ textAlign: 'center', margin: '20px 0' }}>
                  <div style={{
                    fontSize: '84px',
                    fontWeight: 900,
                    lineHeight: 1,
                    color: currentArea.presion < currentArea.presion_min || currentArea.presion > currentArea.presion_max
                      ? '#ff453a'
                      : '#ffffff'
                  }}>
                    {currentArea.presion != null ? Number(currentArea.presion).toFixed(1) : '--'}
                    <span style={{ fontSize: '40px', fontWeight: 500, marginLeft: '8px', color: 'rgba(255,255,255,0.5)' }}>Pa</span>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(255,255,255,0.05)',
                  padding: '16px',
                  borderRadius: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '15px'
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>Presión Requerida:</span>
                  <b style={{ color: '#ffffff' }}>{currentArea.presion_min || 10} Pa — {currentArea.presion_max || 15} Pa</b>
                </div>
              </div>
            </div>

            {/* Selector inferior rápido de áreas */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              {areas.map((a, i) => (
                <button
                  key={a.area_id}
                  onClick={() => {
                    setCurrentIndex(i)
                    setProgress(0)
                  }}
                  style={{
                    background: i === currentIndex ? 'var(--red, #c8102e)' : 'rgba(255,255,255,0.1)',
                    border: 'none',
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 700,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {a.nombre}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* MODO MOSAICO / CUADRÍCULA (TODAS LAS ÁREAS SIMULTÁNEAS) */
          /* ======================================================== */
          <div style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: areas.length <= 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
            gap: '20px',
            overflowY: 'auto'
          }}>
            {areas.map(a => (
              <div
                key={a.area_id}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1.5px solid ${a.estado === 'bad' ? '#ff3b30' : a.estado === 'warn' ? '#ff9f0a' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '18px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: a.estado === 'bad' ? '0 0 20px rgba(255,59,48,0.2)' : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '22px', margin: 0, fontWeight: 800, color: '#ffffff' }}>{a.nombre}</h3>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                      Tipo: {a.tipo_area || 'Área limpia'}
                    </div>
                  </div>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    background: a.estado === 'bad' ? 'rgba(255,59,48,0.25)' : a.estado === 'warn' ? 'rgba(255,159,10,0.25)' : 'rgba(40,205,65,0.2)',
                    color: a.estado === 'bad' ? '#ff453a' : a.estado === 'warn' ? '#ffd60a' : '#30d158'
                  }}>
                    {lab[a.estado] || 'Estable'}
                  </span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                  textAlign: 'center'
                }}>
                  <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px 8px', borderRadius: '12px' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Temperatura</div>
                    <div style={{ fontSize: '26px', fontWeight: 800, margin: '4px 0', color: a.temperatura < a.temp_min || a.temperatura > a.temp_max ? '#ff453a' : '#ffffff' }}>
                      {a.temperatura != null ? Number(a.temperatura).toFixed(1) : '--'}°C
                    </div>
                    <div style={{ fontSize: '10px', opacity: 0.6 }}>{a.temp_min}–{a.temp_max}°</div>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px 8px', borderRadius: '12px' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Humedad</div>
                    <div style={{ fontSize: '26px', fontWeight: 800, margin: '4px 0', color: a.humedad > a.humedad_max ? '#ff453a' : '#ffffff' }}>
                      {a.humedad != null ? Number(a.humedad).toFixed(0) : '--'}%
                    </div>
                    <div style={{ fontSize: '10px', opacity: 0.6 }}>≤ {a.humedad_max}%</div>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px 8px', borderRadius: '12px' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Presión</div>
                    <div style={{ fontSize: '26px', fontWeight: 800, margin: '4px 0', color: a.presion < a.presion_min || a.presion > a.presion_max ? '#ff453a' : '#ffffff' }}>
                      {a.presion != null ? Number(a.presion).toFixed(1) : '--'}Pa
                    </div>
                    <div style={{ fontSize: '10px', opacity: 0.6 }}>{a.presion_min}–{a.presion_max}Pa</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* PIE DE PANTALLA: CINTILLO INFORMATIVO & TICKER DE ALERTAS */}
      <footer style={{
        marginTop: '20px',
        paddingTop: '16px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '13px'
      }}>
        {/* Ticker de Alertas Activas o Mensaje cGMP */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, overflow: 'hidden' }}>
          {alerts.length > 0 ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#ff453a',
              background: 'rgba(255, 59, 48, 0.15)',
              padding: '6px 16px',
              borderRadius: '8px',
              fontWeight: 700
            }}>
              <AlertTriangle size={16} />
              <span>ALERTA ACTIVA: {alerts[0].area_nombre || 'Sala'} — {alerts[0].mensaje}</span>
              <span style={{ opacity: 0.7, fontSize: '11px' }}>
                ({format(new Date(alerts[0].created_at || new Date()), 'HH:mm')})
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#30d158', opacity: 0.9 }}>
              <CheckCircle2 size={16} />
              <span>Sistemas de climatización y presurización operando dentro de los rangos validados por Calidad.</span>
            </div>
          )}
        </div>

        {/* Info y Versión */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
          <span>Modo Pantalla Continua (Bloqueo por Inactividad Desactivado)</span>
          <span>•</span>
          <span>Pharma Monitor v2.5</span>
        </div>
      </footer>
    </div>
  )
}
