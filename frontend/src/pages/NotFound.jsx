import { Link } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { usePageTitle } from '../hooks/usePageTitle'

export default function NotFound() {
  usePageTitle('Página no encontrada')
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', textAlign: 'center' }}>
      <FileQuestion size={80} style={{ color: 'var(--red)', marginBottom: '24px' }} />
      <h1 style={{ fontSize: '48px', margin: '0 0 16px 0', color: 'var(--ink)' }}>404</h1>
      <h2 style={{ margin: '0 0 24px 0', color: 'var(--mut)' }}>Página no encontrada</h2>
      <p style={{ maxWidth: '400px', color: 'var(--mut)', marginBottom: '32px' }}>
        Lo sentimos, la página que buscas no existe, fue eliminada o no tienes permisos para acceder a ella.
      </p>
      <Link to="/" className="btn">
        Volver al Dashboard
      </Link>
    </div>
  )
}
