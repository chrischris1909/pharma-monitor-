import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Lock } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LockScreen() {
  const { user } = useAuth()
  const [locked, setLocked] = useState(false)
  const [pin, setPin] = useState('')

  useEffect(() => {
    let timeout

    const resetTimer = () => {
      if (locked) return
      clearTimeout(timeout)
      // Bloquear después de 5 minutos de inactividad (300000 ms)
      timeout = setTimeout(() => setLocked(true), 300000)
    }

    window.addEventListener('mousemove', resetTimer)
    window.addEventListener('keydown', resetTimer)
    window.addEventListener('click', resetTimer)
    window.addEventListener('scroll', resetTimer)

    resetTimer()

    return () => {
      clearTimeout(timeout)
      window.removeEventListener('mousemove', resetTimer)
      window.removeEventListener('keydown', resetTimer)
      window.removeEventListener('click', resetTimer)
      window.removeEventListener('scroll', resetTimer)
    }
  }, [locked])

  const handleUnlock = (e) => {
    e.preventDefault()
    // Para la demostración, el PIN por defecto es 1234
    if (pin === '1234') {
      setLocked(false)
      setPin('')
      toast.success('Sesión desbloqueada')
    } else {
      toast.error('PIN incorrecto. (Usa 1234 para demo)')
      setPin('')
    }
  }

  if (!locked) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(10px)',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      color: '#fff'
    }}>
      <Lock size={48} style={{ marginBottom: 20, color: 'var(--red)' }} />
      <h2 style={{ marginBottom: 10 }}>Sesión Bloqueada</h2>
      <p style={{ color: 'var(--mut)', marginBottom: 30 }}>{user?.nombre} - Por seguridad, ingresa tu PIN (Demo: 1234)</p>
      
      <form onSubmit={handleUnlock} style={{ display: 'flex', gap: 10 }}>
        <input 
          type="password" 
          value={pin}
          onChange={e => setPin(e.target.value)}
          placeholder="****"
          maxLength={4}
          autoFocus
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff',
            fontSize: 24,
            textAlign: 'center',
            width: 120,
            letterSpacing: 8,
            borderRadius: 8,
            padding: 10
          }}
        />
        <button type="submit" className="btn red">Desbloquear</button>
      </form>
    </div>
  )
}
