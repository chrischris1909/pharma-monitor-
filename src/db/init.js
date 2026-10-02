// ============================================
// PHARMA MONITOR - INICIALIZACIÓN DE BASE DE DATOS
// Ejecutar con: npm run db:init
// ============================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, testConnection } from './pool.js';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDatabase() {
  console.log('🚀 Iniciando inicialización de base de datos...');
  console.log('📍 Entorno:', config.nodeEnv);
  console.log('📍 DB:', `${config.db.host}:${config.db.port}/${config.db.database}`);

  // Verificar conexión
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ No se pudo conectar a la base de datos. Verifica .env');
    process.exit(1);
  }

  // Leer schema.sql
  const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error('❌ No se encuentra database/schema.sql');
    process.exit(1);
  }

  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // Dividir en statements (simple split por ; al final de línea)
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📋 Ejecutando ${statements.length} statements SQL...`);

  let success = 0;
  let errors = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;

    try {
      await pool.query(stmt);
      success++;
      if (config.nodeEnv === 'development') {
        const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
        console.log(`  ✅ [${i + 1}/${statements.length}] ${preview}...`);
      }
    } catch (error) {
      // Ignorar errores de "already exists" para idempotencia
      const msg = error.message.toLowerCase();
      if (msg.includes('already exists') || msg.includes('duplicate key') || msg.includes('relation') && msg.includes('exists')) {
        success++;
        if (config.nodeEnv === 'development') {
          console.log(`  ⚠️  [${i + 1}/${statements.length}] Ya existe (omitido)`);
        }
      } else {
        errors++;
        console.error(`  ❌ [${i + 1}/${statements.length}] Error:`, error.message);
        console.error('     Statement:', stmt.substring(0, 200));
      }
    }
  }

  console.log('\n📊 Resumen:');
  console.log(`  ✅ Exitosos: ${success}`);
  console.log(`  ❌ Errores: ${errors}`);

  if (errors > 0) {
    console.log('\n⚠️  Hubo errores. Revisa los logs arriba.');
  } else {
    console.log('\n✅ Base de datos inicializada correctamente');
  }

  await pool.end();
  process.exit(errors > 0 ? 1 : 0);
}

// Ejecutar si es llamado directamente
initDatabase();