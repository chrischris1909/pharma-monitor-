// ============================================
// PHARMA MONITOR - SERVICIO API
// ============================================

import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  async error => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const baseUrl = import.meta.env.VITE_API_URL || '/api'
        const res = await axios.post(`${baseUrl}/auth/refresh`, { refreshToken: localStorage.getItem('refreshToken') }, { withCredentials: true })
        localStorage.setItem('token', res.data.accessToken)
        localStorage.setItem('refreshToken', res.data.refreshToken)
        original.headers.Authorization = `Bearer ${res.data.accessToken}`
        return api(original)
      } catch {
        localStorage.clear()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export { api }
export default api

// ============================================
// WEBSOCKET SERVICE
// ============================================

class WS {
  constructor() {
    this.socket = null
    this.connected = false
    this.handlers = new Map()
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
  }

  connect(token) {
    if (this.socket?.readyState === WebSocket.OPEN) return

    // Sin VITE_WS_URL (Docker/Nginx) usamos el mismo origen de la página
    const wsBase = import.meta.env.VITE_WS_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3000')
    const wsUrl = wsBase.replace(/^http/, 'ws')
    this.socket = new WebSocket(`${wsUrl}/socket.io/?token=${token}&EIO=4&transport=websocket`)

    this.socket.onopen = () => {
      this.connected = true
      this.reconnectAttempts = 0
      this.emit('connect')
      // Unirse a salas globales
      this.send('join:alertas')
      this.send('request:estado')
    }

    this.socket.onmessage = (event) => {
      try {
        // Socket.IO protocol parsing
        const data = event.data
        if (data.startsWith('42')) {
          const [, payload] = JSON.parse(data.slice(1))
          const [eventName, eventData] = payload
          this.emit(eventName, eventData)
        }
      } catch (e) {
        // Ignore parsing errors for heartbeat messages
      }
    }

    this.socket.onclose = () => {
      this.connected = false
      this.emit('disconnect')
      this.attemptReconnect(token)
    }

    this.socket.onerror = (err) => {
      console.error('WebSocket error:', err)
    }
  }

  attemptReconnect(token) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      setTimeout(() => this.connect(token), 2000 * this.reconnectAttempts)
    }
  }

  send(event, data) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(`42["${event}",${JSON.stringify(data || {})}]`)
    }
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, [])
    this.handlers.get(event).push(handler)
    return () => this.off(event, handler)
  }

  off(event, handler) {
    const handlers = this.handlers.get(event)
    if (handlers) {
      const idx = handlers.indexOf(handler)
      if (idx > -1) handlers.splice(idx, 1)
    }
  }

  emit(event, data) {
    const handlers = this.handlers.get(event)
    if (handlers) handlers.forEach(h => h(data))
  }

  disconnect() {
    this.socket?.close()
    this.socket = null
    this.connected = false
  }
}

export const ws = new WS()