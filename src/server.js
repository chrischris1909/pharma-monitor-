import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';
import nodemailer from 'nodemailer';
import 'dotenv/config';

import { pool } from './db/pool.js';
import authRoutes from './routes/auth.routes.js';
import areasRoutes from './routes/areas.routes.js';
import sensoresRoutes from './routes/sensores.routes.js';
import alertasRoutes from './routes/alertas.routes.js';
import reportesRoutes from './routes/reportes.routes.js';
import auditoriaRoutes from './routes/auditoria.routes.js';
import correosRoutes from './routes/correos.routes.js';
import { initSocket } from './services/socket.service.js';
import { startThresholdChecker } from './services/threshold.service.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true }
});

const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());

app.set('io', io);

const healthHandler = async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString(), service: 'pharma-monitor' });
  } catch (err) {
    res.json({ status: 'degraded', database: 'error', timestamp: new Date().toISOString(), service: 'pharma-monitor' });
  }
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// ----------------------------------------------------
// RUTAS DE CONFIGURACIÓN DEL SISTEMA Y EMAIL
// ----------------------------------------------------

app.get('/api/configuracion_sistema', async (req, res) => {
  try {
    const result = await pool.query('SELECT clave, valor, descripcion FROM configuracion_sistema ORDER BY clave ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error cargando configuración del sistema' });
  }
});

app.post('/api/configuracion_sistema', async (req, res) => {
  try {
    const { clave, valor, descripcion } = req.body;
    if (!clave) return res.status(400).json({ error: 'La clave es requerida' });

    if (clave === 'alert_email') {
      process.env.ALERT_EMAILS = String(valor || '');
    }

    const result = await pool.query(
      `INSERT INTO configuracion_sistema (clave, valor, descripcion, updated_at)
       VALUES ($1, $2, COALESCE($3, ''), NOW())
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()
       RETURNING *`,
      [clave, String(valor ?? ''), descripcion || null]
    );
    res.json({ ok: true, config: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error guardando configuración del sistema' });
  }
});

// Handler reutilizable para obtener email guardado
const getEmailHandler = async (req, res, next) => {
  try {
    const result = await pool.query("SELECT valor FROM configuracion_sistema WHERE clave = 'alert_email' LIMIT 1").catch(() => ({ rows: [] }));
    const email = result.rows[0]?.valor || process.env.ALERT_EMAILS || process.env.EMAIL_USER || '';
    res.json({ email, valor: email });
  } catch (err) {
    next(err);
  }
};

// Handler reutilizable para guardar el correo en la base de datos
const saveEmailHandler = async (req, res, next) => {
  try {
    const email = req.body.email || req.body.valor;
    if (!email) {
      return res.status(400).json({ error: 'El email es requerido' });
    }

    process.env.ALERT_EMAILS = email;
    await pool.query(
      `INSERT INTO configuracion_sistema (clave, valor, descripcion, updated_at) 
       VALUES ('alert_email', $1, 'Correo de respaldo para notificaciones', NOW()) 
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()`,
      [email]
    ).catch(() => {});

    res.json({ ok: true, message: 'Email guardado correctamente', email });
  } catch (err) {
    next(err);
  }
};

// Se registran ambas rutas (/api/config y /api/alertas) para compatibilidad con el frontend
app.get('/api/config/email', getEmailHandler);
app.get('/api/alertas/email', getEmailHandler);
app.post('/api/config/email', saveEmailHandler);
app.post('/api/alertas/email', saveEmailHandler);

// Endpoint para SIMULAR EMERGENCIA y enviar el correo segmentado por área
app.post('/api/alertas/simular', async (req, res) => {
  try {
    let targetAreaId = req.body.area_id;
    let targetAreaName = 'Área General';
    let tempMin = 18;
    let tempMax = 25;

    if (targetAreaId) {
      const areaCheck = await pool.query(
        `SELECT a.id, a.nombre, ps.temp_min, ps.temp_max
         FROM areas_laboratorio a
         LEFT JOIN parametros_seguridad ps ON ps.area_id = a.id
         WHERE a.id = $1`,
        [targetAreaId]
      );
      if (areaCheck.rows.length > 0) {
        targetAreaName = areaCheck.rows[0].nombre;
        tempMin = Number(areaCheck.rows[0].temp_min ?? 18);
        tempMax = Number(areaCheck.rows[0].temp_max ?? 25);
      }
    } else {
      const firstArea = await pool.query(
        `SELECT a.id, a.nombre, ps.temp_min, ps.temp_max
         FROM areas_laboratorio a
         LEFT JOIN parametros_seguridad ps ON ps.area_id = a.id
         WHERE a.activa = true
         ORDER BY a.nombre ASC LIMIT 1`
      );
      if (firstArea.rows.length > 0) {
        targetAreaId = firstArea.rows[0].id;
        targetAreaName = firstArea.rows[0].nombre;
        tempMin = Number(firstArea.rows[0].temp_min ?? 18);
        tempMax = Number(firstArea.rows[0].temp_max ?? 25);
      }
    }

    const { sendAlertEmail, getRecipientsForArea } = await import('./utils/email.js');
    const destinatarios = await getRecipientsForArea(targetAreaId);
    const valorSimulado = Number(req.body.valor_actual ?? 32.8);
    const mensajeSimulado = req.body.mensaje || `Emergencia térmica detectada en ${targetAreaName}: ${valorSimulado}°C fuera del rango permitido (${tempMin}°C - ${tempMax}°C)`;

    let emailResult = { success: false, error: null };
    if (destinatarios.length > 0) {
      emailResult = await sendAlertEmail({
        areaNombre: targetAreaName,
        tipoAlerta: 'temperatura',
        severidad: 'critica',
        mensaje: `${mensajeSimulado}. Notificación enviada a los responsables de ${targetAreaName} y Gerencia General.`,
        valorActual: valorSimulado,
        valorMin: tempMin,
        valorMax: tempMax,
        fecha: new Date().toISOString(),
        destinatarios
      });
    }

    // Insert alert into DB con el UUID del área y los destinatarios reales
    const insertRes = await pool.query(`
      INSERT INTO alertas_historial (
        area_id, tipo_alerta, severidad, mensaje,
        valor_actual, valor_esperado_min, valor_esperado_max,
        resuelta, email_enviado, email_enviado_at, email_destinatarios, email_error
      )
      VALUES ($1, 'temperatura', 'critica', $2, $3, $4, $5, false, $6, CASE WHEN $6 THEN NOW() ELSE NULL END, $7, $8)
      RETURNING *
    `, [
      targetAreaId,
      mensajeSimulado,
      valorSimulado,
      tempMin,
      tempMax,
      Boolean(emailResult.success),
      destinatarios,
      emailResult.error || null
    ]);

    const alertaGuardada = { ...insertRes.rows[0], area_nombre: targetAreaName };

    // Emitir por WebSocket si io está disponible
    const io = req.app.get('io');
    if (io) {
      io.emitAlert?.(alertaGuardada);
    }

    res.json({
      ok: true,
      emailSent: Boolean(emailResult.success),
      message: `Alerta de ${targetAreaName} enviada a: ${destinatarios.join(', ')}`,
      destinatarios,
      area: targetAreaName,
      alerta: alertaGuardada
    });
  } catch (err) {
    console.error('Error al enviar correo de alerta simulada:', err);
    res.status(500).json({ error: 'Error enviando el correo de alerta: ' + err.message });
  }
});

// ----------------------------------------------------
// RUTAS PRINCIPALES DE LA APLICACIÓN
// ----------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/areas', areasRoutes);
app.use('/api/sensores', sensoresRoutes);
app.use('/api/alertas', alertasRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/correos_institucionales', correosRoutes);

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

initSocket(io);
startThresholdChecker(io);

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor Pharma Monitor corriendo en http://localhost:${PORT}`);
  console.log(`📡 WebSocket habilitado para tiempo real`);
});

export { app, io };