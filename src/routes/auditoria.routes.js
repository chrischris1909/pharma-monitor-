import express from 'express';
import { query } from '../db/pool.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await query('SELECT * FROM auditoria ORDER BY fecha_hora DESC LIMIT 100');
    res.json({ auditoria: result.rows });
  } catch (error) {
    console.error('Error fetching audit:', error);
    res.status(500).json({ error: 'Error obteniendo auditoría' });
  }
});

export default router;
