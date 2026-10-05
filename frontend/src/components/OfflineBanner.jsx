import { useState, useEffect } from 'react'
import { WifiOff } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

// Banner fijo que avisa cuando no hay conexión: los datos mostrados
// provienen de la caché del service worker y pueden estar desactualizados.
export default function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [lastOnline, setLastOnline] = useState(new Date())
  const [, setTick] = useState(0)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => { setLastOnline(new Date()); setOnline(false) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Refresca el "hace X min" mientras esté sin conexión
  useEffect(() => {
    if (online) return
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [online])

  if (online) return null

  return (
    <div
      role="alert"
      className="noprint"
      style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--warn)', color: '#fff',
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
        fontWeight: 600, fontSize: 14, borderRadius: 8, marginBottom: 14,
        boxShadow: '0 2px 8px rgba(0,0,0,.2)'
      }}
    >
      <WifiOff size={18} />
      <span>
        Sin conexión – los datos mostrados pueden estar desactualizados
        (última conexión {formatDistanceToNow(lastOnline, { locale: es, addSuffix: true })}).
        No se están recibiendo alertas en tiempo real.
      </span>
    </div>
  )
}
