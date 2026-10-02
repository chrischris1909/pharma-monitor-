// ============================================
// PHARMA MONITOR - MIDDLEWARE DE AUTENTICACIÓN JWT
// ============================================

import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { query } from '../db/pool.js';

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autorización requerido' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Verificar que el usuario existe y está activo
    const result = await query(
      'SELECT id, nombre, correo_institucional, rol, activo FROM usuarios WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const user = result.rows[0];
    if (!user.activo) {
      return res.status(401).json({ error: 'Usuario desactivado' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Error de autenticación' });
  }
}

// Middleware opcional (no falla si no hay token)
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    await authMiddleware(req, res, next);
  } catch {
    next();
  }
}

// Middleware para roles específicos
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Autenticación requerida' });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Permisos insuficientes', required: roles, current: req.user.rol });
    }
    next();
  };
}

// Solo admin
export const requireAdmin = requireRole('admin');

// Admin o supervisor
export const requireSupervisor = requireRole('admin', 'supervisor');

// Cualquier usuario autenticado
export const requireAuth = requireRole('admin', 'supervisor', 'operador', 'usuario', 'lectura');