// ============================================
// PHARMA MONITOR - SERVICIO DE EMAIL (Nodemailer)
// ============================================

import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { query } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_PATH = path.resolve(__dirname, '../../frontend/public/logo-siegfried.png');

let transporter = null;

export function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // Verificar conexión
    transporter.verify((error) => {
      if (error) {
        console.error('❌ Email transporter error:', error.message);
      } else { 
        console.log('📧 Servidor de email listo:', config.email.host);
      }
    });
  }
  return transporter;
}

function getLogoAttachment() {
  try {
    if (fs.existsSync(LOGO_PATH)) {
      return [{
        filename: 'logo-siegfried.png',
        path: LOGO_PATH,
        cid: 'siegfried-logo',
      }];
    }
  } catch { /* ignore */ }
  return [];
}

export async function sendAlertEmail({ areaNombre, tipoAlerta, severidad, mensaje, valorActual, valorMin, valorMax, sensorId, fecha, destinatarios }) {
  try {
    const cfgRes = await query("SELECT valor FROM configuracion_sistema WHERE clave = 'email_alertas_activo' LIMIT 1");
    if (cfgRes.rows.length > 0 && String(cfgRes.rows[0].valor).trim().toLowerCase() === 'false') {
      console.log('🔕 Envío de correo omitido: email_alertas_activo está en false');
      return { success: false, disabled: true, error: 'Envío de correos desactivado temporalmente' };
    }
  } catch { /* continue if table check fails */ }

  const transporter = getTransporter();

  const colorMap = {
    info: config.siegfriedColors.grisMedio,
    advertencia: config.siegfriedColors.amarilloAdvertencia,
    critica: config.siegfriedColors.rojoCritico,
  };

  const color = colorMap[severidad] || config.siegfriedColors.rojoCritico;
  const isWatchdog = String(tipoAlerta || '').toLowerCase().includes('desconexion') || String(tipoAlerta || '').toLowerCase().includes('watchdog');
  const iconMap = { info: 'ℹ️', advertencia: '⚠️', critica: isWatchdog ? '🔌' : '🚨' };
  const icon = iconMap[severidad] || '🚨';
  const attachments = getLogoAttachment();
  const hasLogo = attachments.length > 0;

  const badgeTitle = isWatchdog
    ? `${icon} ALERTA TÉCNICA - NODO ARDUINO SIN CONEXIÓN`
    : `${icon} ALERTA ${String(severidad || 'CRITICA').toUpperCase()} - ${String(tipoAlerta || 'TEMPERATURA').toUpperCase()}`;

  const metricsRows = isWatchdog
    ? `
      <tr>
        <td style="padding: 10px 0; color: #666; font-size: 13px; border-bottom: 1px solid #eee;">Estado del Nodo ESP32</td>
        <td style="padding: 10px 0; text-align: right; font-weight: 700; color: ${color}; font-size: 15px; border-bottom: 1px solid #eee;">🔌 SIN CONEXIÓN (OFFLINE)</td>
      </tr>
      ${sensorId ? `
      <tr>
        <td style="padding: 10px 0; color: #666; font-size: 13px; border-bottom: 1px solid #eee;">Identificador de Hardware</td>
        <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #333; font-family: monospace; font-size: 14px; border-bottom: 1px solid #eee;">${sensorId}</td>
      </tr>` : ''}
      <tr>
        <td style="padding: 10px 0; color: #666; font-size: 13px; border-bottom: 1px solid #eee;">Tiempo sin reportar</td>
        <td style="padding: 10px 0; text-align: right; font-weight: 700; color: ${color}; font-size: 15px; border-bottom: 1px solid #eee;">${valorActual ?? '--'} min</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; color: #666; font-size: 13px;">Umbral máximo Watchdog</td>
        <td style="padding: 10px 0; text-align: right; color: #333; font-weight: 600;">${valorMax ?? 10} min</td>
      </tr>
    `
    : `
      <tr>
        <td style="padding: 10px 0; color: #666; font-size: 13px; border-bottom: 1px solid #eee;">Valor actual registrado</td>
        <td style="padding: 10px 0; text-align: right; font-weight: 700; color: ${color}; font-size: 16px; border-bottom: 1px solid #eee;">${valorActual} ${getUnit(tipoAlerta)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; color: #666; font-size: 13px; border-bottom: 1px solid #eee;">Rango permitido (GMP)</td>
        <td style="padding: 10px 0; text-align: right; color: #333; font-weight: 600; border-bottom: 1px solid #eee;">${valorMin} - ${valorMax} ${getUnit(tipoAlerta)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; color: #666; font-size: 13px;">Desviación</td>
        <td style="padding: 10px 0; text-align: right; font-weight: 700; color: ${color};">${calculateDeviation(valorActual, valorMin, valorMax)}%</td>
      </tr>
    `;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f1f2;">
      <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
        <!-- Header Corporativo Siegfried -->
        <div style="background: linear-gradient(135deg, ${config.siegfriedColors.vinotinto} 0%, ${config.siegfriedColors.rojo} 100%); border-radius: 14px 14px 0 0; padding: 28px 24px; text-align: center;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto 14px;">
            <tr>
              <td align="center" valign="middle" style="background-color: #ffffff; border-radius: 10px; padding: 10px 22px; box-shadow: 0 4px 14px rgba(0,0,0,0.22);">
                ${hasLogo
                  ? `<img src="cid:siegfried-logo" alt="Laboratorios Siegfried" width="210" style="display: block; max-width: 210px; height: auto; border: 0; margin: 0 auto;" />`
                  : `<span style="font-size: 18px; font-weight: 800; color: ${config.siegfriedColors.vinotinto}; letter-spacing: 1px;">LABORATORIOS SIEGFRIED</span>`
                }
              </td>
            </tr>
          </table>
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.2px;">Pharma Monitor</h1>
          <p style="color: rgba(255,255,255,0.92); margin: 6px 0 0; font-size: 14px;">Sistema de Monitoreo Ambiental · Laboratorios Siegfried</p>
        </div>

        <!-- Alert Badge -->
        <div style="background: ${color}; color: #ffffff; padding: 14px 20px; text-align: center; font-weight: 700; font-size: 15px; letter-spacing: 0.4px;">
          ${badgeTitle}
        </div>

        <!-- Content -->
        <div style="background: #ffffff; border-radius: 0 0 14px 14px; padding: 30px; box-shadow: 0 6px 24px rgba(0,0,0,0.08);">
          <div style="margin-bottom: 22px; padding-bottom: 18px; border-bottom: 1px solid #eee;">
            <h2 style="margin: 0 0 8px; color: ${config.siegfriedColors.vinotinto}; font-size: 21px;">${areaNombre}</h2>
            <p style="margin: 0; color: #666; font-size: 13.5px;">${new Date(fecha || Date.now()).toLocaleString('es-ES', { timeZone: 'America/Caracas' })}</p>
          </div>

          <div style="background: #faf8f9; border: 1px solid #f0e8ea; border-radius: 10px; padding: 20px; margin-bottom: 26px;">
            <p style="margin: 0 0 16px; color: #2b2628; line-height: 1.6; font-size: 14.5px;">${mensaje}</p>

            <table style="width: 100%; border-collapse: collapse;">
              ${metricsRows}
            </table>
          </div>

          <div style="text-align: center;">
            <a href="${config.clientUrl}/alerts" style="display: inline-block; background: linear-gradient(135deg, ${config.siegfriedColors.vinotinto} 0%, ${config.siegfriedColors.rojo} 100%); color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Abrir Panel de Control →
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
          <p style="margin: 0; font-weight: 600;">Sistema Pharma Monitor · Laboratorios Siegfried</p>
          <p style="margin: 5px 0 0;">Notificación automática generada por el sistema de control ambiental y telemetría ESP32.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
${badgeTitle}
Área: ${areaNombre}
Fecha: ${new Date(fecha || Date.now()).toLocaleString('es-ES')}
Mensaje: ${mensaje}
${isWatchdog ? `Tiempo sin conexión: ${valorActual} min (Límite: ${valorMax} min)` : `Valor actual: ${valorActual} ${getUnit(tipoAlerta)} (Rango: ${valorMin ?? 0} - ${valorMax ?? 0} ${getUnit(tipoAlerta)})`}

Ver en dashboard: ${config.clientUrl}/alerts

---
Sistema Pharma Monitor - Laboratorios Siegfried
  `.trim();

  const cleanDestinatarios = (Array.isArray(destinatarios) ? destinatarios : [])
    .map(e => String(e || '').trim().toLowerCase())
    .filter(e => e && !EXCLUDED_RECIPIENTS.has(e));

  const mailOptions = {
    from: config.email.from,
    to: cleanDestinatarios.join(', '),
    subject: isWatchdog
      ? `[Pharma Monitor] 🔌 SIN CONEXIÓN: Nodo Arduino en ${areaNombre}`
      : `[Pharma Monitor] ${icon} ${String(severidad || 'CRITICA').toUpperCase()}: ${tipoAlerta} en ${areaNombre}`,
    text,
    html,
    attachments,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('📧 Email de alerta enviado:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error enviando email:', error);
    return { success: false, error: error.message };
  }
}

export async function sendDailyReportEmail({ destinatarios, resumen, fecha }) {
  const transporter = getTransporter();

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
        <div style="background: linear-gradient(135deg, ${config.siegfriedColors.vinotinto} 0%, ${config.siegfriedColors.rojo} 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 22px;">📊 Reporte Diario Pharma Monitor</h1>
          <p style="margin: 10px 0 0; opacity: 0.9;">${new Date(fecha).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div style="padding: 30px;">
          ${resumen.map((area) => `
            <div style="border: 1px solid #eee; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
              <h3 style="margin: 0 0 15px; color: ${config.siegfriedColors.vinotinto};">${area.nombre}</h3>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                <div style="text-align: center; padding: 10px; background: ${area.tempEstado === 'estable' ? '#e8f5e9' : '#fdeaea'}; border-radius: 6px;">
                  <div style="font-size: 12px; color: #666;">Temp</div>
                  <div style="font-weight: 600; color: ${area.tempEstado === 'estable' ? '#27ae60' : '#e74c3c'};">${area.tempPromedio}°C</div>
                </div>
                <div style="text-align: center; padding: 10px; background: ${area.humEstado === 'estable' ? '#e8f5e9' : '#fdeaea'}; border-radius: 6px;">
                  <div style="font-size: 12px; color: #666;">Humedad</div>
                  <div style="font-weight: 600; color: ${area.humEstado === 'estable' ? '#27ae60' : '#e74c3c'};">${area.humPromedio}%</div>
                </div>
                <div style="text-align: center; padding: 10px; background: ${area.presEstado === 'estable' ? '#e8f5e9' : '#fdeaea'}; border-radius: 6px;">
                  <div style="font-size: 12px; color: #666;">Presión</div>
                  <div style="font-weight: 600; color: ${area.presEstado === 'estable' ? '#27ae60' : '#e74c3c'};">${area.presPromedio} Pa</div>
                </div>
              </div>
              ${area.alertas > 0 ? `<p style="margin: 15px 0 0; color: ${config.siegfriedColors.rojoCritico}; font-size: 13px;">⚠️ ${area.alertas} alerta(s) en el período</p>` : ''}
            </div>
          `).join('')}
          <div style="text-align: center; margin-top: 30px;">
            <a href="${config.clientUrl}/analytics" style="background: linear-gradient(135deg, ${config.siegfriedColors.vinotinto} 0%, ${config.siegfriedColors.rojo} 100%); color: white; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Ver Dashboard Completo →
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: config.email.from,
      to: destinatarios.join(', '),
      subject: `📊 Reporte Diario Pharma Monitor - ${new Date(fecha).toLocaleDateString('es-ES')}`,
      html,
    });
    console.log('📧 Reporte diario enviado');
    return { success: true };
  } catch (error) {
    console.error('❌ Error enviando reporte:', error);
    return { success: false, error: error.message };
  }
}

function getUnit(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t.includes('temp') || t.includes('emergencia') || t.includes('simul')) return '°C';
  if (t.includes('hum')) return '%';
  if (t.includes('pres')) return 'Pa';
  return '';
}

function calculateDeviation(actual, min, max) {
  const a = Number(actual) || 0;
  const mn = Number(min) || 0;
  const mx = Number(max) || 0;
  const range = mx - mn;
  if (range <= 0) return 100;
  const center = (mn + mx) / 2;
  const deviation = (Math.abs(a - center) / (range / 2)) * 100;
  return Math.round(deviation);
}

const EXCLUDED_RECIPIENTS = new Set([
  'admin@siegfried.com',
  'noreply@siegfried.com',
]);

export async function getRecipientsForArea(areaId) {
  const recipients = new Set();

  const addEmail = (raw) => {
    if (!raw) return;
    const clean = String(raw).trim().toLowerCase();
    if (clean && !EXCLUDED_RECIPIENTS.has(clean)) {
      recipients.add(clean);
    }
  };

  try {
    // 1. Gerente General / Admin: recibe TODAS las alertas de TODAS las áreas
    const admins = await query(
      "SELECT correo_institucional FROM usuarios WHERE LOWER(rol) = 'admin' AND (activo = true OR activo IS NULL)"
    );
    admins.rows.forEach(r => addEmail(r.correo_institucional));

    // 2. Personal asignado a esta área (Supervisor / Encargado u Operador del área)
    if (areaId) {
      const areaUsers = await query(
        "SELECT correo_institucional FROM usuarios WHERE area_id = $1 AND (activo = true OR activo IS NULL)",
        [areaId]
      );
      areaUsers.rows.forEach(r => addEmail(r.correo_institucional));

      // 3. Correos institucionales registrados específicamente para esta área o de alcance global (Gerente General)
      const instEmails = await query(
        "SELECT correo FROM correos_institucionales WHERE (activo = true OR activo IS NULL) AND (area_id = $1 OR area_id IS NULL OR LOWER(cargo) LIKE '%gerente%')",
        [areaId]
      );
      instEmails.rows.forEach(r => addEmail(r.correo));
    } else {
      const globalEmails = await query(
        "SELECT correo FROM correos_institucionales WHERE (activo = true OR activo IS NULL) AND (area_id IS NULL OR LOWER(cargo) LIKE '%gerente%')"
      );
      globalEmails.rows.forEach(r => addEmail(r.correo));
    }
  } catch (err) {
    console.error('Error obteniendo destinatarios segmentados por área:', err);
  }

  // 4. Si la lista está vacía, usar configuración de respaldo
  if (recipients.size === 0) {
    if (process.env.ALERT_EMAILS) {
      process.env.ALERT_EMAILS.split(',').forEach(e => addEmail(e));
    } else if (process.env.EMAIL_USER) {
      addEmail(process.env.EMAIL_USER);
    }
  }

  return Array.from(recipients).filter(Boolean);
}

export default { sendAlertEmail, sendDailyReportEmail, getRecipientsForArea };