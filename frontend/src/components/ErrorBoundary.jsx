import React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary capturó un error:', error, errorInfo)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 20px',
          textAlign: 'center',
          color: 'var(--ink)'
        }}>
          <AlertTriangle size={56} style={{ color: 'var(--red, #c8102e)', marginBottom: '16px' }} />
          <h2 style={{ fontSize: '24px', margin: '0 0 10px 0' }}>Ocurrió un error inesperado en esta vista</h2>
          <p style={{ color: 'var(--mut)', maxWidth: '460px', marginBottom: '24px', fontSize: '14px' }}>
            {this.state.error?.message || 'El componente encontró un problema al renderizarse.'}
          </p>
          <button 
            className="btn" 
            onClick={this.handleReload}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <RotateCcw size={16} /> Recargar vista
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
