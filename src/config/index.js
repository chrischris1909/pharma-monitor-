// ============================================
// PHARMA MONITOR - CONFIGURACIÓN CENTRALIZADA
// ============================================

export const config = {
  // Servidor
  port: parseInt(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Base de datos
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'pharma_monitor',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true',
    max: 20, // pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_change_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_in_production',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Email
  email: {
    host: process.env.EMAIL_HOST || 'smtp.office365.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    from: process.env.EMAIL_FROM || 'Pharma Monitor <noreply@siegfried.com>',
    alertRecipients: (process.env.ALERT_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean),
  },

  // Arduino / IoT
  arduino: {
    apiKey: process.env.ARDUINO_API_KEY || 'arduino_secret_key',
    pushIntervalMs: parseInt(process.env.ARDUINO_PUSH_INTERVAL_MS) || 5000,
  },

  // Umbrales globales (fallback)
  thresholds: {
    tempMin: parseFloat(process.env.DEFAULT_TEMP_MIN) || 18,
    tempMax: parseFloat(process.env.DEFAULT_TEMP_MAX) || 32,
    humedadMax: parseFloat(process.env.DEFAULT_HUMEDAD_MAX) || 65,
    presionMin: parseFloat(process.env.DEFAULT_PRESION_MIN) || 10,
    presionMax: parseFloat(process.env.DEFAULT_PRESION_MAX) || 15,
  },

  // Frontend (para CORS, etc)
  frontend: {
    apiUrl: process.env.VITE_API_URL || 'http://localhost:3000/api',
    wsUrl: process.env.VITE_WS_URL || 'http://localhost:3000',
  },

  // Colores Siegfried (para PDFs, emails, etc)
  siegfriedColors: {
    vinotinto: '#7B1113',
    rojo: '#C41E3A',
    grisOscuro: '#333333',
    grisMedio: '#666666',
    grisClaro: '#F5F5F5',
    blanco: '#FFFFFF',
    verdeExito: '#27AE60',
    amarilloAdvertencia: '#F39C12',
    rojoCritico: '#E74C3C',
  },
};

export default config;