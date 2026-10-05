// ============================================
// PHARMA MONITOR - SERVICIO DE UMBRALES Y ALERTAS
// Cron job que evalúa lecturas y genera alertas + emails
// ============================================

import cron from 'node-cron';
import { query, transaction } from '../db/pool.js';
import { config } from '../config/index.js';
import { sendAlertEmail } from '../utils/email.js';

let checkInterval = null;

export function startThresholdChecker(io) {
  const intervalMin = parseInt(process.env.ALERTAS_CHECK_INTERVAL_MINUTOS) || 5;

  console.log(`⏰ Iniciando checker de umbrales cada ${intervalMin} minutos`);

  // Ejecutar inmediatamente al arrancar
  checkThresholds(io);

  // Programar cron job
  checkInterval = cron.schedule(`*/${intervalMin} * * * *`, () => {
    checkThresholds(io);
  });

  return checkInterval;
}

export function stopThresholdChecker() {
  if (checkInterval) {
    checkInterval.stop();
    checkInterval = null;
    console.log('⏹️ Checker de umbrales detenido');
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
        ORDER BY fecha_hora DESC
        LIMIT 1
      ) l ON true
      WHERE a.activa = true
    `);

    let alertasGeneradas = 0;

    for (const area of result.rows) {
      if (!area.temperatura && !area.humedad && !area.presion) continue; // Sin datos

      const alertas = evaluateArea(area);

      for (const alerta of alertas) {
        const saved = await saveAlerta(area, alerta);
        if (saved) {
          alertasGeneradas++;
          // Emitir por WebSocket
          if (io) {
            io.emitAlert(saved);
          }
          // Enviar email si corresponde
          if (area.notificar_email && config.email.alertRecipients.length > 0) {
            await sendAlertEmail({
              areaNombre: area.nombre,
              tipoAlerta: alerta.tipo,
              severidad: alerta.severidad,
              mensaje: alerta.mensaje,
              valorActual: alerta.valor,
              valorMin: alerta.min,
              valorMax: alerta.max,
              fecha: area.fecha_hora,
              destinatarios: config.email.alertRecipients,
            });
            // Marcar email como enviado
            await query('UPDATE alertas_historial SET email_enviado = true, email_enviado_at = NOW() WHERE id = $1', [saved.id]);
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

export function evaluateArea(area) {
  const alertas = [];
  const now = new Date();

  // Temperatura
  if (area.temperatura !== null) {
    const temp = parseFloat(area.temperatura);
    if (area.temp_critica_min !== null && temp < area.temp_critica_min) {
      alertas.push({ tipo: 'temperatura', severidad: 'critica', mensaje: `Temperatura CRÍTICA por debajo de ${area.temp_critica_min}°C`, valor: temp, min: area.temp_critica_min, max: area.temp_max });
    } else if (area.temp_critica_max !== null && temp > area.temp_critica_max) {
      alertas.push({ tipo: 'temperatura', severidad: 'critica', mensaje: `Temperatura CRÍTICA por encima de ${area.temp_critica_max}°C`, valor: temp, min: area.temp_min, max: area.temp_critica_max });
    } else if (temp < area.temp_min) {
      alertas.push({ tipo: 'temperatura', severidad: 'advertencia', mensaje: `Temperatura por debajo del mínimo (${area.temp_min}°C)`, valor: temp, min: area.temp_min, max: area.temp_max });
    } else if (temp > area.temp_max) {
      alertas.push({ tipo: 'temperatura', severidad: 'advertencia', mensaje: `Temperatura por encima del máximo (${area.temp_max}°C)`, valor: temp, min: area.temp_min, max: area.temp_max });
    }
  }

  // Humedad
  if (area.humedad !== null) {
    const hum = parseFloat(area.humedad);
    if (area.humedad_critica_min !== null && hum < area.humedad_critica_min) {
      alertas.push({ tipo: 'humedad', severidad: 'critica', mensaje: `Humedad CRÍTICA por debajo de ${area.humedad_critica_min}%`, valor: hum, min: area.humedad_critica_min, max: area.humedad_max });
    } else if (area.humedad_critica_max !== null && hum > area.humedad_critica_max) {
      alertas.push({ tipo: 'humedad', severidad: 'critica', mensaje: `Humedad CRÍTICA por encima de ${area.humedad_critica_max}%`, valor: hum, min: area.humedad_min, max: area.humedad_critica_max });
    } else if (hum < area.humedad_min) {
      alertas.push({ tipo: 'humedad', severidad: 'advertencia', mensaje: `Humedad por debajo del mínimo (${area.humedad_min}%)`, valor: hum, min: area.humedad_min, max: area.humedad_max });
    } else if (hum > area.humedad_max) {
      alertas.push({ tipo: 'humedad', severidad: 'advertencia', mensaje: `Humedad por encima del máximo (${area.humedad_max}%)`, valor: hum, min: area.humedad_min, max: area.humedad_max });
    }
  }

  // Presión
  if (area.presion !== null) {
    const pres = parseFloat(area.presion);
    if (area.presion_critica_min !== null && pres < area.presion_critica_min) {
      alertas.push({ tipo: 'presion', severidad: 'critica', mensaje: `Presión CRÍTICA por debajo de ${area.presion_critica_min} Pa`, valor: pres, min: area.presion_critica_min, max: area.presion_max });
    } else if (area.presion_critica_max !== null && pres > area.presion_critica_max) {
      alertas.push({ tipo: 'presion', severidad: 'critica', mensaje: `Presión CRÍTICA por encima de ${area.presion_critica_max} Pa`, valor: pres, min: area.presion_min, max: area.presion_critica_max });
    } else if (pres < area.presion_min) {
      alertas.push({ tipo: 'presion', severidad: 'advertencia', mensaje: `Presión por debajo del mínimo (${area.presion_min} Pa)`, valor: pres, min: area.presion_min, max: area.presion_max });
    } else if (pres > area.presion_max) {
      alertas.push({ tipo: 'presion', severidad: 'advertencia', mensaje: `Presión por encima del máximo (${area.presion_max} Pa)`, valor: pres, min: area.presion_min, max: area.presion_max });
    }
  }

  return alertas;
}

async function saveAlerta(area, alerta) {
  // Verificar si ya existe alerta activa similar (últimos 30 min) para evitar spam
  const existing = await query(`
    SELECT id FROM alertas_historial
    WHERE area_id = $1 AND tipo_alerta = $2 AND resuelta = false
    AND created_at > NOW() - INTERVAL '30 minutes'
  `, [area.area_id, alerta.tipo]);

  if (existing.rows.length > 0) {
    // Actualizar timestamp y valor de la alerta existente
    await query(`
      UPDATE alertas_historial
      SET valor_actual = $1, mensaje = $2, updated_at = NOW()
      WHERE id = $3
    `, [alerta.valor, alerta.mensaje, existing.rows[0].id]);
    return null; // No es nueva
  }

  // Insertar nueva alerta
  const result = await query(`
    INSERT INTO alertas_historial (
      area_id, tipo_alerta, severidad, mensaje,
      valor_actual, valor_esperado_min, valor_esperado_max,
      email_destinatarios
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    area.area_id, alerta.tipo, alerta.severidad, alerta.mensaje,
    alerta.valor, alerta.min, alerta.max, config.email.alertRecipients
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