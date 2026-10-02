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

// Endpoint para SIMULAR EMERGENCIA y enviar el Gmail que dice "alerta"
app.post('/api/alertas/simular', async (req, res, next) => {
  try {
    let destinatario = process.env.ALERT_EMAILS || process.env.EMAIL_USER;

    try {
      const configRes = await pool.query("SELECT valor FROM configuracion WHERE clave = 'email_notificaciones'");
      if (configRes.rows.length > 0 && configRes.rows[0].valor) {
        destinatario = configRes.rows[0].valor;
      }
    } catch (e) {
      // Si la consulta falla, usa la variable de entorno
    }

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"Pharma Monitor" <${process.env.EMAIL_USER}>`,
      to: destinatario,
      subject: 'Alerta',
      text: 'alerta'
    });

    res.json({ ok: true, message: `Correo de alerta enviado exitosamente a ${destinatario}` });
  } catch (err) {
    console.error('Error al enviar correo de alerta:', err);
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