import 'dotenv/config';
import { pool } from './src/db/pool.js';
import fs from 'fs';

async function run() {
  const sql = fs.readFileSync('database/feature_updates.sql', 'utf8');
  await pool.query(sql);
  console.log('DB updated!');
  process.exit(0);
}

run();
