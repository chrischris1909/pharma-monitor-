// ============================================
// PHARMA MONITOR - RUTAS DE REPORTES Y EXPORTACIÓN
// ============================================

import express from 'express';
import { query } from '../db/pool.js';
import { authMiddleware, requireSupervisor } from '../middleware/auth.middleware.js';
import { validateReporte, validateId, validateDateRange, handleValidationErrors } from '../middleware/validation.middleware.js';
import { generateReportPDF } from '../utils/pdf.js';

const router = express.Router();

// GET /api/reportes/resumen - Resumen para dashboard
router.get('/resumen', authMiddleware, async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta } = req.query;

    let where = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (fecha_desde) { where += ` AND l.fecha_hora >= $${paramIdx++}`; params.push(fecha_desde); }
    if (fecha_hasta) { where += ` AND l.fecha_hora <= $${paramIdx++}`; params.push(fecha_hasta); }

    const result = await query(`
      SELECT
        a.id, a.nombre, a.tipo_area, a.imagen_url,
        COUNT(l.id) as total_lecturas,
        AVG(l.temperatura)::numeric(10,2) as temp_promedio,
        MIN(l.temperatura)::numeric(10,2) as temp_min,
        MAX(l.temperatura)::numeric(10,2) as temp_max,
        AVG(l.humedad)::numeric(10,2) as hum_promedio,
        MIN(l.humedad)::numeric(10,2) as hum_min,
        MAX(l.humedad)::numeric(10,2) as hum_max,
        AVG(l.presion)::numeric(10,2) as pres_promedio,
        MIN(l.presion)::numeric(10,2) as pres_min,
        MAX(l.presion)::numeric(10,2) as pres_max,
        COUNT(CASE WHEN ah.id IS NOT NULL THEN 1 END) as alertas_count
      FROM areas_laboratorio a
      LEFT JOIN lecturas_sensores l ON l.area_id = a.id ${where.replace('WHERE', 'AND')}
      LEFT JOIN alertas_historial ah ON ah.area_id = a.id AND ah.created_at >= COALESCE($1, NOW() - INTERVAL '24 hours')
      WHERE a.activa = true
      GROUP BY a.id, a.nombre, a.tipo_area, a.imagen_url
      ORDER BY a.nombre
    `, params);

    const latestResult = await query('SELECT * FROM v_ultima_lectura_area');

    const areas = result.rows.map(area => {
      const latest = latestResult.rows.find(l => l.area_id === area.id);
      return { ...area, ultima_lectura: latest };
    });

    res.json({ resumen: areas });
  } catch (error) {
    console.error('Error resumen:', error);
    res.status(500).json({ error: 'Error generando resumen' });
  }
});

// GET /api/reportes/area/:id - Reporte detallado de un área
router.get('/area/:id', authMiddleware, validateId, [...validateDateRange, handleValidationErrors], async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta } = req.query;

    const [areaResult, lecturasResult, alertasResult, statsResult] = await Promise.all([
      query('SELECT * FROM areas_laboratorio WHERE id = $1', [req.params.id]),
      query(`
        SELECT * FROM lecturas_sensores
        WHERE area_id = $1 AND fecha_hora BETWEEN $2 AND $3
        ORDER BY fecha_hora DESC LIMIT 1000
      `, [req.params.id, fecha_desde, fecha_hasta]),
      query(`
        SELECT * FROM alertas_historial
        WHERE area_id = $1 AND created_at BETWEEN $2 AND $3
        ORDER BY created_at DESC
      `, [req.params.id, fecha_desde, fecha_hasta]),
      query(`
        SELECT
          date_trunc('hour', fecha_hora) as hora,
          AVG(temperatura)::numeric(10,2) as temp_avg,
          MIN(temperatura)::numeric(10,2) as temp_min,
          MAX(temperatura)::numeric(10,2) as temp_max,
          AVG(humedad)::numeric(10,2) as hum_avg,
          MIN(humedad)::numeric(10,2) as hum_min,
          MAX(humedad)::numeric(10,2) as hum_max,
          AVG(presion)::numeric(10,2) as pres_avg,
          MIN(presion)::numeric(10,2) as pres_min,
          MAX(presion)::numeric(10,2) as pres_max,
          COUNT(*) as count
        FROM lecturas_sensores
        WHERE area_id = $1 AND fecha_hora BETWEEN $2 AND $3
        GROUP BY hora
        ORDER BY hora ASC
      `, [req.params.id, fecha_desde, fecha_hasta]),
    ]);

    if (areaResult.rows.length === 0) return res.status(404).json({ error: 'Área no encontrada' });

    const paramsResult = await query('SELECT * FROM parametros_seguridad WHERE area_id = $1', [req.params.id]);

    res.json({
      area: areaResult.rows[0],
      parametros: paramsResult.rows[0],
      lecturas: lecturasResult.rows,
      alertas: alertasResult.rows,
      estadisticas: statsResult.rows,
    });
  } catch (error) {
    console.error('Error reporte área:', error);
    res.status(500).json({ error: 'Error generando reporte de área' });
  }
});

// GET /api/reportes/pdf - Generar PDF
router.get('/pdf', authMiddleware, validateReporte, handleValidationErrors, async (req, res) => {
  try {
    const { area_id, fecha_desde, fecha_hasta } = req.query;

    let areasQuery = `
      SELECT a.*, ps.temp_min, ps.temp_max, ps.humedad_min, ps.humedad_max, ps.presion_min, ps.presion_max
      FROM areas_laboratorio a
      LEFT JOIN parametros_seguridad ps ON ps.area_id = a.id
      WHERE a.activa = true
    `;
    const params = [];
    if (area_id) {
      areasQuery += ' AND a.id = $1';
      params.push(area_id);
    }
    areasQuery += ' ORDER BY a.nombre';

    const areasResult = await query(areasQuery, params);

    const areas = [];
    for (const area of areasResult.rows) {
      const [lecturasResult, alertasResult] = await Promise.all([
        query(`
          SELECT
            AVG(temperatura)::numeric(10,2) as temp_promedio,
            MIN(temperatura)::numeric(10,2) as temp_min,
            MAX(temperatura)::numeric(10,2) as temp_max,
            AVG(humedad)::numeric(10,2) as hum_promedio,
            MIN(humedad)::numeric(10,2) as hum_min,
            MAX(humedad)::numeric(10,2) as hum_max,
            AVG(presion)::numeric(10,2) as pres_promedio,
            MIN(presion)::numeric(10,2) as pres_min,
            MAX(presion)::numeric(10,2) as pres_max,
            (SELECT temperatura FROM lecturas_sensores WHERE area_id = a.id ORDER BY fecha_hora DESC LIMIT 1) as ultima_temperatura,
            (SELECT humedad FROM lecturas_sensores WHERE area_id = a.id ORDER BY fecha_hora DESC LIMIT 1) as ultima_humedad,
            (SELECT presion FROM lecturas_sensores WHERE area_id = a.id ORDER BY fecha_hora DESC LIMIT 1) as ultima_presion
          FROM lecturas_sensores
          WHERE area_id = $1 AND fecha_hora BETWEEN $2 AND $3
        `, [area.id, fecha_desde, fecha_hasta]),
        query(`
          SELECT * FROM alertas_historial
          WHERE area_id = $1 AND created_at BETWEEN $2 AND $3
          ORDER BY created_at DESC LIMIT 10
        `, [area.id, fecha_desde, fecha_hasta]),
      ]);

      const lecturas = lecturasResult.rows[0] || {};
      const alertas = alertasResult.rows;

      let estado = 'sin_datos';
      if (lecturas.ultima_temperatura !== null) {
        const temp = parseFloat(lecturas.ultima_temperatura);
        const hum = parseFloat(lecturas.ultima_humedad || 0);
        const pres = parseFloat(lecturas.ultima_presion || 0);
        const p = area;

        const tempCritica = p.temp_critica_min && (temp < p.temp_critica_min || temp > (p.temp_critica_max || p.temp_max));
        const humCritica = p.humedad_critica_min && (hum < p.humedad_critica_min || hum > (p.humedad_critica_max || p.humedad_max));
        const presCritica = p.presion_critica_min && (pres < p.presion_critica_min || pres > (p.presion_critica_max || p.presion_max));

        if (tempCritica || humCritica || presCritica) estado = 'critica';
        else if (temp < p.temp_min || temp > p.temp_max || hum < p.humedad_min || hum > p.humedad_max || pres < p.presion_min || pres > p.presion_max) estado = 'irregular';
        else estado = 'estable';
      }

      areas.push({
        ...area,
        ...lecturas,
        alertasRecientes: alertas,
        alertasCount: alertas.length,
        estadoGeneral: estado,
        tempEstado: lecturas.ultima_temperatura !== null && (parseFloat(lecturas.ultima_temperatura) < area.temp_min || parseFloat(lecturas.ultima_temperatura) > area.temp_max) ? 'irregular' : 'estable',
        humEstado: lecturas.ultima_humedad !== null && (parseFloat(lecturas.ultima_humedad) < area.humedad_min || parseFloat(lecturas.ultima_humedad) > area.humedad_max) ? 'irregular' : 'estable',
        presEstado: lecturas.ultima_presion !== null && (parseFloat(lecturas.ultima_presion) < area.presion_min || parseFloat(lecturas.ultima_presion) > area.presion_max) ? 'irregular' : 'estable',
      });
    }

    const pdfBuffer = await generateReportPDF({ areas, fechaDesde: fecha_desde, fechaHasta: fecha_hasta });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_${fecha_desde}_${fecha_hasta}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error PDF:', error);
    res.status(500).json({ error: 'Error generando PDF' });
  }
});

// GET /api/reportes/dashboard-data - Datos completos para frontend dashboard
router.get('/dashboard-data', authMiddleware, async (req, res) => {
  try {
    const [areasResult, alertasResult, configResult] = await Promise.all([
      query('SELECT * FROM v_estado_areas'),
      query('SELECT * FROM v_alertas_pendientes LIMIT 10'),
      query('SELECT * FROM configuracion_sistema'),
    ]);

    const config = Object.fromEntries(configResult.rows.map(r => [r.clave, r.valor]));

    res.json({
      areas: areasResult.rows,
      alertasPendientes: alertasResult.rows,
      config,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo datos del dashboard' });
  }
});

export default router;