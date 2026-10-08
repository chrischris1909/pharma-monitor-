-- 1. Módulo de Mantenimiento y Calibración
ALTER TABLE areas_laboratorio ADD COLUMN IF NOT EXISTS ultima_calibracion DATE DEFAULT CURRENT_DATE;
ALTER TABLE areas_laboratorio ADD COLUMN IF NOT EXISTS frecuencia_calibracion_meses INT DEFAULT 6;

-- 2. Log de Auditoría (Audit Trail CFR 21 Part 11)
CREATE TABLE IF NOT EXISTS auditoria (
    id SERIAL PRIMARY KEY,
    usuario_nombre VARCHAR(100) NOT NULL,
    accion VARCHAR(255) NOT NULL,
    entidad VARCHAR(100) NOT NULL,
    entidad_id INT,
    valores_anteriores JSONB,
    valores_nuevos JSONB,
    justificacion TEXT,
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
