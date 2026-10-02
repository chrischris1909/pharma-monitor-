// ============================================
// PHARMA MONITOR - RUTAS DE ÁREAS Y PARÁMETROS
// ============================================

import express from 'express';
import { query } from '../db/pool.js';
import { authMiddleware, requireSupervisor, requireAdmin } from '../middleware/auth.middleware.js';
import { validateArea, validateParametros, validateId, validatePagination, validateDateRange, handleValidationErrors } from '../middleware/validation.middleware.js';

const router = express.Router();

// ============================================
// ÁREAS
// ============================================

// GET /api/areas - Listar todas
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await query(`
      SELECT a.*, ps.temp_min, ps.temp_max, ps.humedad_min, ps.humedad_max, ps.presion_min, ps.presion_max
      FROM areas_laboratorio a
      LEFT JOIN parametros_seguridad ps ON ps.area_id = a.id
      WHERE a.activa = true
      ORDER BY a.nombre
    `);
    res.json({ areas: result.rows });
  } catch (error) {
    console.error('Error areas:', error);
    res.status(500).json({ error: 'Error obteniendo áreas' });
  }
});

// GET /api/areas/estado - Estado actual para dashboard
router.get('/estado', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM v_estado_areas');
    res.json({ areas: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo estado' });
  }
});

// GET /api/areas/:id
router.get('/:id', authMiddleware, validateId, handleValidationErrors, async (req, res) => {
  try {
    const result = await query(`
      SELECT a.*, ps.*
      FROM areas_laboratorio a
      LEFT JOIN parametros_seguridad ps ON ps.area_id = a.id
      WHERE a.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Área no encontrada' });
    res.json({ area: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo área' });
  }
});

// POST /api/areas (supervisor+)
router.post('/', authMiddleware, requireSupervisor, validateArea, handleValidationErrors, async (req, res) => {
  try {
    const { nombre, descripcion, tipo_area, imagen_url } = req.body;
    const result = await query(
      `INSERT INTO areas_laboratorio (nombre, descripcion, tipo_area, imagen_url)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre, descripcion, tipo_area, imagen_url]
    );
    // Crear parámetros por defecto
    await query(
      `INSERT INTO parametros_seguridad (area_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [result.rows[0].id]
    );
    res.status(201).json({ area: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'El nombre del área ya existe' });
    res.status(500).json({ error: 'Error creando área' });
  }
});

// PATCH /api/areas/:id (supervisor+)
router.patch('/:id', authMiddleware, requireSupervisor, validateId, handleValidationErrors, async (req, res) => {
  try {
    const { nombre, descripcion, tipo_area, imagen_url, activa } = req.body;
    const result = await query(
      `UPDATE areas_laboratorio
       SET nombre = COALESCE($1, nombre), descripcion = COALESCE($2, descripcion),
           tipo_area = COALESCE($3, tipo_area), imagen_url = COALESCE($4, imagen_url),
           activa = COALESCE($5, activa), updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [nombre, descripcion, tipo_area, imagen_url, activa, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Área no encontrada' });
    res.json({ area: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error actualizando área' });
  }
});

// DELETE /api/areas/:id (admin)
router.delete('/:id', authMiddleware, requireAdmin, validateId, handleValidationErrors, async (req, res) => {
  try {
    const result = await query('DELETE FROM areas_laboratorio WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Área no encontrada' });
    res.json({ message: 'Área eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error eliminando área' });
  }
});

// ============================================
// PARÁMETROS DE SEGURIDAD
// ============================================

// GET /api/areas/:id/parametros
router.get('/:id/parametros', authMiddleware, validateId, handleValidationErrors, async (req, res) => {
  try {
    const result = await query('SELECT * FROM parametros_seguridad WHERE area_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Parámetros no configurados' });
    res.json({ parametros: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo parámetros' });
  }
});

// PUT /api/areas/:id/parametros (supervisor+)
router.put('/:id/parametros', authMiddleware, requireSupervisor, validateId, validateParametros, handleValidationErrors, async (req, res) => {
  try {
    const p = req.body;
    const result = await query(
      `INSERT INTO parametros_seguridad (area_id, temp_min, temp_max, humedad_min, humedad_max, presion_min, presion_max,
         temp_critica_min, temp_critica_max, humedad_critica_min, humedad_critica_max, presion_critica_min, presion_critica_max,
         notificar_email, notificar_sistema)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (area_id) DO UPDATE SET
         temp_min = EXCLUDED.temp_min, temp_max = EXCLUDED.temp_max,
         humedad_min = EXCLUDED.humedad_min, humedad_max = EXCLUDED.humedad_max,
         presion_min = EXCLUDED.presion_min, presion_max = EXCLUDED.presion_max,
         temp_critica_min = EXCLUDED.temp_critica_min, temp_critica_max = EXCLUDED.temp_critica_max,
         humedad_critica_min = EXCLUDED.humedad_critica_min, humedad_critica_max = EXCLUDED.humedad_critica_max,
         presion_critica_min = EXCLUDED.presion_critica_min, presion_critica_max = EXCLUDED.presion_critica_max,
         notificar_email = EXCLUDED.notificar_email, notificar_sistema = EXCLUDED.notificar_sistema,
         updated_at = NOW()
       RETURNING *`,
      [req.params.id, p.temp_min, p.temp_max, p.humedad_min, p.humedad_max, p.presion_min, p.presion_max,
        p.temp_critica_min, p.temp_critica_max, p.humedad_critica_min, p.humedad_critica_max,
        p.presion_critica_min, p.presion_critica_max, p.notificar_email ?? true, p.notificar_sistema ?? true]
    );
    res.json({ parametros: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error guardando parámetros' });
  }
});

export default router;