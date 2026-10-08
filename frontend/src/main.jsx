// ============================================
// PHARMA MONITOR - MAIN ENTRY (ACTUALIZADO)
// ============================================

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import './styles/index.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('SW registration failed: ', err)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster 
          position="bottom-right" 
          toastOptions={{ 
            duration: 4000, 
            style: { background: '#231f20', color: '#f1ecec' },
            success: { iconTheme: { primary: '#1f9d55', secondary: '#fff' } },
            error: { iconTheme: { primary: '#d41f3a', secondary: '#fff' } }
          }} 
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)