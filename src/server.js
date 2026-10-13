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
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }
});

const PORT = process.env.PORT || 3000;

// Configuración del transporte Nodemailer para Gmail
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(morgan('dev'));
app.use(express.json());

app.set('io', io);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'pharma-monitor' });
});

// ----------------------------------------------------
// RUTAS DE CONFIGURACIÓN Y ENVÍO DE EMAIL
// ----------------------------------------------------

// Handler reutilizable para obtener email guardado
const getEmailHandler = async (req, res, next) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS configuracion (
        id SERIAL PRIMARY KEY,
        clave VARCHAR(100) UNIQUE NOT NULL,
        valor TEXT NOT NULL
      );
    `);
    const result = await pool.query("SELECT valor FROM configuracion WHERE clave = 'email_notificaciones'");
    const email = result.rows[0]?.valor || process.env.EMAIL_USER || '';
    res.json({ email, valor: email });
  } catch (err) {
    next(err);
  }
};

// Handler reutilizable para guardar el correo en la base de datos
const saveEmailHandler = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'El email es requerido' });
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS configuracion (
        id SERIAL PRIMARY KEY,
        clave VARCHAR(100) UNIQUE NOT NULL,
        valor TEXT NOT NULL
      );
    `);

    await pool.query(
      `INSERT INTO configuracion (clave, valor) 
       VALUES ('email_notificaciones', $1) 
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`,
      [email]
    );

    res.json({ ok: true, message: 'Email guardado correctamente' });
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
app.post('/api/alertas/simular', async (req, res, next) => {
  try {
    let targetAreaId = req.body.area_id;
    let targetAreaName = 'Área General';

    if (targetAreaId) {
      const areaCheck = await pool.query('SELECT id, nombre FROM areas_laboratorio WHERE id = $1', [targetAreaId]);
      if (areaCheck.rows.length > 0) {
        targetAreaName = areaCheck.rows[0].nombre;
      }
    } else {
      const firstArea = await pool.query('SELECT id, nombre FROM areas_laboratorio WHERE activa = true LIMIT 1');
      if (firstArea.rows.length > 0) {
        targetAreaId = firstArea.rows[0].id;
        targetAreaName = firstArea.rows[0].nombre;
      }
    }

    const { sendAlertEmail, getRecipientsForArea } = await import('./utils/email.js');
    const destinatarios = await getRecipientsForArea(targetAreaId);

    // Insert alert into DB con el UUID del área
    const insertRes = await pool.query(`
      INSERT INTO alertas_historial (area_id, tipo_alerta, severidad, mensaje, valor_actual, resuelta, email_enviado, email_enviado_at)
      VALUES ($1, 'emergencia_simulada', 'critica', $2, 99.9, false, true, NOW())
      RETURNING *
    `, [targetAreaId, `Simulación de emergencia forzada en ${targetAreaName}`]);

    const alertaGuardada = insertRes.rows[0];

    // Emitir por WebSocket si io está disponible
    const io = req.app.get('io');
    if (io) {
      io.emitAlert?.(alertaGuardada);
    }

    // Send formatted email using the existing util
    if (destinatarios.length > 0) {
      await sendAlertEmail({
        areaNombre: targetAreaName,
        tipoAlerta: 'Prueba de Emergencia (Simulación)',
        severidad: 'critica',
        mensaje: `Simulación de emergencia generada en ${targetAreaName}. Notificación dirigida únicamente a los responsables de esta área y al Gerente General.`,
        valorActual: 99.9,
        valorMin: 0,
        valorMax: 30,
        fecha: new Date().toISOString(),
        destinatarios
      });
    }

    res.json({
      ok: true,
      message: `Alerta enviada exitosamente a los responsables de ${targetAreaName}: ${destinatarios.join(', ')}`,
      destinatarios,
      area: targetAreaName
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