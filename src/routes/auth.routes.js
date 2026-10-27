// ============================================
// PHARMA MONITOR - RUTAS DE AUTENTICACIÓN
// ============================================

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body } from 'express-validator';
import { query } from '../db/pool.js';
import { config } from '../config/index.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware.js';
import { handleValidationErrors } from '../middleware/validation.middleware.js';

const router = express.Router();

// POST /api/auth/login
router.post('/login',
  [
    body('correo').notEmpty().withMessage('Usuario o correo requerido'),
    body('password').notEmpty().withMessage('Contraseña requerida'),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { correo, password } = req.body;
      const correoNormalizado = correo.includes('@') ? correo : `${correo}@siegfried.com`;

      const result = await query(
        `SELECT u.id, u.nombre, u.correo_institucional, u.password_hash, u.rol, u.intentos_fallidos, u.bloqueado_hasta, u.area_id, a.nombre as area_nombre
         FROM usuarios u
         LEFT JOIN areas_laboratorio a ON a.id = u.area_id
         WHERE (u.correo_institucional = $1 OR u.correo_institucional = $2) AND (u.activo = true OR u.activo IS NULL)`,
        [correo, correoNormalizado]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      const user = result.rows[0];

      // Verificar bloqueo temporal
      if (user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date()) {
        const tiempoRestante = Math.ceil((new Date(user.bloqueado_hasta) - new Date()) / 60000);
        return res.status(429).json({ error: `Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en ${tiempoRestante} minuto(s).` });
      }

      const valid = await bcrypt.compare(password, user.password_hash);

      if (!valid) {
        let nuevosIntentos = (user.intentos_fallidos || 0) + 1;
        if (nuevosIntentos >= 3) {
          // Bloquear por 15 minutos
          await query("UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NOW() + INTERVAL '15 minutes' WHERE id = $1", [user.id]);
          return res.status(429).json({ error: 'Múltiples intentos fallidos. Cuenta bloqueada por 15 minutos.' });
        } else {
          await query('UPDATE usuarios SET intentos_fallidos = $1 WHERE id = $2', [nuevosIntentos, user.id]);
          return res.status(401).json({ error: `Credenciales inválidas. Te quedan ${3 - nuevosIntentos} intento(s).` });
        }
      }

      // Login exitoso: Resetear intentos
      await query('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1', [user.id]);

      // Generar tokens
      const accessToken = jwt.sign(
        { userId: user.id, rol: user.rol },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      const refreshToken = jwt.sign(
        { userId: user.id, type: 'refresh' },
        config.jwt.refreshSecret,
        { expiresIn: config.jwt.refreshExpiresIn }
      );

      // Guardar refresh token hash
      const refreshHash = await bcrypt.hash(refreshToken, 10);
      await query(
        `INSERT INTO sesiones (usuario_id, refresh_token_hash, user_agent, ip, expira_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
        [user.id, refreshHash, req.get('user-agent') || '', req.ip]
      );

      // Actualizar último acceso
      await query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1', [user.id]);

      res.json({
        user: {
          id: user.id,
          nombre: user.nombre,
          correo: user.correo_institucional,
          rol: user.rol,
          area_id: user.area_id,
          area_nombre: user.area_nombre
        },
        accessToken,
        refreshToken,
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Error en el servidor' });
    }
  }
);

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token requerido' });

    // Buscar sesión
    const sessions = await query('SELECT * FROM sesiones WHERE expira_at > NOW()');
    let session = null;
    for (const s of sessions.rows) {
      if (await bcrypt.compare(refreshToken, s.refresh_token_hash)) {
        session = s;
        break;
      }
    }

    if (!session) {
      return res.status(401).json({ error: 'Refresh token inválido o expirado' });
    }

    // Verificar usuario
    const userResult = await query('SELECT id, nombre, correo_institucional, rol, activo FROM usuarios WHERE id = $1', [session.usuario_id]);
    if (userResult.rows.length === 0 || !userResult.rows[0].activo) {
      return res.status(401).json({ error: 'Usuario no válido' });
    }

    const user = userResult.rows[0];

    // Nuevo access token
    const accessToken = jwt.sign(
      { userId: user.id, rol: user.rol },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Nuevo refresh token (rotación)
    const newRefreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );
    const newRefreshHash = await bcrypt.hash(newRefreshToken, 10);

    await query('UPDATE sesiones SET refresh_token_hash = $1 WHERE id = $2', [newRefreshHash, session.id]);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Error renovando token' });
  }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const sessions = await query('SELECT * FROM sesiones WHERE usuario_id = $1 AND expira_at > NOW()', [req.user.id]);
      for (const s of sessions.rows) {
        if (await bcrypt.compare(refreshToken, s.refresh_token_hash)) {
          await query('DELETE FROM sesiones WHERE id = $1', [s.id]);
          break;
        }
      }
    }
    res.json({ message: 'Sesión cerrada' });
  } catch (error) {
    res.status(500).json({ error: 'Error cerrando sesión' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/register (solo admin)
router.post('/register',
  authMiddleware,
  requireAdmin,
  [
    body('nombre').trim().isLength({ min: 2, max: 150 }),
    body('correo').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('rol').customSanitizer(v => v ? v.toLowerCase() : v).isIn(['admin', 'supervisor', 'operador', 'usuario', 'lectura', 'gerente', 'calidad', 'mantenimiento']),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { nombre, correo, password, rol, area_id } = req.body;
      const rolNormalizado = (rol || 'operador').toLowerCase();
      // Si es admin (Gerente General), tiene acceso global a todas las áreas (area_id = null)
      const targetAreaId = rolNormalizado === 'admin' ? null : (area_id || null);

      const existing = await query('SELECT id FROM usuarios WHERE correo_institucional = $1', [correo]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'El correo ya está registrado' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const result = await query(
        `INSERT INTO usuarios (nombre, correo_institucional, password_hash, rol, area_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, nombre, correo_institucional, rol, area_id, created_at`,
        [nombre, correo, passwordHash, rolNormalizado, targetAreaId]
      );

      const newUserId = result.rows[0].id;
      const fullUser = await query(
        `SELECT u.id, u.nombre, u.correo_institucional, u.rol, u.activo, u.area_id, a.nombre as area_nombre, u.created_at
         FROM usuarios u
         LEFT JOIN areas_laboratorio a ON a.id = u.area_id
         WHERE u.id = $1`,
        [newUserId]
      );

      // Registrar en auditoría
      await query(
        `INSERT INTO auditoria (usuario_nombre, accion, entidad, entidad_id, valores_nuevos, justificacion)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.user.nombre || req.user.correo_institucional, 'CREATE_USER', 'usuarios', String(newUserId), JSON.stringify({ nombre, correo, rol: rolNormalizado, area_id: targetAreaId }), 'Creación de nuevo usuario con área asignada']
      );

      res.status(201).json({ user: fullUser.rows[0] });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Error creando usuario' });
    }
  }
);

// GET /api/auth/users (solo admin)
router.get('/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.nombre, u.correo_institucional, u.rol, u.activo, u.ultimo_acceso, u.created_at, u.area_id, a.nombre as area_nombre
       FROM usuarios u
       LEFT JOIN areas_laboratorio a ON a.id = u.area_id
       ORDER BY u.created_at DESC`
    );
    res.json({ users: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

// PATCH /api/auth/users/:id (solo admin)
router.patch('/users/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, correo, password, rol, activo, area_id } = req.body;
    const rolNormalizado = rol ? rol.toLowerCase() : undefined;
    const targetAreaId = rolNormalizado === 'admin' ? null : area_id;

    let newPasswordHash = null;
    if (password && String(password).trim().length >= 6) {
      newPasswordHash = await bcrypt.hash(String(password).trim(), 10);
    }

    const result = await query(
      `UPDATE usuarios
       SET nombre = COALESCE($1, nombre),
           rol = COALESCE($2, rol),
           activo = COALESCE($3, activo),
           area_id = CASE WHEN $4::boolean IS TRUE THEN $5::uuid ELSE area_id END,
           password_hash = COALESCE($6, password_hash),
           correo_institucional = COALESCE($7, correo_institucional),
           updated_at = NOW()
       WHERE id = $8
       RETURNING id, nombre, correo_institucional, rol, activo, area_id`,
      [nombre, rolNormalizado, activo, area_id !== undefined, targetAreaId || null, newPasswordHash, correo || null, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Obtener datos frescos con el nombre del área
    const fullUser = await query(
      `SELECT u.id, u.nombre, u.correo_institucional, u.rol, u.activo, u.area_id, a.nombre as area_nombre
       FROM usuarios u
       LEFT JOIN areas_laboratorio a ON a.id = u.area_id
       WHERE u.id = $1`,
      [id]
    );

    // Registrar en auditoría
    await query(
      `INSERT INTO auditoria (usuario_nombre, accion, entidad, entidad_id, valores_nuevos, justificacion)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.nombre || req.user.correo_institucional, 'UPDATE_USER', 'usuarios', String(id), JSON.stringify(fullUser.rows[0]), 'Actualización de datos, rol o área asignada de usuario']
    );

    res.json({ user: fullUser.rows[0] });
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ error: 'Error actualizando usuario' });
  }
});

// DELETE /api/auth/users/:id (solo admin)
router.delete('/users/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario administrador' });
    }
    const userToDelete = await query('SELECT id, nombre, correo_institucional FROM usuarios WHERE id = $1', [id]);
    if (userToDelete.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    await query('DELETE FROM sesiones WHERE usuario_id = $1', [id]);
    await query('DELETE FROM usuarios WHERE id = $1', [id]);

    // Registrar en auditoría
    await query(
      `INSERT INTO auditoria (usuario_nombre, accion, entidad, entidad_id, valores_anteriores, justificacion)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.nombre || req.user.correo_institucional, 'DELETE_USER', 'usuarios', String(id), JSON.stringify(userToDelete.rows[0]), 'Eliminación de usuario del sistema']
    );

    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Error eliminando usuario' });
  }
});

export default router;