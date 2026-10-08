import 'dotenv/config';
import { pool } from './src/db/pool.js';

async function run() {
  const result = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
  console.log(result.rows);
  process.exit(0);
}
run();
