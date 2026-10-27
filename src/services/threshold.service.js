// ============================================
// PHARMA MONITOR - SERVICIO DE UMBRALES Y ALERTAS
// Cron job que evalúa lecturas y genera alertas + emails
// ============================================

import cron from 'node-cron';
import { query, transaction } from '../db/pool.js';
import { config } from '../config/index.js';
import { sendAlertEmail, getRecipientsForArea } from '../utils/email.js';

let checkInterval = null;
let watchdogInterval = null;

// Mapa en memoria de latidos activos de nodos Arduino ESP32 (areaId -> timestamp ms)
const activeNodesLastSeen = new Map();

export function startThresholdChecker(io) {
  const intervalMin = parseInt(process.env.ALERTAS_CHECK_INTERVAL_MINUTOS) || 5;

  console.log(`⏰ Iniciando checker de umbrales cada ${intervalMin} minutos y Watchdog ESP32 cada 1 minuto`);

  // Ejecutar inmediatamente al arrancar
  checkThresholds(io);

  // Programar cron job de umbrales ambientales
  checkInterval = cron.schedule(`*/${intervalMin} * * * *`, () => {
    checkThresholds(io);
  });

  // Programar Watchdog de desconexión de nodos cada 1 minuto
  watchdogInterval = cron.schedule('* * * * *', () => {
    checkDisconnectedNodes(io);
  });

  return checkInterval;
}

export function stopThresholdChecker() {
  if (checkInterval) {
    checkInterval.stop();
    checkInterval = null;
  }
  if (watchdogInterval) {
    watchdogInterval.stop();
    watchdogInterval = null;
  }
  console.log('⏹️ Checker de umbrales y Watchdog detenidos');
}

// Registrar latido (Heartbeat) cuando el Arduino ESP32 envía una lectura
export async function registerNodeHeartbeat(areaId, io) {
  if (!areaId) return;
  activeNodesLastSeen.set(String(areaId), Date.now());

  try {
    // Si había una alerta activa de desconexión para esta sala, resolverla automáticamente
    const resolved = await query(`
      UPDATE alertas_historial
      SET resuelta = true,
          resuelta_at = NOW(),
          notas_resolucion = 'Nodo Arduino ESP32 reconectado automáticamente (Heartbeat recibido)'
      WHERE area_id = $1 AND tipo_alerta = 'desconexion_nodo' AND resuelta = false
      RETURNING *
    `, [areaId]);

    if (resolved.rows.length > 0 && io) {
      for (const r of resolved.rows) {
        io.emitAlert({ ...r, resuelta: true });
      }
    }
  } catch (err) {
    console.error('Error al auto-resolver alerta Watchdog:', err.message);
  }
}

// Disparar alerta técnica de Nodo Arduino Sin Conexión (por Watchdog automático o prueba)
export async function triggerNodeDisconnectAlert(areaId, { minutosSinReporte = null, io = null, forzarEmail = false } = {}) {
  try {
    const areaRes = await query(
      `SELECT a.id, a.nombre, a.sensor_id, a.tipo_area,
              ROUND(CAST(EXTRACT(EPOCH FROM (NOW() - MAX(l.fecha_hora))) / 60.0 AS numeric), 1) as min_desde_lectura
       FROM areas_laboratorio a
       LEFT JOIN lecturas_sensores l ON l.area_id = a.id
       WHERE a.id = $1
       GROUP BY a.id, a.nombre, a.sensor_id, a.tipo_area`,
      [areaId]
    );

    if (areaRes.rows.length === 0) return null;
    const area = areaRes.rows[0];

    const cfgRes = await query("SELECT valor FROM configuracion_sistema WHERE clave = 'watchdog_timeout_minutos' LIMIT 1").catch(() => ({ rows: [] }));
    const timeoutMin = parseFloat(cfgRes.rows[0]?.valor) || 10;
    const elapsedMin = minutosSinReporte !== null
      ? Number(minutosSinReporte)
      : (area.min_desde_lectura !== null ? Math.max(Number(area.min_desde_lectura), timeoutMin + 1) : timeoutMin + 2);

    const sensorId = area.sensor_id || 'ARD-ESP32';
    const mensaje = `🔌 Watchdog ESP32: El nodo Arduino (${sensorId}) en ${area.nombre} dejó de reportar datos durante ${elapsedMin} min (límite: ${timeoutMin} min). Verifique alimentación eléctrica o señal Wi-Fi en planta.`;

    // Verificar si ya existe una alerta de desconexión sin resolver para esta área
    const existing = await query(`
      SELECT * FROM alertas_historial
      WHERE area_id = $1 AND tipo_alerta = 'desconexion_nodo' AND resuelta = false
      ORDER BY created_at DESC LIMIT 1
    `, [area.id]);

    const destinatarios = await getRecipientsForArea(area.id);
    let alertaGuardada;

    if (existing.rows.length > 0 && !forzarEmail) {
      const upd = await query(`
        UPDATE alertas_historial
        SET valor_actual = $1, mensaje = $2
        WHERE id = $3
        RETURNING *
      `, [elapsedMin, mensaje, existing.rows[0].id]);
      alertaGuardada = { ...upd.rows[0], area_nombre: area.nombre, sensor_id: sensorId };
      if (io) {
        io.emitLectura(area.id, { area_id: area.id, id: area.id, estado: 'offline', nodo_desconectado: true });
      }
      return { alerta: alertaGuardada, destinatarios, emailSent: false, alreadyActive: true };
    }

    // Si existía pero se forzó re-notificación, actualizar o insertar
    if (existing.rows.length > 0 && forzarEmail) {
      const upd = await query(`
        UPDATE alertas_historial
        SET valor_actual = $1, mensaje = $2, email_destinatarios = $3, created_at = NOW()
        WHERE id = $4
        RETURNING *
      `, [elapsedMin, mensaje, destinatarios, existing.rows[0].id]);
      alertaGuardada = upd.rows[0];
    } else {
      const ins = await query(`
        INSERT INTO alertas_historial (
          area_id, tipo_alerta, severidad, mensaje,
          valor_actual, valor_esperado_min, valor_esperado_max,
          resuelta, email_destinatarios
        )
        VALUES ($1, 'desconexion_nodo', 'critica', $2, $3, 0, $4, false, $5)
        RETURNING *
      `, [area.id, mensaje, elapsedMin, timeoutMin, destinatarios]);
      alertaGuardada = ins.rows[0];
    }

    const enriched = { ...alertaGuardada, area_nombre: area.nombre, tipo_area: area.tipo_area, sensor_id: sensorId };

    let emailSent = false;
    if (destinatarios.length > 0) {
      const emailRes = await sendAlertEmail({
        areaNombre: area.nombre,
        tipoAlerta: 'desconexion_nodo',
        severidad: 'critica',
        mensaje,
        valorActual: elapsedMin,
        valorMin: 0,
        valorMax: timeoutMin,
        sensorId,
        fecha: new Date().toISOString(),
        destinatarios,
      });
      emailSent = Boolean(emailRes.success);
      if (emailSent) {
        await query('UPDATE alertas_historial SET email_enviado = true, email_enviado_at = NOW() WHERE id = $1', [alertaGuardada.id]);
      }
    }

    if (io) {
      io.emitAlert(enriched);
      io.emitLectura(area.id, { area_id: area.id, id: area.id, estado: 'offline', nodo_desconectado: true });
    }

    return { alerta: enriched, destinatarios, emailSent, alreadyActive: false };
  } catch (err) {
    console.error('❌ Error en triggerNodeDisconnectAlert:', err);
    throw err;
  }
}

// Watchdog periódico que revisa si algún nodo activo dejó de reportar por más de X minutos
export async function checkDisconnectedNodes(io) {
  try {
    const cfgRes = await query(
      "SELECT clave, valor FROM configuracion_sistema WHERE clave IN ('watchdog_timeout_minutos', 'watchdog_modo_estricto')"
    ).catch(() => ({ rows: [] }));
    const cfg = Object.fromEntries(cfgRes.rows.map(r => [r.clave, r.valor]));
    const timeoutMin = parseFloat(cfg.watchdog_timeout_minutos) || 10;
    const modoEstricto = String(cfg.watchdog_modo_estricto || 'false').toLowerCase() === 'true';

    // 1. Revisar nodos que han enviado latidos en esta sesión y dejaron de responder
    const now = Date.now();
    for (const [areaId, lastSeenMs] of activeNodesLastSeen.entries()) {
      const diffMin = Number(((now - lastSeenMs) / 60000).toFixed(1));
      if (diffMin >= timeoutMin) {
        activeNodesLastSeen.delete(areaId);
        await triggerNodeDisconnectAlert(areaId, { minutosSinReporte: diffMin, io, forzarEmail: false });
      }
    }

    // 2. Si el modo estricto está activo (ej. en producción con todos los ESP32 encendidos), revisar todas las áreas por BD
    if (modoEstricto) {
      const staleAreas = await query(`
        SELECT a.id,
               ROUND(CAST(EXTRACT(EPOCH FROM (NOW() - MAX(l.fecha_hora))) / 60.0 AS numeric), 1) as min_sin_datos
        FROM areas_laboratorio a
        LEFT JOIN lecturas_sensores l ON l.area_id = a.id
        WHERE a.activa = true
        GROUP BY a.id
        HAVING MAX(l.fecha_hora) < NOW() - ($1 || ' minutes')::interval
      `, [String(timeoutMin)]);

      for (const row of staleAreas.rows) {
        await triggerNodeDisconnectAlert(row.id, { minutosSinReporte: row.min_sin_datos, io, forzarEmail: false });
      }
    }
  } catch (err) {
    console.error('Error en Watchdog checkDisconnectedNodes:', err.message);
  }
}

async function checkThresholds(io) {
  console.log('🔍 Verificando umbrales...');

  try {
    // Obtener áreas con parámetros y última lectura
    const result = await query(`
      SELECT
        a.id as area_id, a.nombre, a.tipo_area,
        ps.temp_min, ps.temp_max, ps.humedad_min, ps.humedad_max, ps.presion_min, ps.presion_max,
        ps.temp_critica_min, ps.temp_critica_max,
        ps.humedad_critica_min, ps.humedad_critica_max,
        ps.presion_critica_min, ps.presion_critica_max,
        ps.notificar_email,
        l.temperatura, l.humedad, l.presion, l.fecha_hora
      FROM areas_laboratorio a
      JOIN parametros_seguridad ps ON ps.area_id = a.id
      LEFT JOIN LATERAL (
        SELECT temperatura, humedad, presion, fecha_hora
        FROM lecturas_sensores
        WHERE area_id = a.id
          AND fecha_hora > NOW() - INTERVAL '5 minutes'
        ORDER BY fecha_hora DESC
        LIMIT 1
      ) l ON true
      WHERE a.activa = true
    `);

    let alertasGeneradas = 0;

    for (const area of result.rows) {
      if (area.temperatura === null && area.humedad === null && area.presion === null) continue; // Sin datos

      const alertas = evaluateArea(area);
      if (alertas.length === 0) continue;

      const destinatarios = await getRecipientsForArea(area.area_id);

      for (const alerta of alertas) {
        const saved = await saveAlerta(area, alerta, destinatarios);
        if (saved) {
          alertasGeneradas++;
          const enrichedAlert = { ...saved, area_nombre: area.nombre, tipo_area: area.tipo_area };
          // Emitir por WebSocket
          if (io) {
            io.emitAlert(enrichedAlert);
          }
          // Enviar email segmentado por área (Gerente General + Encargados del área)
          if (destinatarios && destinatarios.length > 0 && area.notificar_email !== false) {
            const emailRes = await sendAlertEmail({
              areaNombre: area.nombre,
              tipoAlerta: alerta.tipo,
              severidad: alerta.severidad,
              mensaje: alerta.mensaje,
              valorActual: alerta.valor,
              valorMin: alerta.min,
              valorMax: alerta.max,
              fecha: area.fecha_hora || new Date().toISOString(),
              destinatarios,
            });
            if (emailRes.success) {
              await query('UPDATE alertas_historial SET email_enviado = true, email_enviado_at = NOW() WHERE id = $1', [saved.id]);
            }
          }
        }
      }
    }

    if (alertasGeneradas > 0) {
      console.log(`🚨 ${alertasGeneradas} alerta(s) generada(s)`);
    }

  } catch (error) {
    console.error('❌ Error en checker de umbrales:', error);
  }
}

// Evaluar inmediatamente una lectura recién recibida del Arduino ESP32
export async function evaluateAndNotifyReading(areaId, lectura, io) {
  try {
    const areaRes = await query(`
      SELECT
        a.id as area_id, a.nombre, a.tipo_area,
        COALESCE(ps.temp_min, 18) as temp_min,
        COALESCE(ps.temp_max, 25) as temp_max,
        COALESCE(ps.humedad_min, 0) as humedad_min,
        COALESCE(ps.humedad_max, 65) as humedad_max,
        COALESCE(ps.presion_min, 10) as presion_min,
        COALESCE(ps.presion_max, 15) as presion_max,
        ps.temp_critica_min, ps.temp_critica_max,
        ps.humedad_critica_min, ps.humedad_critica_max,
        ps.presion_critica_min, ps.presion_critica_max,
        COALESCE(ps.notificar_email, true) as notificar_email
      FROM areas_laboratorio a
      LEFT JOIN parametros_seguridad ps ON ps.area_id = a.id
      WHERE a.id = $1
    `, [areaId]);

    if (areaRes.rows.length === 0) return [];

    const area = {
      ...areaRes.rows[0],
      temperatura: lectura.temperatura,
      humedad: lectura.humedad,
      presion: lectura.presion,
      fecha_hora: lectura.fecha_hora || new Date().toISOString()
    };

    const alertas = evaluateArea(area);
    if (alertas.length === 0) return [];

    const destinatarios = await getRecipientsForArea(area.area_id);
    const generadas = [];

    for (const alerta of alertas) {
      const saved = await saveAlerta(area, alerta, destinatarios, lectura.id);
      if (saved) {
        const enrichedAlert = { ...saved, area_nombre: area.nombre, tipo_area: area.tipo_area };
        generadas.push(enrichedAlert);
        if (io) {
          io.emitAlert(enrichedAlert);
        }
        if (destinatarios && destinatarios.length > 0 && area.notificar_email !== false) {
          sendAlertEmail({
            areaNombre: area.nombre,
            tipoAlerta: alerta.tipo,
            severidad: alerta.severidad,
            mensaje: alerta.mensaje,
            valorActual: alerta.valor,
            valorMin: alerta.min,
            valorMax: alerta.max,
            fecha: area.fecha_hora,
            destinatarios,
          }).then(async (emailRes) => {
            if (emailRes.success) {
              await query('UPDATE alertas_historial SET email_enviado = true, email_enviado_at = NOW() WHERE id = $1', [saved.id]);
            }
          }).catch(err => console.error('Error enviando correo en tiempo real:', err));
        }
      }
    }

    return generadas;
  } catch (err) {
    console.error('Error evaluando lectura en tiempo real:', err);
    return [];
  }
}

export function evaluateArea(area) {
  const alertas = [];

  // Temperatura
  if (area.temperatura !== null && area.temperatura !== undefined) {
    const temp = parseFloat(area.temperatura);
    if (area.temp_critica_min !== null && area.temp_critica_min !== undefined && temp < area.temp_critica_min) {
      alertas.push({ tipo: 'temperatura', severidad: 'critica', mensaje: `Temperatura CRÍTICA por debajo de ${area.temp_critica_min}°C (${temp}°C)`, valor: temp, min: area.temp_critica_min, max: area.temp_max });
    } else if (area.temp_critica_max !== null && area.temp_critica_max !== undefined && temp > area.temp_critica_max) {
      alertas.push({ tipo: 'temperatura', severidad: 'critica', mensaje: `Temperatura CRÍTICA por encima de ${area.temp_critica_max}°C (${temp}°C)`, valor: temp, min: area.temp_min, max: area.temp_critica_max });
    } else if (temp < area.temp_min) {
      alertas.push({ tipo: 'temperatura', severidad: 'advertencia', mensaje: `Temperatura por debajo del mínimo (${temp}°C < ${area.temp_min}°C)`, valor: temp, min: area.temp_min, max: area.temp_max });
    } else if (temp > area.temp_max) {
      alertas.push({ tipo: 'temperatura', severidad: 'advertencia', mensaje: `Temperatura por encima del máximo (${temp}°C > ${area.temp_max}°C)`, valor: temp, min: area.temp_min, max: area.temp_max });
    }
  }

  // Humedad
  if (area.humedad !== null && area.humedad !== undefined) {
    const hum = parseFloat(area.humedad);
    if (area.humedad_critica_min !== null && area.humedad_critica_min !== undefined && hum < area.humedad_critica_min) {
      alertas.push({ tipo: 'humedad', severidad: 'critica', mensaje: `Humedad CRÍTICA por debajo de ${area.humedad_critica_min}% (${hum}%)`, valor: hum, min: area.humedad_critica_min, max: area.humedad_max });
    } else if (area.humedad_critica_max !== null && area.humedad_critica_max !== undefined && hum > area.humedad_critica_max) {
      alertas.push({ tipo: 'humedad', severidad: 'critica', mensaje: `Humedad CRÍTICA por encima de ${area.humedad_critica_max}% (${hum}%)`, valor: hum, min: area.humedad_min, max: area.humedad_critica_max });
    } else if (hum < area.humedad_min) {
      alertas.push({ tipo: 'humedad', severidad: 'advertencia', mensaje: `Humedad por debajo del mínimo (${hum}% < ${area.humedad_min}%)`, valor: hum, min: area.humedad_min, max: area.humedad_max });
    } else if (hum > area.humedad_max) {
      alertas.push({ tipo: 'humedad', severidad: 'advertencia', mensaje: `Humedad por encima del máximo (${hum}% > ${area.humedad_max}%)`, valor: hum, min: area.humedad_min, max: area.humedad_max });
    }
  }

  // Presión
  if (area.presion !== null && area.presion !== undefined) {
    const pres = parseFloat(area.presion);
    if (area.presion_critica_min !== null && area.presion_critica_min !== undefined && pres < area.presion_critica_min) {
      alertas.push({ tipo: 'presion', severidad: 'critica', mensaje: `Presión CRÍTICA por debajo de ${area.presion_critica_min} Pa (${pres} Pa)`, valor: pres, min: area.presion_critica_min, max: area.presion_max });
    } else if (area.presion_critica_max !== null && area.presion_critica_max !== undefined && pres > area.presion_critica_max) {
      alertas.push({ tipo: 'presion', severidad: 'critica', mensaje: `Presión CRÍTICA por encima de ${area.presion_critica_max} Pa (${pres} Pa)`, valor: pres, min: area.presion_min, max: area.presion_critica_max });
    } else if (pres < area.presion_min) {
      alertas.push({ tipo: 'presion', severidad: 'advertencia', mensaje: `Presión por debajo del mínimo (${pres} Pa < ${area.presion_min} Pa)`, valor: pres, min: area.presion_min, max: area.presion_max });
    } else if (pres > area.presion_max) {
      alertas.push({ tipo: 'presion', severidad: 'advertencia', mensaje: `Presión por encima del máximo (${pres} Pa > ${area.presion_max} Pa)`, valor: pres, min: area.presion_min, max: area.presion_max });
    }
  }

  return alertas;
}

async function saveAlerta(area, alerta, destinatarios = [], lecturaId = null) {
  // Verificar si ya existe alerta activa similar (últimos 15 min) para evitar spam
  const existing = await query(`
    SELECT id FROM alertas_historial
    WHERE area_id = $1 AND tipo_alerta = $2 AND resuelta = false
    AND created_at > NOW() - INTERVAL '15 minutes'
  `, [area.area_id, alerta.tipo]);

  if (existing.rows.length > 0) {
    await query(`
      UPDATE alertas_historial
      SET valor_actual = $1, mensaje = $2
      WHERE id = $3
    `, [alerta.valor, alerta.mensaje, existing.rows[0].id]);
    return null; // No es nueva
  }

  const emailList = Array.isArray(destinatarios) && destinatarios.length > 0
    ? destinatarios
    : config.email.alertRecipients;

  // Insertar nueva alerta
  const result = await query(`
    INSERT INTO alertas_historial (
      area_id, lectura_id, tipo_alerta, severidad, mensaje,
      valor_actual, valor_esperado_min, valor_esperado_max,
      email_destinatarios
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    area.area_id, lecturaId, alerta.tipo, alerta.severidad, alerta.mensaje,
    alerta.valor, alerta.min, alerta.max, emailList
  ]);

  return result.rows[0];
}

export async function checkSensorConnection(io) {
  // Verificar sensores sin datos en últimos 15 minutos
  const result = await query(`
    SELECT a.id, a.nombre,
           MAX(l.fecha_hora) as ultima_lectura
    FROM areas_laboratorio a
    LEFT JOIN lecturas_sensores l ON l.area_id = a.id
    WHERE a.activa = true
    GROUP BY a.id, a.nombre
    HAVING MAX(l.fecha_hora) < NOW() - INTERVAL '15 minutes'
       OR MAX(l.fecha_hora) IS NULL
  `);

  for (const area of result.rows) {
    const existing = await query(`
      SELECT id FROM alertas_historial
      WHERE area_id = $1 AND tipo_alerta = 'conexion' AND resuelta = false
      AND created_at > NOW() - INTERVAL '1 hour'
    `, [area.id]);

    if (existing.rows.length === 0) {
      const saved = await query(`
        INSERT INTO alertas_historial (area_id, tipo_alerta, severidad, mensaje)
        VALUES ($1, 'conexion', 'advertencia', 'Sensor sin comunicación por más de 15 minutos')
        RETURNING *
      `, [area.id]);

      if (io) io.emitAlert(saved.rows[0]);
    }
  }
}