// ============================================
// PHARMA MONITOR - DATOS DE PRUEBA (SEED)
// Ejecutar con: npm run db:seed
// ============================================

import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { config } from '../config/index.js';

async function seedDatabase() {
  console.log('🌱 Insertando datos de prueba...');

  try {
    // 1. Usuarios de prueba
    const passwordHash = await bcrypt.hash('admin123', 10);
    const userPasswordHash = await bcrypt.hash('usuario123', 10);

    const usuarios = [
      { nombre: 'Admin Principal', correo: 'admin@siegfried.com', password: passwordHash, rol: 'admin' },
      { nombre: 'Juan Pérez', correo: 'juan.perez@siegfried.com', password: userPasswordHash, rol: 'supervisor' },
      { nombre: 'María García', correo: 'maria.garcia@siegfried.com', password: userPasswordHash, rol: 'operador' },
      { nombre: 'Carlos López', correo: 'carlos.lopez@siegfried.com', password: userPasswordHash, rol: 'usuario' },
      { nombre: 'Ana Martínez', correo: 'ana.martinez@siegfried.com', password: userPasswordHash, rol: 'lectura' },
    ];

    for (const u of usuarios) {
      await pool.query(
        `INSERT INTO usuarios (nombre, correo_institucional, password_hash, rol)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (correo_institucional) DO NOTHING`,
        [u.nombre, u.correo, u.password, u.rol]
      );
    }
    console.log('  ✅ Usuarios creados');

    // 2. Correos institucionales con permisos
    const correos = [
      { correo: 'gerente.planta@siegfried.com', nombre: 'Roberto Gerente', cargo: 'Gerente de Planta', departamento: 'Dirección', permisos: { areas: 'all', alertas: true, reportes: true, admin: true }, rol: 'admin' },
      { correo: 'supervisor.turno1@siegfried.com', nombre: 'Laura Supervisora', cargo: 'Supervisor Turno 1', departamento: 'Producción', permisos: { areas: ['Mezcla Líquidos', 'Mezcla Sólidos'], alertas: true, reportes: true }, rol: 'supervisor' },
      { correo: 'operador.mezcla@siegfried.com', nombre: 'Pedro Operador', cargo: 'Operador Mezcla', departamento: 'Producción', permisos: { areas: ['Mezcla Líquidos'], alertas: false, reportes: false }, rol: 'operador' },
      { correo: 'calidad@siegfried.com', nombre: 'Equipo Calidad', cargo: 'Analista Calidad', departamento: 'Control Calidad', permisos: { areas: ['Control Calidad'], alertas: true, reportes: true }, rol: 'operador' },
      { correo: 'mantenimiento@siegfried.com', nombre: 'Equipo Mantenimiento', cargo: 'Técnico Mantenimiento', departamento: 'Mantenimiento', permisos: { areas: 'all', alertas: true, reportes: false }, rol: 'operador' },
    ];

    for (const c of correos) {
      await pool.query(
        `INSERT INTO correos_institucionales (correo, nombre_completo, cargo, departamento, permisos, rol_sistema)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (correo) DO NOTHING`,
        [c.correo, c.nombre, c.cargo, c.departamento, JSON.stringify(c.permisos), c.rol]
      );
    }
    console.log('  ✅ Correos institucionales creados');

    // 3. Lecturas de prueba (últimas 24h, cada 10 min por área)
    const areasResult = await pool.query('SELECT id, nombre FROM areas_laboratorio WHERE activa = true');
    const areas = areasResult.rows;

    const now = new Date();
    const lecturas = [];

    for (const area of areas) {
      // Obtener parámetros de esa área
      const paramsResult = await pool.query('SELECT * FROM parametros_seguridad WHERE area_id = $1', [area.id]);
      const params = paramsResult.rows[0] || {
        temp_min: 18, temp_max: 32,
        humedad_min: 30, humedad_max: 65,
        presion_min: 10, presion_max: 15
      };

      // Generar lecturas cada 10 minutos por 24h = 144 lecturas por área
      for (let h = 23; h >= 0; h--) {
        for (let m = 50; m >= 0; m -= 10) {
          const fecha = new Date(now);
          fecha.setHours(now.getHours() - h);
          fecha.setMinutes(m);
          fecha.setSeconds(0);
          fecha.setMilliseconds(0);

          // Valores base dentro de rango + variación
          const tempBase = (params.temp_min + params.temp_max) / 2;
          const humBase = (params.humedad_min + params.humedad_max) / 2;
          const presBase = (params.presion_min + params.presion_max) / 2;

          // Agregar variación realista (±10% del rango)
          const tempVar = (Math.random() - 0.5) * (params.temp_max - params.temp_min) * 0.3;
          const humVar = (Math.random() - 0.5) * (params.humedad_max - params.humedad_min) * 0.3;
          const presVar = (Math.random() - 0.5) * (params.presion_max - params.presion_min) * 0.3;

          // Ocasionalmente generar valores fuera de rango (alertas)
          let temp = Math.round((tempBase + tempVar) * 100) / 100;
          let hum = Math.round((humBase + humVar) * 100) / 100;
          let pres = Math.round((presBase + presVar) * 100) / 100;

          // 5% probabilidad de alerta
          if (Math.random() < 0.05) {
            const tipo = Math.floor(Math.random() * 3);
            if (tipo === 0) temp = params.temp_max + Math.random() * 3 + 0.5;
            else if (tipo === 1) hum = params.humedad_max + Math.random() * 10 + 1;
            else pres = params.presion_max + Math.random() * 3 + 0.5;
          }

          lecturas.push([area.id, `ARD-${area.nombre.replace(/\s+/g, '-').toUpperCase()}-01`, fecha, temp, hum, pres, 85 + Math.floor(Math.random() * 15), 90 + Math.floor(Math.random() * 10), 'v1.2.0']);
        }
      }
    }

    // Insertar en batches de 100
    for (let i = 0; i < lecturas.length; i += 100) {
      const batch = lecturas.slice(i, i + 100);
      const values = batch.map((_, idx) => {
        const base = idx * 9;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
      }).join(', ');

      const flatParams = batch.flat();
      await pool.query(
        `INSERT INTO lecturas_sensores (area_id, sensor_id, fecha_hora, temperatura, humedad, presion, bateria_nivel, señal_calidad, firmware_version)
         VALUES ${values}
         ON CONFLICT DO NOTHING`,
        flatParams
      );
    }
    console.log(`  ✅ ${lecturas.length} lecturas de prueba insertadas`);

    // 4. Alertas de prueba
    const alertas = [
      { area_id: areas[0].id, tipo: 'temperatura', severidad: 'advertencia', mensaje: 'Temperatura superior al límite máximo', valor: 33.5, min: 18, max: 32, email: true },
      { area_id: areas[1].id, tipo: 'humedad', severidad: 'critica', mensaje: 'Humedad crítica - riesgo de degradación', valor: 78.2, min: 35, max: 60, email: true },
      { area_id: areas[2].id, tipo: 'presion', severidad: 'advertencia', mensaje: 'Presión por debajo del mínimo', valor: 8.5, min: 10, max: 15, email: false },
    ];

    for (const a of alertas) {
      await pool.query(
        `INSERT INTO alertas_historial (area_id, tipo_alerta, severidad, mensaje, valor_actual, valor_esperado_min, valor_esperado_max, email_enviado, email_destinatarios, email_enviado_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() - INTERVAL '1 hour')
         ON CONFLICT DO NOTHING`,
        [a.area_id, a.tipo, a.severidad, a.mensaje, a.valor, a.min, a.max, a.email, config.email.alertRecipients]
      );
    }
    console.log('  ✅ Alertas de prueba creadas');

    console.log('\n✅ Seed completado exitosamente');
    console.log('\n📋 Credenciales de prueba:');
    console.log('   Admin: admin@siegfried.com / admin123');
    console.log('   Supervisor: juan.perez@siegfried.com / usuario123');
    console.log('   Operador: maria.garcia@siegfried.com / usuario123');
    console.log('   Usuario: carlos.lopez@siegfried.com / usuario123');
    console.log('   Solo lectura: ana.martinez@siegfried.com / usuario123');

  } catch (error) {
    console.error('❌ Error en seed:', error);
  } finally {
    await pool.end();
  }
}

seedDatabase();