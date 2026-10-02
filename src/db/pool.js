// ============================================
// PHARMA MONITOR - CONEXIÓN POSTGRESQL / TIMESCALEDB
// ============================================

import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

// Pool de conexiones
export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.connectionTimeoutMillis,
});

// Eventos del pool
pool.on('connect', (client) => {
  console.log('📦 Nueva conexión a PostgreSQL establecida');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en pool PostgreSQL:', err);
});

// Verificar conexión al inicio
export async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as now, version() as version');
    client.release();
    console.log('✅ Conexión a PostgreSQL exitosa:', result.rows[0].now);
    console.log('📊 Versión:', result.rows[0].version.split(' ')[0]);
    return true;
  } catch (error) {
    console.error('❌ Error conectando a PostgreSQL:', error.message);
    return false;
  }
}

// Helper para queries con logging en desarrollo
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (config.nodeEnv === 'development') {
      console.log('🔍 Query:', { text: text.substring(0, 100), duration: `${duration}ms`, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('❌ Query error:', { text: text.substring(0, 100), error: error.message });
    throw error;
  }
}

// Helper para transacciones
export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Cerrar pool (para shutdown graceful)
export async function closePool() {
  await pool.end();
  console.log('🔌 Pool de conexiones cerrado');
}

export default pool;