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
        'SELECT id, nombre, correo_institucional, password_hash, rol, intentos_fallidos, bloqueado_hasta FROM usuarios WHERE (correo_institucional = $1 OR correo_institucional = $2) AND activo = true',
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
        user: { id: user.id, nombre: user.nombre, correo: user.correo_institucional, rol: user.rol },
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
    body('rol').isIn(['admin', 'supervisor', 'operador', 'usuario', 'lectura']),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { nombre, correo, password, rol } = req.body;

      const existing = await query('SELECT id FROM usuarios WHERE correo_institucional = $1', [correo]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'El correo ya está registrado' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const result = await query(
        `INSERT INTO usuarios (nombre, correo_institucional, password_hash, rol)
         VALUES ($1, $2, $3, $4)
         RETURNING id, nombre, correo_institucional, rol, created_at`,
        [nombre, correo, passwordHash, rol]
      );

      res.status(201).json({ user: result.rows[0] });
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
      'SELECT id, nombre, correo_institucional, rol, activo, ultimo_acceso, created_at FROM usuarios ORDER BY created_at DESC'
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
    const { nombre, rol, activo } = req.body;

    const result = await query(
      `UPDATE usuarios SET nombre = COALESCE($1, nombre), rol = COALESCE($2, rol), activo = COALESCE($3, activo), updated_at = NOW()
       WHERE id = $4 RETURNING id, nombre, correo_institucional, rol, activo`,
      [nombre, rol, activo, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error actualizando usuario' });
  }
});

export default router;