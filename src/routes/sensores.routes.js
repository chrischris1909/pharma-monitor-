// ============================================
// PHARMA MONITOR - RUTAS DE SENSORES / LECTURAS
// ============================================

import express from 'express';
import { query, transaction } from '../db/pool.js';
import { authMiddleware, requireSupervisor, requireAdmin } from '../middleware/auth.middleware.js';
import { validateLectura, validateId, validatePagination, validateDateRange, handleValidationErrors } from '../middleware/validation.middleware.js';

const router = express.Router();

// POST /api/sensores/lectura - Recibir datos del Arduino (con API Key)
router.post('/lectura', async (req, res) => {
  try {
    // Verificar API Key (header o body)
    const apiKey = req.headers['x-api-key'] || req.body.api_key;
    const expectedKey = process.env.ARDUINO_API_KEY || 'arduino_secret_key';

    if (apiKey !== expectedKey) {
      return res.status(401).json({ error: 'API Key inválida' });
    }

    const { sensor_id, temperatura, humedad, presion, bateria_nivel, senal_calidad, firmware_version } = req.body;

    // Buscar área por sensor_id
    const areaResult = await query(
      `SELECT id FROM areas_laboratorio
       WHERE activa = true AND nombre ILIKE $1
       LIMIT 1`,
      [`%${sensor_id.replace('ARD-', '').replace('-01', '')}%`]
    );

    // Si no encuentra por nombre, buscar área que tenga este sensor_id en lecturas recientes
    let areaId = null;
    if (areaResult.rows.length > 0) {
      areaId = areaResult.rows[0].id;
    } else {
      const recentResult = await query(
        `SELECT DISTINCT area_id FROM lecturas_sensores WHERE sensor_id = $1 ORDER BY fecha_hora DESC LIMIT 1`,
        [sensor_id]
      );
      if (recentResult.rows.length > 0) areaId = recentResult.rows[0].area_id;
    }

    // Fallback: primera área activa
    if (!areaId) {
      const firstArea = await query('SELECT id FROM areas_laboratorio WHERE activa = true LIMIT 1');
      if (firstArea.rows.length > 0) areaId = firstArea.rows[0].id;
    }

    if (!areaId) {
      return res.status(400).json({ error: 'No hay áreas configuradas' });
    }

    // Insertar lectura
    const result = await query(
      `INSERT INTO lecturas_sensores (area_id, sensor_id, temperatura, humedad, presion, bateria_nivel, senal_calidad, firmware_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [areaId, sensor_id, temperatura, humedad, presion, bateria_nivel, senal_calidad, firmware_version]
    );

    const lectura = result.rows[0];

    // Emitir por WebSocket (se accede via app.get('io'))
    const io = req.app.get('io');
    if (io) {
      io.emitLectura(areaId, lectura);
    }

    res.status(201).json({ success: true, lectura });
  } catch (error) {
    console.error('Error guardando lectura:', error);
    res.status(500).json({ error: 'Error guardando lectura' });
  }
});

// GET /api/sensores/lecturas - Historial con filtros
router.get('/lecturas', authMiddleware, [...validatePagination, ...validateDateRange, handleValidationErrors], async (req, res) => {
  try {
    const { page = 1, limit = 50, area_id, sensor_id, fecha_desde, fecha_hasta, sort = 'fecha_hora', order = 'desc' } = req.query;
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (area_id) { where += ` AND l.area_id = $${paramIdx++}`; params.push(area_id); }
    if (sensor_id) { where += ` AND l.sensor_id = $${paramIdx++}`; params.push(sensor_id); }
    if (fecha_desde) { where += ` AND l.fecha_hora >= $${paramIdx++}`; params.push(fecha_desde); }
    if (fecha_hasta) { where += ` AND l.fecha_hora <= $${paramIdx++}`; params.push(fecha_hasta); }

    // Validar sort
    const allowedSort = ['fecha_hora', 'temperatura', 'humedad', 'presion'];
    const sortField = allowedSort.includes(sort) ? sort : 'fecha_hora';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const dataQuery = `
      SELECT l.*, a.nombre as area_nombre, a.tipo_area
      FROM lecturas_sensores l
      JOIN areas_laboratorio a ON a.id = l.area_id
      ${where}
      ORDER BY l.${sortField} ${sortOrder}
      LIMIT $${paramIdx++} OFFSET $${paramIdx}
    `;
    params.push(parseInt(limit), offset);

    const countQuery = `
      SELECT COUNT(*) FROM lecturas_sensores l ${where}
    `;

    const [dataResult, countResult] = await Promise.all([
      query(dataQuery, params),
      query(countQuery, params.slice(0, -2))
    ]);

    res.json({
      lecturas: dataResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Error lecturas:', error);
    res.status(500).json({ error: 'Error obteniendo lecturas' });
  }
});

// GET /api/sensores/lecturas/latest - Última por área
router.get('/lecturas/latest', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM v_ultima_lectura_area');
    res.json({ lecturas: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo últimas lecturas' });
  }
});

// GET /api/sensores/lecturas/stats - Estadísticas para gráficas
router.get('/lecturas/stats', authMiddleware, [...validateDateRange, handleValidationErrors], async (req, res) => {
  try {
    const { area_id, fecha_desde, fecha_hasta, intervalo = 'hour' } = req.query;

    let where = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (area_id) { where += ` AND area_id = $${paramIdx++}`; params.push(area_id); }
    if (fecha_desde) { where += ` AND fecha_hora >= $${paramIdx++}`; params.push(fecha_desde); }
    if (fecha_hasta) { where += ` AND fecha_hora <= $${paramIdx++}`; params.push(fecha_hasta); }

    // Time bucket para TimescaleDB o date_trunc para PostgreSQL normal
    const bucket = intervalo === 'minute' ? '1 minute' : intervalo === 'hour' ? '1 hour' : '1 day';

    const result = await query(`
      SELECT
        time_bucket('${bucket}', fecha_hora) AS bucket,
        AVG(temperatura)::numeric(10,2) as temp_promedio,
        MIN(temperatura)::numeric(10,2) as temp_min,
        MAX(temperatura)::numeric(10,2) as temp_max,
        AVG(humedad)::numeric(10,2) as hum_promedio,
        MIN(humedad)::numeric(10,2) as hum_min,
        MAX(humedad)::numeric(10,2) as hum_max,
        AVG(presion)::numeric(10,2) as pres_promedio,
        MIN(presion)::numeric(10,2) as pres_min,
        MAX(presion)::numeric(10,2) as pres_max,
        COUNT(*) as lecturas_count
      FROM lecturas_sensores
      ${where}
      GROUP BY bucket
      ORDER BY bucket ASC
    `, params);

    res.json({ stats: result.rows });
  } catch (error) {
    // Fallback sin time_bucket
    try {
      const result = await query(`
        SELECT
          date_trunc('${intervalo}', fecha_hora) AS bucket,
          AVG(temperatura)::numeric(10,2) as temp_promedio,
          MIN(temperatura)::numeric(10,2) as temp_min,
          MAX(temperatura)::numeric(10,2) as temp_max,
          AVG(humedad)::numeric(10,2) as hum_promedio,
          MIN(humedad)::numeric(10,2) as hum_min,
          MAX(humedad)::numeric(10,2) as hum_max,
          AVG(presion)::numeric(10,2) as pres_promedio,
          MIN(presion)::numeric(10,2) as pres_min,
          MAX(presion)::numeric(10,2) as pres_max,
          COUNT(*) as lecturas_count
        FROM lecturas_sensores
        ${where}
        GROUP BY bucket
        ORDER BY bucket ASC
      `, params);
      res.json({ stats: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Error calculando estadísticas' });
    }
  }
});

// GET /api/sensores/lecturas/export - Exportar CSV
router.get('/lecturas/export', authMiddleware, [...validateDateRange, handleValidationErrors], async (req, res) => {
  try {
    const { area_id, fecha_desde, fecha_hasta } = req.query;

    let where = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (area_id) { where += ` AND l.area_id = $${paramIdx++}`; params.push(area_id); }
    if (fecha_desde) { where += ` AND l.fecha_hora >= $${paramIdx++}`; params.push(fecha_desde); }
    if (fecha_hasta) { where += ` AND l.fecha_hora <= $${paramIdx++}`; params.push(fecha_hasta); }

    const result = await query(`
      SELECT
        l.fecha_hora AT TIME ZONE 'America/Bogota' as fecha_hora,
        a.nombre as area,
        l.sensor_id,
        l.temperatura,
        l.humedad,
        l.presion,
        l.bateria_nivel,
        l.senal_calidad
      FROM lecturas_sensores l
      JOIN areas_laboratorio a ON a.id = l.area_id
      ${where}
      ORDER BY l.fecha_hora DESC
      LIMIT 50000
    `, params);

    // Generar CSV
    const headers = ['Fecha/Hora', 'Área', 'Sensor ID', 'Temperatura (°C)', 'Humedad (%)', 'Presión (Pa)', 'Batería (%)', 'Señal (%)'];
    const rows = result.rows.map(r => [
      r.fecha_hora,
      r.area,
      r.sensor_id,
      r.temperatura,
      r.humedad,
      r.presion,
      r.bateria_nivel,
      r.senal_calidad
    ]);

    const csv = [headers.join(',')].concat(rows.map(r => r.join(','))).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lecturas_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('\uFEFF' + csv); // BOM para Excel
  } catch (error) {
    res.status(500).json({ error: 'Error exportando datos' });
  }
});

export default router;