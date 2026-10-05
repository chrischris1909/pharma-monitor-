-- ============================================
-- PHARMA MONITOR - ESQUEMA BASE DE DATOS
-- PostgreSQL + Supabase (Siegfried)
-- ============================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. TABLA USUARIOS
-- ============================================
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(150) NOT NULL,
    correo_institucional VARCHAR(200) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('admin', 'usuario', 'supervisor', 'operador')),
    activo BOOLEAN DEFAULT TRUE,
    ultimo_acceso TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usuarios_correo ON usuarios(correo_institucional);
CREATE INDEX idx_usuarios_rol ON usuarios(rol);

-- ============================================
-- 2. TABLA AREAS_LABORATORIO
-- ============================================
CREATE TABLE areas_laboratorio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) NOT NULL UNIQUE,
    sensor_id VARCHAR(100) UNIQUE, -- ID exacto del equipo Modbus/Arduino
    descripcion TEXT,
    imagen_url VARCHAR(500),
    tipo_area VARCHAR(50) CHECK (tipo_area IN ('liquidos', 'solidos', 'semisolidos', 'esteriles', 'control_calidad', 'almacen', 'otro')),
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. TABLA PARAMETROS_SEGURIDAD (Rangos por área)
-- ============================================
CREATE TABLE parametros_seguridad (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    area_id UUID NOT NULL REFERENCES areas_laboratorio(id) ON DELETE CASCADE,
    temp_min DECIMAL(5,2) NOT NULL DEFAULT 18.0,
    temp_max DECIMAL(5,2) NOT NULL DEFAULT 32.0,
    humedad_min DECIMAL(5,2) NOT NULL DEFAULT 30.0,
    humedad_max DECIMAL(5,2) NOT NULL DEFAULT 65.0,
    presion_min DECIMAL(7,2) NOT NULL DEFAULT 10.0,
    presion_max DECIMAL(7,2) NOT NULL DEFAULT 15.0,
    -- Umbrales de alerta crítica (más estrictos)
    temp_critica_min DECIMAL(5,2),
    temp_critica_max DECIMAL(5,2),
    humedad_critica_min DECIMAL(5,2),
    humedad_critica_max DECIMAL(5,2),
    presion_critica_min DECIMAL(7,2),
    presion_critica_max DECIMAL(7,2),
    -- Configuración de notificaciones
    notificar_email BOOLEAN DEFAULT TRUE,
    notificar_sistema BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(area_id)
);

-- ============================================
-- 4. TABLA LECTURAS_SENSORES
-- ============================================
CREATE TABLE lecturas_sensores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    area_id UUID NOT NULL REFERENCES areas_laboratorio(id) ON DELETE CASCADE,
    sensor_id VARCHAR(100), -- ID físico del Arduino/sensor
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    temperatura DECIMAL(5,2),
    humedad DECIMAL(5,2),
    presion DECIMAL(7,2),
    -- Metadatos
    bateria_nivel INT, -- 0-100
    señal_calidad INT, -- 0-100
    firmware_version VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX idx_lecturas_area_fecha ON lecturas_sensores(area_id, fecha_hora DESC);
CREATE INDEX idx_lecturas_sensor_fecha ON lecturas_sensores(sensor_id, fecha_hora DESC);
CREATE INDEX idx_lecturas_fecha ON lecturas_sensores(fecha_hora DESC);

-- ============================================
-- 5. TABLA ALERTAS_HISTORIAL
-- ============================================
CREATE TABLE alertas_historial (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    area_id UUID NOT NULL REFERENCES areas_laboratorio(id) ON DELETE CASCADE,
    lectura_id UUID REFERENCES lecturas_sensores(id) ON DELETE SET NULL,
    tipo_alerta VARCHAR(30) NOT NULL CHECK (tipo_alerta IN ('temperatura', 'humedad', 'presion', 'bateria', 'conexion', 'critica')),
    severidad VARCHAR(20) NOT NULL CHECK (severidad IN ('info', 'advertencia', 'critica')),
    mensaje TEXT NOT NULL,
    valor_actual DECIMAL(10,2),
    valor_esperado_min DECIMAL(10,2),
    valor_esperado_max DECIMAL(10,2),
    -- Notificaciones
    email_enviado BOOLEAN DEFAULT FALSE,
    email_destinatarios TEXT[],
    email_enviado_at TIMESTAMPTZ,
    email_error TEXT,
    -- Resolución
    resuelta BOOLEAN DEFAULT FALSE,
    resuelta_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    resuelta_at TIMESTAMPTZ,
    notas_resolucion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alertas_area_fecha ON alertas_historial(area_id, created_at DESC);
CREATE INDEX idx_alertas_no_resueltas ON alertas_historial(resuelta, severidad) WHERE resuelta = FALSE;
CREATE INDEX idx_alertas_tipo ON alertas_historial(tipo_alerta);

-- ============================================
-- 6. TABLA CORREOS_INSTITUCIONALES
-- ============================================
CREATE TABLE correos_institucionales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    correo VARCHAR(200) UNIQUE NOT NULL,
    nombre_completo VARCHAR(200) NOT NULL,
    cargo VARCHAR(100) NOT NULL,
    departamento VARCHAR(100),
    permisos JSONB DEFAULT '{}',
    rol_sistema VARCHAR(20) CHECK (rol_sistema IN ('admin', 'supervisor', 'operador', 'lectura')),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_correos_cargo ON correos_institucionales(cargo);
CREATE INDEX idx_correos_activo ON correos_institucionales(activo);

-- ============================================
-- 7. TABLA CONFIGURACION_SISTEMA
-- ============================================
CREATE TABLE configuracion_sistema (
    clave VARCHAR(100) PRIMARY KEY,
    valor JSONB NOT NULL,
    descripcion TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. TABLA SESIONES (Refresh tokens)
-- ============================================
CREATE TABLE sesiones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    user_agent TEXT,
    ip VARCHAR(45),
    expira_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sesiones_usuario ON sesiones(usuario_id);
CREATE INDEX idx_sesiones_token ON sesiones(refresh_token_hash);
CREATE INDEX idx_sesiones_expira ON sesiones(expira_at DESC);

-- ============================================
-- FUNCIONES Y TRIGGERS
-- ============================================

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_usuarios_updated_at BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_areas_updated_at BEFORE UPDATE ON areas_laboratorio FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_parametros_updated_at BEFORE UPDATE ON parametros_seguridad FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_correos_updated_at BEFORE UPDATE ON correos_institucionales FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para limpiar sesiones expiradas
CREATE OR REPLACE FUNCTION limpiar_sesiones_expiradas()
RETURNS void AS $$
BEGIN
    DELETE FROM sesiones WHERE expira_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista: Última lectura por área
CREATE OR REPLACE VIEW v_ultima_lectura_area AS
SELECT DISTINCT ON (l.area_id)
    l.area_id,
    a.nombre AS area_nombre,
    a.tipo_area,
    l.fecha_hora,
    l.temperatura,
    l.humedad,
    l.presion,
    l.bateria_nivel,
    l.señal_calidad,
    ps.temp_min, ps.temp_max,
    ps.humedad_min, ps.humedad_max,
    ps.presion_min, ps.presion_max,
    ps.temp_critica_min, ps.temp_critica_max,
    ps.humedad_critica_min, ps.humedad_critica_max,
    ps.presion_critica_min, ps.presion_critica_max
FROM lecturas_sensores l
JOIN areas_laboratorio a ON a.id = l.area_id
LEFT JOIN parametros_seguridad ps ON ps.area_id = a.id
WHERE a.activa = TRUE
ORDER BY l.area_id, l.fecha_hora DESC;

-- Vista: Estado actual de áreas (para dashboard)
CREATE OR REPLACE VIEW v_estado_areas AS
SELECT
    a.id AS area_id,
    a.nombre,
    a.tipo_area,
    a.imagen_url,
    ul.fecha_hora AS ultima_lectura,
    ul.temperatura,
    ul.humedad,
    ul.presion,
    CASE
        WHEN ul.temperatura IS NULL THEN 'sin_datos'
        WHEN (ul.temp_critica_min IS NOT NULL AND (ul.temperatura < ul.temp_critica_min OR ul.temperatura > ul.temp_critica_max)) THEN 'critica'
        WHEN ul.temperatura < ul.temp_min OR ul.temperatura > ul.temp_max THEN 'irregular'
        WHEN ul.humedad < ul.humedad_min OR ul.humedad > ul.humedad_max THEN 'irregular'
        WHEN ul.presion < ul.presion_min OR ul.presion > ul.presion_max THEN 'irregular'
        ELSE 'estable'
    END AS estado,
    ul.bateria_nivel
FROM areas_laboratorio a
LEFT JOIN v_ultima_lectura_area ul ON ul.area_id = a.id
WHERE a.activa = TRUE;

-- Vista: Alertas pendientes con info de área
CREATE OR REPLACE VIEW v_alertas_pendientes AS
SELECT
    ah.*,
    a.nombre AS area_nombre,
    a.tipo_area,
    u.nombre AS resuelta_por_nombre
FROM alertas_historial ah
JOIN areas_laboratorio a ON a.id = ah.area_id
LEFT JOIN usuarios u ON u.id = ah.resuelta_por
WHERE ah.resuelta = FALSE
ORDER BY
    CASE ah.severidad WHEN 'critica' THEN 1 WHEN 'advertencia' THEN 2 ELSE 3 END,
    ah.created_at DESC;

-- ============================================
-- DATOS INICIALES (SEED)
-- ============================================

-- Áreas de laboratorio Siegfried
INSERT INTO areas_laboratorio (nombre, sensor_id, descripcion, tipo_area, imagen_url) VALUES
('Mezcla Líquidos', 'ARD-MEZCLA-LÍQUIDOS-01', 'Área de preparación y mezcla de soluciones acuosas y jarabes', 'liquidos', '/images/areas/mezcla-liquidos.jpg'),
('Mezcla Sólidos', 'ARD-MEZCLA-SÓLIDOS-01', 'Área de granulación, secado y mezcla de polvos y tabletas', 'solidos', '/images/areas/mezcla-solidos.jpg'),
('Estériles', 'ARD-ESTÉRILES-01', 'Área de fabricación aséptica y llenado estéril', 'esteriles', '/images/areas/esteriles.jpg'),
('Semisólidos', 'ARD-SEMISÓLIDOS-01', 'Área de cremas, ungüentos y geles', 'semisolidos', '/images/areas/semisolidos.jpg'),
('Control Calidad', 'ARD-CONTROL-CALIDAD-01', 'Laboratorio de control de calidad fisicoquímico y microbiológico', 'control_calidad', '/images/areas/control-calidad.jpg'),
('Almacén Materias Primas', 'ARD-ALMACÉN-MP-01', 'Almacén de materias primas y excipientes', 'almacen', '/images/areas/almacen-mp.jpg'),
('Almacén Producto Terminado', 'ARD-ALMACÉN-PT-01', 'Almacén de producto terminado a temperatura controlada', 'almacen', '/images/areas/almacen-pt.jpg')
ON CONFLICT (nombre) DO NOTHING;

-- Parámetros de seguridad por área (rangos típicos farmacéuticos)
INSERT INTO parametros_seguridad (area_id, temp_min, temp_max, humedad_min, humedad_max, presion_min, presion_max, temp_critica_min, temp_critica_max, humedad_critica_min, humedad_critica_max, presion_critica_min, presion_critica_max)
SELECT id,
    CASE nombre
        WHEN 'Mezcla Líquidos' THEN 18 WHEN 'Mezcla Sólidos' THEN 20 WHEN 'Estériles' THEN 18
        WHEN 'Semisólidos' THEN 19 WHEN 'Control Calidad' THEN 20 WHEN 'Almacén Materias Primas' THEN 15
        WHEN 'Almacén Producto Terminado' THEN 15 ELSE 18 END,
    CASE nombre
        WHEN 'Mezcla Líquidos' THEN 25 WHEN 'Mezcla Sólidos' THEN 28 WHEN 'Estériles' THEN 22
        WHEN 'Semisólidos' THEN 26 WHEN 'Control Calidad' THEN 25 WHEN 'Almacén Materias Primas' THEN 25
        WHEN 'Almacén Producto Terminado' THEN 25 ELSE 32 END,
    CASE nombre
        WHEN 'Mezcla Líquidos' THEN 30 WHEN 'Mezcla Sólidos' THEN 35 WHEN 'Estériles' THEN 20
        WHEN 'Semisólidos' THEN 40 WHEN 'Control Calidad' THEN 30 WHEN 'Almacén Materias Primas' THEN 40
        WHEN 'Almacén Producto Terminado' THEN 45 ELSE 65 END,
    CASE nombre
        WHEN 'Mezcla Líquidos' THEN 55 WHEN 'Mezcla Sólidos' THEN 60 WHEN 'Estériles' THEN 45
        WHEN 'Semisólidos' THEN 60 WHEN 'Control Calidad' THEN 60 WHEN 'Almacén Materias Primas' THEN 60
        WHEN 'Almacén Producto Terminado' THEN 60 ELSE 65 END,
    10, 15,
    16, 27,  -- criticas temp
    25, 70,  -- criticas humedad
    8, 18    -- criticas presion
FROM areas_laboratorio
ON CONFLICT (area_id) DO NOTHING;

-- Usuario admin por defecto (password: admin123 - cambiar en producción!)
INSERT INTO usuarios (nombre, correo_institucional, password_hash, rol)
VALUES ('Administrador Sistema', 'admin@siegfried.com', '$2a$10$X7w5z8K9vL2mN3pQ4rR5sT6uV7wX8yZ9aB0cD1eF2gH3iJ4kL5mN6o', 'admin')
ON CONFLICT (correo_institucional) DO NOTHING;

-- Configuración inicial del sistema
INSERT INTO configuracion_sistema (clave, valor, descripcion) VALUES
('alertas_email_habilitadas', 'true'::jsonb, 'Activar/desactivar envío de emails de alerta'),
('alertas_check_interval_minutos', '5'::jsonb, 'Intervalo en minutos para chequear umbrales'),
('lecturas_retencion_dias', '365'::jsonb, 'Días de retención de lecturas'),
('dashboard_refresh_segundos', '10'::jsonb, 'Intervalo de actualización automática del dashboard'),
('max_lecturas_por_pagina', '100'::jsonb, 'Límite de registros en tablas paginadas')
ON CONFLICT (clave) DO NOTHING;