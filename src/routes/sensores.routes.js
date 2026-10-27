// ============================================
// PHARMA MONITOR - RUTAS DE SENSORES / LECTURAS
// ============================================

import express from 'express';
import { query, transaction } from '../db/pool.js';
import { authMiddleware, requireSupervisor, requireAdmin } from '../middleware/auth.middleware.js';
import { validateLectura, validateId, validatePagination, validateDateRange, handleValidationErrors } from '../middleware/validation.middleware.js';

import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { evaluateAndNotifyReading, registerNodeHeartbeat, triggerNodeDisconnectAlert } from '../services/threshold.service.js';

const router = express.Router();

// POST /api/sensores/lectura - Recibir datos del Arduino ESP32 (con API Key o JWT)
router.post('/lectura', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.body.api_key || req.query.api_key;
    const expectedKey = process.env.ARDUINO_API_KEY || 'arduino_secret_key';
    const validKeys = new Set([expectedKey, 'arduino_secret_key', 'clave_secreta_para_autenticar_arduinos']);

    let isAuthorized = apiKey && validKeys.has(apiKey);

    // También permitir token JWT válido (para simulador desde la interfaz web)
    if (!isAuthorized && req.headers.authorization?.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        if (validKeys.has(token)) {
          isAuthorized = true;
        } else {
          jwt.verify(token, config.jwt.secret);
          isAuthorized = true;
        }
      } catch {
        isAuthorized = false;
      }
    }

    if (!isAuthorized) {
      return res.status(401).json({ error: 'API Key inválida' });
    }

    const {
      area_id: bodyAreaId,
      sensor_id = 'ARD-ESP32-01',
      temperatura,
      humedad,
      presion = 12.2,
      bateria_nivel = 100,
      senal_calidad = 95,
      firmware_version = 'v2.4.0-ESP32'
    } = req.body;

    if (temperatura === undefined || humedad === undefined) {
      return res.status(400).json({ error: 'temperatura y humedad son requeridas' });
    }

    let areaId = bodyAreaId || null;

    if (!areaId && sensor_id) {
      // 1. Buscar área por sensor_id exacto o insensible a acentos/mayúsculas
      const areaResult = await query(
        `SELECT id FROM areas_laboratorio
         WHERE activa = true AND UPPER(sensor_id) = UPPER($1)
         LIMIT 1`,
        [sensor_id]
      );

      if (areaResult.rows.length > 0) {
        areaId = areaResult.rows[0].id;
      } else {
        // 2. Buscar por nombre similar
        const cleanName = sensor_id.replace(/^ARD-/i, '').replace(/-\d+$/, '').replace(/-/g, ' ');
        const nameResult = await query(
          `SELECT id FROM areas_laboratorio
           WHERE activa = true AND nombre ILIKE $1
           LIMIT 1`,
          [`%${cleanName}%`]
        );
        if (nameResult.rows.length > 0) {
          areaId = nameResult.rows[0].id;
        } else {
          // 3. Buscar en lecturas recientes
          const recentResult = await query(
            `SELECT area_id FROM lecturas_sensores WHERE sensor_id = $1 ORDER BY fecha_hora DESC LIMIT 1`,
            [sensor_id]
          );
          if (recentResult.rows.length > 0) areaId = recentResult.rows[0].area_id;
        }
      }
    }

    // Fallback: primera área activa
    if (!areaId) {
      const firstArea = await query('SELECT id FROM areas_laboratorio WHERE activa = true ORDER BY nombre LIMIT 1');
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

    // Consultar parámetros para calcular estado inmediato
    const paramsRes = await query('SELECT * FROM parametros_seguridad WHERE area_id = $1', [areaId]);
    const ps = paramsRes.rows[0] || { temp_min: 18, temp_max: 25, humedad_min: 0, humedad_max: 65, presion_min: 10, presion_max: 15 };
    const t = parseFloat(lectura.temperatura);
    const h = parseFloat(lectura.humedad);
    const p = parseFloat(lectura.presion);
    const estado = (t < ps.temp_min || t > ps.temp_max || h > ps.humedad_max || h < (ps.humedad_min || 0) || p < ps.presion_min || p > ps.presion_max) ? 'bad' : 'ok';

    const enrichedLectura = { ...lectura, estado, nodo_desconectado: false, minutos_sin_reporte: 0 };

    // Emitir por WebSocket a todos los clientes y a la sala del área
    const io = req.app.get('io');
    await registerNodeHeartbeat(areaId, io);
    if (io) {
      io.emitLectura(areaId, enrichedLectura);
    }

    // Evaluar umbrales en tiempo real y disparar alerta/email si está fuera de rango
    const alertasGeneradas = await evaluateAndNotifyReading(areaId, lectura, io);

    res.status(201).json({
      success: true,
      lectura: enrichedLectura,
      alertas_generadas: alertasGeneradas.length,
      alertaGenerada: alertasGeneradas[0] || null,
      alertas: alertasGeneradas
    });
  } catch (error) {
    console.error('Error guardando lectura:', error);
    res.status(500).json({ error: 'Error guardando lectura' });
  }
});

// POST /api/sensores/watchdog/desconectar - Disparar / probar alerta Watchdog de Nodo Sin Conexión
router.post('/watchdog/desconectar', authMiddleware, requireSupervisor, async (req, res) => {
  try {
    const { area_id, minutos_sin_reporte } = req.body;
    let targetAreaId = area_id;
    if (!targetAreaId) {
      const firstArea = await query('SELECT id FROM areas_laboratorio WHERE activa = true ORDER BY nombre LIMIT 1');
      targetAreaId = firstArea.rows[0]?.id;
    }
    if (!targetAreaId) return res.status(400).json({ error: 'Área requerida' });

    const io = req.app.get('io');
    const result = await triggerNodeDisconnectAlert(targetAreaId, {
      minutosSinReporte: minutos_sin_reporte ?? 15,
      io,
      forzarEmail: true
    });

    if (!result) return res.status(404).json({ error: 'Área no encontrada' });

    res.json({
      ok: true,
      emailSent: result.emailSent,
      destinatarios: result.destinatarios,
      alerta: result.alerta,
      message: `Alerta Watchdog (Sin conexión) enviada a: ${result.destinatarios.join(', ')}`
    });
  } catch (err) {
    console.error('Error en watchdog/desconectar:', err);
    res.status(500).json({ error: 'Error procesando alerta Watchdog' });
  }
});

// POST /api/sensores/watchdog/reconectar - Reconectar nodo Arduino y resolver alerta Watchdog
router.post('/watchdog/reconectar', authMiddleware, requireSupervisor, async (req, res) => {
  try {
    const { area_id } = req.body;
    if (!area_id) return res.status(400).json({ error: 'area_id es requerido' });

    const io = req.app.get('io');
    await registerNodeHeartbeat(area_id, io);
    if (io) {
      io.emitLectura(area_id, { area_id, id: area_id, estado: 'ok', nodo_desconectado: false, minutos_sin_reporte: 0 });
    }
    res.json({ ok: true, message: 'Nodo Arduino reconectado y estado normalizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al reconectar nodo' });
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

    // Si no es admin y tiene área asignada, filtrar automáticamente solo por su área
    if (req.user.rol?.toLowerCase() !== 'admin' && req.user.area_id) {
      where += ` AND l.area_id = $${paramIdx++}`;
      params.push(req.user.area_id);
    } else if (area_id) {
      where += ` AND l.area_id = $${paramIdx++}`;
      params.push(area_id);
    }
    if (sensor_id) { where += ` AND l.sensor_id = $${paramIdx++}`; params.push(sensor_id); }
    if (fecha_desde) { where += ` AND l.fecha_hora >= $${paramIdx++}`; params.push(fecha_desde); }
    if (fecha_hasta) { where += ` AND l.fecha_hora <= $${paramIdx++}`; params.push(fecha_hasta); }

    // Validar sort
    const allowedSort = ['fecha_hora', 'temperatura', 'humedad', 'presion'];
    const sortField = allowedSort.includes(sort) ? sort : 'fecha_hora';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const dataQuery = `
      SELECT l.*,
             a.nombre as area_nombre,
             a.tipo_area,
             CASE
               WHEN l.temperatura < COALESCE(ps.temp_min, 18) OR l.temperatura > COALESCE(ps.temp_max, 25) THEN 'bad'
               WHEN l.humedad > COALESCE(ps.humedad_max, 65) OR l.humedad < COALESCE(ps.humedad_min, 0) THEN 'bad'
               WHEN l.presion < COALESCE(ps.presion_min, 10) OR l.presion > COALESCE(ps.presion_max, 15) THEN 'bad'
               ELSE 'ok'
             END as estado
      FROM lecturas_sensores l
      JOIN areas_laboratorio a ON a.id = l.area_id
      LEFT JOIN parametros_seguridad ps ON ps.area_id = l.area_id
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
    res.send('\uFEFF' + csv);
  } catch (error) {
    res.status(500).json({ error: 'Error exportando datos' });
  }
});

export default router;