// ============================================
// PHARMA MONITOR - SERVICIO DE EMAIL (Nodemailer)
// ============================================

import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

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
        rejectUnauthorized: false, // Para desarrollo con certificados self-signed
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

export async function sendAlertEmail({ areaNombre, tipoAlerta, severidad, mensaje, valorActual, valorMin, valorMax, fecha, destinatarios }) {
  const transporter = getTransporter();

  const colorMap = {
    info: config.siegfriedColors.grisMedio,
    advertencia: config.siegfriedColors.amarilloAdvertencia,
    critica: config.siegfriedColors.rojoCritico,
  };

  const color = colorMap[severidad] || config.siegfriedColors.grisMedio;
  const iconMap = { info: 'ℹ️', advertencia: '⚠️', critica: '🚨' };
  const icon = iconMap[severidad] || 'ℹ️';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, ${config.siegfriedColors.vinotinto} 0%, ${config.siegfriedColors.rojo} 100%); border-radius: 12px 12px 0 0; padding: 30px 20px; text-align: center;">
          <div style="background: white; border-radius: 50%; width: 60px; height: 60px; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center; font-size: 28px;">🏭</div>
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">Pharma Monitor</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0; font-size: 14px;">Sistema de Monitoreo Ambiental - Siegfried</p>
        </div>

        <!-- Alert Badge -->
        <div style="background: ${color}; color: white; border-radius: 0 0 12px 12px; padding: 15px 20px; text-align: center; font-weight: 600; font-size: 16px;">
          ${icon} ALERTA ${severidad.toUpperCase()} - ${tipoAlerta.toUpperCase()}
        </div>

        <!-- Content -->
        <div style="background: white; border-radius: 0 0 12px 12px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <div style="margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
            <h2 style="margin: 0 0 10px; color: ${config.siegfriedColors.vinotinto}; font-size: 20px;">${areaNombre}</h2>
            <p style="margin: 0; color: #666; font-size: 14px;">${new Date(fecha).toLocaleString('es-ES', { timeZone: 'America/Bogota' })}</p>
          </div>

          <div style="background: #fafafa; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
            <p style="margin: 0 0 15px; color: #333; line-height: 1.6;">${mensaje}</p>

            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 13px;">Valor actual</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${color}; font-size: 16px;">${valorActual} ${getUnit(tipoAlerta)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 13px;">Rango permitido</td>
                <td style="padding: 8px 0; text-align: right; color: #333;">${valorMin} - ${valorMax} ${getUnit(tipoAlerta)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 13px;">Desviación</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${color};">${calculateDeviation(valorActual, valorMin, valorMax)}%</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center;">
            <a href="${config.clientUrl}/alertas" style="display: inline-block; background: linear-gradient(135deg, ${config.siegfriedColors.vinotinto} 0%, ${config.siegfriedColors.rojo} 100%); color: white; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Ver en Dashboard →
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
          <p style="margin: 0;">Sistema Pharma Monitor - Siegfried</p>
          <p style="margin: 5px 0 0;">Este es un correo automático, no responda a este mensaje.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
ALERTA ${severidad.toUpperCase()} - ${tipoAlerta.toUpperCase()}
Área: ${areaNombre}
Fecha: ${new Date(fecha).toLocaleString('es-ES')}
Mensaje: ${mensaje}
Valor actual: ${valorActual} ${getUnit(tipoAlerta)}
Rango permitido: ${valorMin} - ${valorMax} ${getUnit(tipoAlerta)}

Ver en dashboard: ${config.clientUrl}/alertas

---
Sistema Pharma Monitor - Siegfried
  `.trim();

  const mailOptions = {
    from: config.email.from,
    to: destinatarios.join(', '),
    subject: `[Pharma Monitor] ${icon} ${severidad.toUpperCase()}: ${tipoAlerta} en ${areaNombre}`,
    text,
    html,
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
          ${resumen.map((area, i) => `
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
            <a href="${config.clientUrl}/reportes" style="background: linear-gradient(135deg, ${config.siegfriedColors.vinotinto} 0%, ${config.siegfriedColors.rojo} 100%); color: white; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">
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
  const units = { temperatura: '°C', humedad: '%', presion: 'Pa' };
  return units[tipo] || '';
}

function calculateDeviation(actual, min, max) {
  const range = max - min;
  const center = (min + max) / 2;
  const deviation = Math.abs(actual - center) / (range / 2) * 100;
  return Math.round(deviation);
}

export default { sendAlertEmail, sendDailyReportEmail };