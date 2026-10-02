// ============================================
// PHARMA MONITOR - SERVICIO WEBSOCKET (Socket.IO)
// Tiempo real para dashboard, alertas, lecturas
// ============================================

import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { query } from '../db/pool.js';

const connectedClients = new Map(); // socketId -> { userId, rol, areas }

export function initSocket(io) {
  // Middleware de autenticación WebSocket
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      return next(new Error('Token requerido'));
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      const result = await query('SELECT id, nombre, correo_institucional, rol FROM usuarios WHERE id = $1 AND activo = true', [decoded.userId]);
      if (result.rows.length === 0) {
        return next(new Error('Usuario no encontrado'));
      }
      socket.user = result.rows[0];
      next();
    } catch (err) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    const { id: userId, nombre, rol } = socket.user;
    console.log(`🔌 WebSocket conectado: ${nombre} (${rol}) [${socket.id}]`);

    connectedClients.set(socket.id, { userId, nombre, rol, areas: new Set() });

    // Unirse a sala de área específica
    socket.on('join:area', (areaId) => {
      if (areaId) {
        socket.join(`area:${areaId}`);
        const client = connectedClients.get(socket.id);
        if (client) client.areas.add(areaId);
        console.log(`  📍 ${nombre} se unió a área ${areaId}`);
      }
    });

    // Salir de sala de área
    socket.on('leave:area', (areaId) => {
      socket.leave(`area:${areaId}`);
      const client = connectedClients.get(socket.id);
      if (client) client.areas.delete(areaId);
    });

    // Unirse a sala global de alertas (solo admin/supervisor)
    socket.on('join:alertas', () => {
      if (['admin', 'supervisor'].includes(rol)) {
        socket.join('alertas:global');
        console.log(`  🚨 ${nombre} se unió a alertas globales`);
      }
    });

    // Solicitar estado actual
    socket.on('request:estado', async () => {
      try {
        const result = await query(`SELECT * FROM v_estado_areas`);
        socket.emit('estado:actual', result.rows);
      } catch (error) {
        console.error('Error estado:', error);
      }
    });

    // Heartbeat
    socket.on('ping', () => socket.emit('pong'));

    socket.on('disconnect', (reason) => {
      connectedClients.delete(socket.id);
      console.log(`🔌 WebSocket desconectado: ${nombre} [${reason}]`);
    });
  });

  // Exponer métodos para emitir desde otros servicios
  io.emitToArea = (areaId, event, data) => {
    io.to(`area:${areaId}`).emit(event, data);
  };

  io.emitAlert = (alerta) => {
    io.to('alertas:global').emit('alerta:nueva', alerta);
    if (alerta.area_id) {
      io.to(`area:${alerta.area_id}`).emit('alerta:area', alerta);
    }
  };

  io.emitLectura = (areaId, lectura) => {
    io.to(`area:${areaId}`).emit('lectura:nueva', lectura);
  };

  io.getConnectedUsers = () => {
    return Array.from(connectedClients.values());
  };

  console.log('📡 Socket.IO inicializado');
  return io;
}

export function getConnectedClients() {
  return connectedClients;
}