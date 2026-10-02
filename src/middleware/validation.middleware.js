// ============================================
// PHARMA MONITOR - MIDDLEWARE DE VALIDACIÓN
// ============================================

import { validationResult, body, param, query } from 'express-validator';

export function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Datos de entrada inválidos',
      details: errors.array().map(e => ({ field: e.path, message: e.msg, value: e.value }))
    });
  }
  next();
}

// Validaciones comunes
export const validateId = param('id').isUUID().withMessage('ID debe ser un UUID válido');

export const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser entero positivo'),
  query('limit').optional().isInt({ min: 1, max: 500 }).withMessage('Límite entre 1 y 500'),
  query('sort').optional().isString(),
  query('order').optional().isIn(['asc', 'desc']).withMessage('Orden debe ser asc o desc'),
];

export const validateDateRange = [
  query('fechaDesde').optional().isISO8601().withMessage('fechaDesde debe ser ISO8601'),
  query('fechaHasta').optional().isISO8601().withMessage('fechaHasta debe ser ISO8601'),
];

// Auth
export const validateLogin = [
  body('correo').isEmail().normalizeEmail().withMessage('Correo inválido'),
  body('password').isLength({ min: 1 }).withMessage('Contraseña requerida'),
  handleValidationErrors,
];

export const validateRegister = [
  body('nombre').trim().isLength({ min: 2, max: 150 }).withMessage('Nombre 2-150 caracteres'),
  body('correo').isEmail().normalizeEmail().withMessage('Correo institucional inválido'),
  body('password').isLength({ min: 6 }).withMessage('Contraseña mínimo 6 caracteres'),
  body('rol').optional().isIn(['admin', 'supervisor', 'operador', 'usuario', 'lectura']).withMessage('Rol inválido'),
  handleValidationErrors,
];

// Áreas
export const validateArea = [
  body('nombre').trim().isLength({ min: 2, max: 100 }).withMessage('Nombre 2-100 caracteres'),
  body('descripcion').optional().isString(),
  body('tipo_area').isIn(['liquidos', 'solidos', 'semisolidos', 'esteriles', 'control_calidad', 'almacen', 'otro']).withMessage('Tipo de área inválido'),
  body('imagen_url').optional().isURL().withMessage('URL de imagen inválida'),
  handleValidationErrors,
];

// Parámetros de seguridad
export const validateParametros = [
  body('temp_min').isFloat({ min: -50, max: 100 }).withMessage('Temp mínima -50 a 100'),
  body('temp_max').isFloat({ min: -50, max: 100 }).withMessage('Temp máxima -50 a 100'),
  body('humedad_min').isFloat({ min: 0, max: 100 }).withMessage('Humedad mínima 0-100%'),
  body('humedad_max').isFloat({ min: 0, max: 100 }).withMessage('Humedad máxima 0-100%'),
  body('presion_min').isFloat({ min: 0 }).withMessage('Presión mínima positiva'),
  body('presion_max').isFloat({ min: 0 }).withMessage('Presión máxima positiva'),
  body('temp_critica_min').optional().isFloat({ min: -50, max: 100 }),
  body('temp_critica_max').optional().isFloat({ min: -50, max: 100 }),
  body('humedad_critica_min').optional().isFloat({ min: 0, max: 100 }),
  body('humedad_critica_max').optional().isFloat({ min: 0, max: 100 }),
  body('presion_critica_min').optional().isFloat({ min: 0 }),
  body('presion_critica_max').optional().isFloat({ min: 0 }),
  handleValidationErrors,
];

// Lecturas sensores (desde Arduino)
export const validateLectura = [
  body('sensor_id').isString().isLength({ min: 1, max: 100 }).withMessage('sensor_id requerido'),
  body('temperatura').isFloat({ min: -50, max: 150 }).withMessage('Temperatura -50 a 150°C'),
  body('humedad').isFloat({ min: 0, max: 100 }).withMessage('Humedad 0-100%'),
  body('presion').isFloat({ min: 0, max: 1000 }).withMessage('Presión 0-1000 Pa'),
  body('bateria_nivel').optional().isInt({ min: 0, max: 100 }),
  body('senal_calidad').optional().isInt({ min: 0, max: 100 }),
  body('firmware_version').optional().isString(),
  handleValidationErrors,
];

// Alertas
export const validateAlertaResolve = [
  body('notas_resolucion').optional().isString().isLength({ max: 1000 }),
  handleValidationErrors,
];

// Reportes
export const validateReporte = [
  query('area_id').optional().isUUID(),
  query('fecha_desde').isISO8601().withMessage('fecha_desde requerida (ISO8601)'),
  query('fecha_hasta').isISO8601().withMessage('fecha_hasta requerida (ISO8601)'),
  query('formato').optional().isIn(['json', 'pdf', 'csv']).withMessage('Formato: json, pdf o csv'),
  handleValidationErrors,
];