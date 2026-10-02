// ============================================
// PHARMA MONITOR - RUTAS DE ALERTAS (COMPLETO)
// ============================================

import express from 'express';
import { query } from '../db/pool.js';
import { authMiddleware, requireSupervisor, requireAdmin } from '../middleware/auth.middleware.js';
import { validateId, validatePagination, validateDateRange, validateAlertaResolve, handleValidationErrors } from '../middleware/validation.middleware.js';

const router = express.Router();

// GET /api/alertas - Listar con filtros
router.get('/', authMiddleware, [...validatePagination, ...validateDateRange, handleValidationErrors], async (req, res) => {
  try {
    const { page = 1, limit = 50, area_id, tipo, severidad, resuelta, fecha_desde, fecha_hasta } = req.query;
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (area_id) { where += ` AND ah.area_id = $${paramIdx++}`; params.push(area_id); }
    if (tipo) { where += ` AND ah.tipo_alerta = $${paramIdx++}`; params.push(tipo); }
    if (severidad) { where += ` AND ah.severidad = $${paramIdx++}`; params.push(severidad); }
    if (resuelta !== undefined) { where += ` AND ah.resuelta = $${paramIdx++}`; params.push(resuelta === 'true'); }
    if (fecha_desde) { where += ` AND ah.created_at >= $${paramIdx++}`; params.push(fecha_desde); }
    if (fecha_hasta) { where += ` AND ah.created_at <= $${paramIdx++}`; params.push(fecha_hasta); }

    const dataQuery = `
      SELECT ah.*, a.nombre as area_nombre, a.tipo_area,
             u.nombre as resuelta_por_nombre
      FROM alertas_historial ah
      JOIN areas_laboratorio a ON a.id = ah.area_id
      LEFT JOIN usuarios u ON u.id = ah.resuelta_por
      ${where}
      ORDER BY
        CASE ah.severidad WHEN 'critica' THEN 1 WHEN 'advertencia' THEN 2 ELSE 3 END,
        ah.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx}
    `;
    params.push(parseInt(limit), offset);

    const countQuery = `SELECT COUNT(*) FROM alertas_historial ah ${where}`;

    const [dataResult, countResult] = await Promise.all([
      query(dataQuery, params),
      query(countQuery, params.slice(0, -2))
    ]);

    res.json({
      alertas: dataResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Error alertas:', error);
    res.status(500).json({ error: 'Error obteniendo alertas' });
  }
});

// GET /api/alertas/pendientes - Alertas no resueltas (para badge)
router.get('/pendientes', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM v_alertas_pendientes LIMIT 50');
    res.json({ alertas: result.rows, count: result.rows.length });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo alertas pendientes' });
  }
});

// ============================================
// ENDPOINTS PARA CONFIGURACIÓN DE CORREO
// ============================================

// GET /api/alertas/configuracion_sistema
router.get('/configuracion_sistema', authMiddleware, async (req, res) => {
  try {
    res.json([
      { clave: 'alert_email', valor: process.env.ALERT_EMAILS || '' }
    ]);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo configuración' });
  }
});

// POST /api/alertas/configuracion_sistema
router.post('/configuracion_sistema', authMiddleware, requireSupervisor, async (req, res) => {
  try {
    const { valor } = req.body;
    process.env.ALERT_EMAILS = valor;
    res.json({ success: true, message: 'Correo actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error guardando configuración' });
  }
});

// GET /api/alertas/:id
router.get('/:id', authMiddleware, validateId, handleValidationErrors, async (req, res) => {
  try {
    const result = await query(`
      SELECT ah.*, a.nombre as area_nombre, a.tipo_area,
             u.nombre as resuelta_por_nombre
      FROM alertas_historial ah
      JOIN areas_laboratorio a ON a.id = ah.area_id
      LEFT JOIN usuarios u ON u.id = ah.resuelta_por
      WHERE ah.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Alerta no encontrada' });
    res.json({ alerta: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo alerta' });
  }
});

// PATCH /api/alertas/:id/resolver - Marcar como resuelta
router.patch('/:id/resolver', authMiddleware, validateId, validateAlertaResolve, handleValidationErrors, async (req, res) => {
  try {
    const { notas_resolucion } = req.body;
    const result = await query(`
      UPDATE alertas_historial
      SET resuelta = true, resuelta_por = $1, resuelta_at = NOW(), notas_resolucion = $2
      WHERE id = $3
      RETURNING *
    `, [req.user.id, notas_resolucion, req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Alerta no encontrada' });

    // Emitir actualización por WebSocket
    const io = req.app.get('io');
    if (io) {
      io.emitAlert({ ...result.rows[0], resuelta: true });
    }

    res.json({ alerta: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error resolviendo alerta' });
  }
});

// POST /api/alertas/:id/reenviar-email - Reenviar notificación
router.post('/:id/reenviar-email', authMiddleware, requireSupervisor, validateId, handleValidationErrors, async (req, res) => {
  try {
    const alertaResult = await query(`
      SELECT ah.*, a.nombre as area_nombre
      FROM alertas_historial ah
      JOIN areas_laboratorio a ON a.id = ah.area_id
      WHERE ah.id = $1
    `, [req.params.id]);

    if (alertaResult.rows.length === 0) return res.status(404).json({ error: 'Alerta no encontrada' });

    const alerta = alertaResult.rows[0];
    const { sendAlertEmail } = await import('../utils/email.js');

    const emailResult = await sendAlertEmail({
      areaNombre: alerta.area_nombre,
      tipoAlerta: alerta.tipo_alerta,
      severidad: alerta.severidad,
      mensaje: alerta.mensaje,
      valorActual: alerta.valor_actual,
      valorMin: alerta.valor_esperado_min,
      valorMax: alerta.valor_esperado_max,
      fecha: alerta.created_at,
      destinatarios: process.env.ALERT_EMAILS?.split(',').map(e => e.trim()).filter(Boolean) || [],
    });

    if (emailResult.success) {
      await query('UPDATE alertas_historial SET email_enviado = true, email_enviado_at = NOW(), email_error = NULL WHERE id = $1', [req.params.id]);
    } else {
      await query('UPDATE alertas_historial SET email_error = $1 WHERE id = $2', [emailResult.error, req.params.id]);
    }

    res.json({ success: emailResult.success, messageId: emailResult.messageId, error: emailResult.error });
  } catch (error) {
    res.status(500).json({ error: 'Error reenviando email' });
  }
});

// DELETE /api/alertas/:id (admin)
router.delete('/:id', authMiddleware, requireAdmin, validateId, handleValidationErrors, async (req, res) => {
  try {
    const result = await query('DELETE FROM alertas_historial WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Alerta no encontrada' });
    res.json({ message: 'Alerta eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error eliminando alerta' });
  }
});

export default router;