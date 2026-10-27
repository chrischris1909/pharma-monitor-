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
      const result = await query('SELECT id, nombre, correo_institucional, rol, area_id FROM usuarios WHERE id = $1 AND (activo = true OR activo IS NULL)', [decoded.userId]);
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
    const { id: userId, nombre, rol, area_id } = socket.user;
    console.log(`🔌 WebSocket conectado: ${nombre} (${rol}) [${socket.id}]`);

    connectedClients.set(socket.id, { userId, nombre, rol, area_id, areas: new Set() });

    // Unirse automáticamente a su sala de área o global
    if (rol?.toLowerCase() === 'admin' || !area_id) {
      socket.join('areas:all');
      socket.join('alertas:global');
    } else {
      socket.join(`area:${area_id}`);
    }

    // Unirse a sala de área específica
    socket.on('join:area', (areaId) => {
      if (areaId) {
        socket.join(`area:${areaId}`);
        const client = connectedClients.get(socket.id);
        if (client) client.areas.add(areaId);
      }
    });

    // Salir de sala de área
    socket.on('leave:area', (areaId) => {
      socket.leave(`area:${areaId}`);
      const client = connectedClients.get(socket.id);
      if (client) client.areas.delete(areaId);
    });

    // Unirse a sala global de alertas
    socket.on('join:alertas', () => {
      if (rol?.toLowerCase() === 'admin' || !area_id) {
        socket.join('alertas:global');
      } else {
        socket.join(`area:${area_id}`);
      }
    });

    // Solicitar estado actual
    socket.on('request:estado', async () => {
      try {
        let whereClause = 'WHERE a.activa = true';
        const params = [];
        if (rol?.toLowerCase() !== 'admin' && area_id) {
          whereClause += ' AND a.id = $1';
          params.push(area_id);
        }
        const result = await query(`
          SELECT a.id, a.id as area_id, a.nombre, a.descripcion, a.tipo_area, a.imagen_url, a.sensor_id,
                 a.ultima_calibracion, a.frecuencia_calibracion_meses,
                 COALESCE(ps.temp_min, 18) as temp_min,
                 COALESCE(ps.temp_max, 25) as temp_max,
                 COALESCE(ps.humedad_min, 0) as humedad_min,
                 COALESCE(ps.humedad_max, 65) as humedad_max,
                 COALESCE(ps.presion_min, 10) as presion_min,
                 COALESCE(ps.presion_max, 15) as presion_max,
                 l.temperatura, l.humedad, l.presion, l.bateria_nivel,
                 l.fecha_hora as ultima_lectura,
                 CASE
                   WHEN l.temperatura IS NULL THEN 'sin_datos'
                   WHEN l.temperatura < COALESCE(ps.temp_min, 18) OR l.temperatura > COALESCE(ps.temp_max, 25) THEN 'bad'
                   WHEN l.humedad > COALESCE(ps.humedad_max, 65) OR l.humedad < COALESCE(ps.humedad_min, 0) THEN 'bad'
                   WHEN l.presion < COALESCE(ps.presion_min, 10) OR l.presion > COALESCE(ps.presion_max, 15) THEN 'bad'
                   ELSE 'ok'
                 END as estado
          FROM areas_laboratorio a
          LEFT JOIN parametros_seguridad ps ON ps.area_id = a.id
          LEFT JOIN v_ultima_lectura_area l ON l.area_id = a.id
          ${whereClause}
          ORDER BY a.nombre
        `, params);
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
    io.to('areas:all').to(`area:${areaId}`).emit(event, data);
  };

  io.emitAlert = (alerta) => {
    if (alerta.area_id) {
      io.to('alertas:global').to(`area:${alerta.area_id}`).emit('alerta:nueva', alerta);
      io.to(`area:${alerta.area_id}`).emit('alerta:area', alerta);
    } else {
      io.emit('alerta:nueva', alerta);
    }
  };

  io.emitLectura = (areaId, lectura) => {
    io.to('areas:all').to(`area:${areaId}`).emit('lectura:nueva', lectura);
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