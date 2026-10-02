// ============================================
// PHARMA MONITOR - README DE INSTALACIÓN
// ============================================

# Pharma Monitor - Sistema de Monitoreo Ambiental Farmacéutico
**Siegfried** - Profesionalización completa

## 📋 Estructura del Proyecto

```
pharma-monitor/
├── package.json              # Backend (Node.js + Express)
├── .env                      # Configuración local (NO commitear)
├── .env.example              # Plantilla de configuración
├── src/
│   ├── server.js             # Servidor principal
│   ├── config/index.js       # Configuración centralizada
│   ├── db/
│   │   ├── pool.js           # Conexión PostgreSQL/TimescaleDB
│   │   ├── init.js           # Inicializar esquema BD
│   │   └── seed.js           # Datos de prueba
│   ├── routes/
│   │   ├── auth.routes.js    # Login, JWT, usuarios
│   │   ├── areas.routes.js   # CRUD áreas + parámetros
│   │   ├── sensores.routes.js# Lecturas Arduino + export
│   │   ├── alertas.routes.js # Alertas + resolución
│   │   └── reportes.routes.js# PDF, dashboard data
│   ├── services/
│   │   ├── socket.service.js # WebSocket (tiempo real)
│   │   └── threshold.service.js # Cron jobs + alertas email
│   ├── middleware/
│   │   ├── auth.middleware.js    # JWT + roles
│   │   └── validation.middleware.js # express-validator
│   └── utils/
│       ├── email.js        # Nodemailer (Outlook/Gmail)
│       └── pdf.js          # PDFKit reportes
├── database/
│   └── schema.sql          # Esquema completo (ver abajo)
├── frontend/
│   ├── package.json        # React + Vite
│   ├── vite.config.js      # Config Vite + proxy
│   ├── index.html          # HTML base
│   └── src/
│       ├── main.jsx        # Entry point + AuthProvider
│       ├── App.jsx         # Rutas + PrivateRoute
│       ├── context/
│       │   └── AuthContext.jsx
│       ├── services/
│       │   └── api.js      # Axios + WebSocket
│       ├── components/
│       │   ├── Layout.jsx  # Sidebar + header
│       │   └── LoadingScreen.jsx
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   ├── Areas.jsx
│       │   ├── AreaDetail.jsx
│       │   ├── Values.jsx
│       │   ├── Alerts.jsx
│       │   ├── Users.jsx
│       │   └── Settings.jsx
│       └── styles/
│           └── index.css   # Design System Siegfried
└── database/schema.sql     # Esquema BD completo
```

## 🚀 Instalación Rápida

### 1. Backend
```bash
cd pharma-monitor
npm install
cp .env.example .env
# Edita .env con tus credenciales (DB, JWT, Email, Arduino)
npm run db:init   # Crea tablas en PostgreSQL
npm run db:seed   # Datos de prueba (opcional)
npm run dev       # Servidor en http://localhost:3000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev       # Vite en http://localhost:5173
```

### 3. Base de Datos (PostgreSQL + TimescaleDB)
```sql
-- Ejecutar en psql o pgAdmin:
\i database/schema.sql
```

## 🔧 Configuración (.env)

```env
# Servidor
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# PostgreSQL / TimescaleDB
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pharma_monitor
DB_USER=postgres
DB_PASSWORD=tu_password
DB_SSL=false

# JWT (cambia en producción!)
JWT_SECRET=clave_muy_larga_y_segura
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=otra_clave_segura
JWT_REFRESH_EXPIRES_IN=7d

# Email (Outlook 365 / Gmail)
EMAIL_HOST=smtp.office365.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=alertas@siegfried.com
EMAIL_PASS=tu_password_o_app_password
EMAIL_FROM="Pharma Monitor <noreply@siegfried.com>"
ALERT_EMAILS=gerente@siegfried.com,supervisor@siegfried.com

# Arduino
ARDUINO_API_KEY=clave_secreta_arduino
ARDUINO_PUSH_INTERVAL_MS=5000
```

## 🎨 Design System (Siegfried)

Colores CSS variables en `frontend/src/styles/index.css`:
```css
--wine: #7a1530;      /* Vinotinto principal */
--wine2: #5a0f24;     /* Vinotinto oscuro */
--red: #c8102e;       /* Rojo acento */
--bg: #f4f3f2;        /* Fondo claro */
--card: #fff;         /* Tarjetas */
--ink: #231f20;       /* Texto principal */
--mut: #6d6768;       /* Texto muted */
--line: #e3dfdd;      /* Bordes */
--ok: #1f9d55;        /* Verde éxito */
--warn: #d98e04;      /* Amarillo advertencia */
--bad: #d41f3a;       /* Rojo crítico */
```

## 📡 API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login (JWT + refresh) |
| POST | `/api/auth/refresh` | Renovar access token |
| GET | `/api/auth/me` | Usuario actual |
| GET | `/api/areas` | Listar áreas + parámetros |
| GET | `/api/areas/estado` | Estado actual (dashboard) |
| GET | `/api/areas/:id` | Detalle área |
| POST | `/api/areas` | Crear área (Supervisor+) |
| PATCH | `/api/areas/:id` | Actualizar área |
| PUT | `/api/areas/:id/parametros` | Guardar rangos |
| POST | `/api/sensores/lectura` | **Arduino push** (API Key) |
| GET | `/api/sensores/lecturas` | Historial paginado |
| GET | `/api/sensores/lecturas/stats` | Stats para gráficas |
| GET | `/api/sensores/lecturas/export` | Export CSV |
| GET | `/api/alertas` | Alertas paginadas |
| GET | `/api/alertas/pendientes` | Alertas activas |
| PATCH | `/api/alertas/:id/resolver` | Marcar resuelta |
| GET | `/api/reportes/pdf` | Generar PDF |
| GET | `/api/reportes/dashboard-data` | Data completa dashboard |

## 🔌 Arduino / ESP32 - Envío de Datos

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "TU_WIFI";
const char* password = "TU_PASSWORD";
const char* server = "http://TU_IP:3000/api/sensores/lectura";
const char* apiKey = "clave_secreta_arduino"; // Igual que ARDUINO_API_KEY

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

void loop() {
  float temp = leerTemperatura();    // Tu sensor DHT22/DS18B20
  float hum = leerHumedad();
  float pres = leerPresion();        // Tu sensor BMP280

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(server);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", apiKey);

    StaticJsonDocument<200> doc;
    doc["sensor_id"] = "ARD-MEZCLA-LIQUIDOS-01";
    doc["temperatura"] = temp;
    doc["humedad"] = hum;
    doc["presion"] = pres;
    doc["bateria_nivel"] = 95;
    doc["senal_calidad"] = 98;
    doc["firmware_version"] = "v1.2.0";

    String json;
    serializeJson(doc, json);
    int code = http.POST(json);
    http.end();
  }
  delay(5000); // 5 seg
}
```

## 👥 Usuarios por Defecto (tras `npm run db:seed`)

| Rol | Email | Password |
|-----|-------|----------|
| Admin | admin@siegfried.com | admin123 |
| Supervisor | juan.perez@siegfried.com | usuario123 |
| Operador | maria.garcia@siegfried.com | usuario123 |
| Usuario | carlos.lopez@siegfried.com | usuario123 |
| Lectura | ana.martinez@siegfried.com | usuario123 |

## 📊 Esquema BD (Resumen)

```sql
-- 1. Usuarios del sistema
usuarios (id, nombre, correo_institucional, password_hash, rol, activo)

-- 2. Áreas de laboratorio
areas_laboratorio (id, nombre, descripcion, tipo_area, imagen_url, activa)

-- 3. Parámetros de seguridad por área
parametros_seguridad (area_id, temp_min/max, humedad_min/max, presion_min/max, 
                      temp_critica_min/max, notificar_email, ...)

-- 4. Lecturas de sensores (HYPERTABLE TimescaleDB)
lecturas_sensores (id, area_id, sensor_id, fecha_hora, temperatura, humedad, presion, 
                   bateria_nivel, señal_calidad, firmware_version)

-- 5. Historial de alertas
alertas_historial (id, area_id, tipo_alerta, severidad, mensaje, valor_actual, 
                   valor_esperado_min/max, email_enviado, resuelta, ...)

-- 6. Correos institucionales con permisos
correos_institucionales (id, correo, nombre_completo, cargo, departamento, 
                         permisos JSONB, rol_sistema)

-- Vistas útiles:
v_estado_areas, v_ultima_lectura_area, v_alertas_pendientes
```

## 🔐 Roles y Permisos

| Rol | Dashboard | Áreas | Valores | Alertas | Usuarios | Config |
|-----|-----------|-------|---------|---------|----------|--------|
| Admin | ✅ | ✅ CRUD | ✅ | ✅ | ✅ CRUD | ✅ |
| Supervisor | ✅ | ✅ CRUD | ✅ | ✅ Resolver | ❌ | ✅ |
| Operador | ✅ | ✅ Ver | ✅ | ✅ Ver | ❌ | ❌ |
| Usuario | ✅ | ✅ Ver | ✅ | ❌ | ❌ | ❌ |
| Lectura | ✅ | ✅ Ver | ✅ Ver | ❌ | ❌ | ❌ |

## 📱 Funcionalidades Principales

1. **Dashboard en tiempo real** - WebSocket para lecturas y alertas instantáneas
2. **Gestión de áreas** - CRUD con foto, rangos personalizados por tipo
3. **Monitoreo histórico** - Filtros por área/fecha, export CSV
4. **Sistema de alertas** - Auto (thresholds) + manual, email Outlook/Gmail
5. **Reportes PDF** - Profesionales con branding Siegfried
6. **Admin panel** - Usuarios, correos institucionales, configuración
7. **Responsive** - Funciona en tablet/móvil (responsive sidebar)

## 🏭 Producción

```bash
# Backend
NODE_ENV=production npm start

# Frontend
cd frontend && npm run build
# Servir dist/ con nginx + proxy_pass a :3000
```

## 📝 Próximos Pasos Sugeridos

- [ ] Tests unitarios (Jest + React Testing Library)
- [ ] CI/CD (GitHub Actions)
- [ ] Docker Compose (backend + frontend + postgres + timescale)
- [ ] PWA para uso offline en tablets de planta
- [ ] Integración OPC-UA / Modbus para PLCs industriales

---

**Desarrollado para Laboratorios Siegfried**  
Monitoreo ambiental GMP-ready con trazabilidad completa.