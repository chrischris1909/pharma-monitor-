// ============================================
// PHARMA MONITOR - RUTAS DE CORREOS INSTITUCIONALES
// ============================================

import express from 'express';
import { query } from '../db/pool.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// GET /api/correos_institucionales
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.id, c.correo, c.nombre_completo, c.cargo, c.departamento, c.rol_sistema, c.activo, c.area_id, a.nombre as area_nombre, c.created_at
       FROM correos_institucionales c
       LEFT JOIN areas_laboratorio a ON a.id = c.area_id
       ORDER BY c.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo correos institucionales:', error);
    res.status(500).json({ error: 'Error obteniendo correos institucionales' });
  }
});

// POST /api/correos_institucionales
router.post('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { correo, nombre_completo, cargo, departamento, rol_sistema, area_id } = req.body;
    if (!correo || !nombre_completo) {
      return res.status(400).json({ error: 'Correo y nombre completo son requeridos' });
    }

    const result = await query(
      `INSERT INTO correos_institucionales (correo, nombre_completo, cargo, departamento, rol_sistema, area_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (correo) DO UPDATE SET
         nombre_completo = EXCLUDED.nombre_completo,
         cargo = EXCLUDED.cargo,
         departamento = EXCLUDED.departamento,
         rol_sistema = EXCLUDED.rol_sistema,
         area_id = EXCLUDED.area_id
       RETURNING *`,
      [correo, nombre_completo, cargo || 'Operador', departamento || 'Producción', rol_sistema || 'operador', area_id || null]
    );

    const fullRow = await query(
      `SELECT c.id, c.correo, c.nombre_completo, c.cargo, c.departamento, c.rol_sistema, c.activo, c.area_id, a.nombre as area_nombre, c.created_at
       FROM correos_institucionales c
       LEFT JOIN areas_laboratorio a ON a.id = c.area_id
       WHERE c.id = $1`,
      [result.rows[0].id]
    );

    // Auditoría
    await query(
      `INSERT INTO auditoria (usuario_nombre, accion, entidad, entidad_id, valores_nuevos, justificacion)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.nombre || req.user.correo_institucional, 'CREATE_INSTITUTIONAL_EMAIL', 'correos_institucionales', String(result.rows[0].id), JSON.stringify(fullRow.rows[0]), 'Registro de correo institucional con área']
    );

    res.status(201).json(fullRow.rows[0]);
  } catch (error) {
    console.error('Error creando correo institucional:', error);
    res.status(500).json({ error: 'Error guardando correo institucional' });
  }
});

// PATCH /api/correos_institucionales/:id
router.patch('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { correo, nombre_completo, cargo, departamento, area_id } = req.body;

    const result = await query(
      `UPDATE correos_institucionales
       SET nombre_completo = COALESCE($1, nombre_completo),
           cargo = COALESCE($2, cargo),
           departamento = COALESCE($3, departamento),
           area_id = CASE WHEN $4::boolean IS TRUE THEN $5::uuid ELSE area_id END,
           correo = COALESCE($6, correo)
       WHERE id = $7
       RETURNING *`,
      [nombre_completo, cargo, departamento, area_id !== undefined, area_id || null, correo || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Correo institucional no encontrado' });
    }

    const fullRow = await query(
      `SELECT c.id, c.correo, c.nombre_completo, c.cargo, c.departamento, c.rol_sistema, c.activo, c.area_id, a.nombre as area_nombre, c.created_at
       FROM correos_institucionales c
       LEFT JOIN areas_laboratorio a ON a.id = c.area_id
       WHERE c.id = $1`,
      [id]
    );

    res.json(fullRow.rows[0]);
  } catch (error) {
    console.error('Error actualizando correo institucional:', error);
    res.status(500).json({ error: 'Error actualizando correo institucional' });
  }
});

// DELETE /api/correos_institucionales/:id
router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM correos_institucionales WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Correo institucional no encontrado' });
    }

    // Auditoría
    await query(
      `INSERT INTO auditoria (usuario_nombre, accion, entidad, entidad_id, valores_anteriores, justificacion)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.nombre || req.user.correo_institucional, 'DELETE_INSTITUTIONAL_EMAIL', 'correos_institucionales', String(id), JSON.stringify(result.rows[0]), 'Eliminación de correo institucional']
    );

    res.json({ message: 'Correo institucional eliminado' });
  } catch (error) {
    console.error('Error eliminando correo institucional:', error);
    res.status(500).json({ error: 'Error eliminando correo institucional' });
  }
});

export default router;
