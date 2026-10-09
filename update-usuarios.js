import 'dotenv/config';
import { pool } from './src/db/pool.js';

async function run() {
  await pool.query(`
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos_fallidos INT DEFAULT 0;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMP;
  `);
  console.log('DB usuarios actualizados para seguridad.');
  process.exit(0);
}
run();
