// ============================================
// PHARMA MONITOR - LOADING COMPONENT
// ============================================

export default function LoadingScreen({ message = 'Cargando...' }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh', // changed to 100vh for a full screen feel
      background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.95)), url(/bg-login.jpg) center/cover',
      gap: '16px',
      color: 'var(--wine)',
      fontWeight: '600'
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid rgba(122, 21, 48, 0.2)',
        borderTopColor: 'var(--wine)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <span>{message}</span>
      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}