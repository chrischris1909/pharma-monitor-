// ============================================
// PHARMA MONITOR - GENERADOR DE PDF (PDFKit)
// ============================================

import PDFDocument from 'pdfkit';
import { config } from '../config/index.js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const colors = {
  vinotinto: '#7B1113',
  rojo: '#C41E3A',
  grisOscuro: '#333333',
  grisMedio: '#666666',
  grisClaro: '#F5F5F5',
  blanco: '#FFFFFF',
  verde: '#27AE60',
  amarillo: '#F39C12',
  rojoCritico: '#E74C3C',
};

export async function generateReportPDF({ areas, fechaDesde, fechaHasta, titulo = 'Reporte de Monitoreo Ambiental' }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'portrait' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ===== HEADER =====
    drawHeader(doc);
    doc.moveDown(2);

    // ===== TÍTULO =====
    doc.fontSize(22).fillColor(colors.vinotinto).font('Helvetica-Bold').text(titulo, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor(colors.grisMedio).font('Helvetica').text(
      `Período: ${format(new Date(fechaDesde), 'dd MMMM yyyy', { locale: es })} - ${format(new Date(fechaHasta), 'dd MMMM yyyy', { locale: es })}`,
      { align: 'center' }
    );
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor(colors.grisMedio).text(
      `Generado: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: es })}`,
      { align: 'center' }
    );
    doc.moveDown(1.5);

    // ===== RESUMEN EJECUTIVO =====
    drawSectionTitle(doc, 'Resumen Ejecutivo');
    const totalAlertas = areas.reduce((sum, a) => sum + a.alertasCount, 0);
    const areasCriticas = areas.filter(a => a.estadoGeneral === 'critica').length;
    const areasIrregulares = areas.filter(a => a.estadoGeneral === 'irregular').length;
    const areasEstables = areas.filter(a => a.estadoGeneral === 'estable').length;

    const resumenData = [
      ['Áreas monitoreadas', areas.length.toString()],
      ['Áreas estables', areasEstables.toString()],
      ['Áreas irregulares', areasIrregulares.toString()],
      ['Áreas críticas', areasCriticas.toString()],
      ['Total alertas', totalAlertas.toString()],
    ];
    drawTable(doc, resumenData, { colWidths: [200, 100], headerColor: colors.vinotinto });
    doc.moveDown(1.5);

    // ===== DETALLE POR ÁREA =====
    drawSectionTitle(doc, 'Detalle por Área');

    for (const area of areas) {
      drawAreaCard(doc, area);
      doc.moveDown(1);
    }

    // ===== FOOTER =====
    doc.moveDown(2);
    drawFooter(doc);

    doc.end();
  });
}

function drawHeader(doc) {
  // Línea superior
    doc.moveTo(50, 40).lineTo(545, 40).strokeColor(colors.vinotinto).lineWidth(3).stroke();

  // Logo + nombre
  doc.fontSize(10).fillColor(colors.vinotinto).font('Helvetica-Bold').text('SIEGFRIED', 50, 50);
  doc.fontSize(8).fillColor(colors.rojo).font('Helvetica').text('Pharma Monitor', 50, 62);

  // Fecha generación derecha
  const fechaStr = format(new Date(), 'dd/MM/yyyy HH:mm');
  doc.fontSize(8).fillColor(colors.grisMedio).font('Helvetica').text(fechaStr, 450, 50, { width: 100, align: 'right' });

  doc.moveDown(1);
}

function drawFooter(doc) {
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    const pageHeight = doc.page.height;
    doc.moveTo(50, pageHeight - 40).lineTo(545, pageHeight - 40).strokeColor('#ddd').lineWidth(0.5).stroke();
    doc.fontSize(7).fillColor(colors.grisMedio).font('Helvetica')
      .text(`Pharma Monitor - Sistema de Monitoreo Ambiental - Siegfried | Página ${i + 1} de ${pageCount}`, 50, pageHeight - 35, { width: 495, align: 'center' });
  }
}

function drawSectionTitle(doc, title) {
  doc.fontSize(14).fillColor(colors.vinotinto).font('Helvetica-Bold').text(title);
  doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor(colors.rojo).lineWidth(1.5).stroke();
  doc.moveDown(0.8);
}

function drawAreaCard(doc, area) {
  // Estado badge
  const estadoColor = {
    estable: colors.verde,
    irregular: colors.amarillo,
    critica: colors.rojoCritico,
    sin_datos: colors.grisMedio,
  }[area.estadoGeneral] || colors.grisMedio;

  // Nombre área + badge
  doc.fontSize(12).fillColor(colors.grisOscuro).font('Helvetica-Bold').text(area.nombre, 50, doc.y);
  const nameWidth = doc.widthOfString(area.nombre);
  const badgeX = 50 + nameWidth + 10;
  doc.fontSize(8).fillColor(colors.blanco).font('Helvetica-Bold');
  const badgeText = ` ${area.estadoGeneral.toUpperCase()} `;
  const badgeWidth = doc.widthOfString(badgeText) + 8;
  doc.rect(badgeX, doc.y - 2, badgeWidth, 16).fillAndStroke(estadoColor, estadoColor);
  doc.fillColor(colors.blanco).text(badgeText, badgeX + 4, doc.y);

  doc.moveDown(0.8);

  // Tabla de valores
  const headers = ['Parámetro', 'Actual', 'Mín', 'Máx', 'Estado'];
  const rows = [
    ['Temperatura', `${area.ultimaTemperatura}°C`, `${area.tempMin}°C`, `${area.tempMax}°C`, area.tempEstado],
    ['Humedad', `${area.ultimaHumedad}%`, `${area.humMin}%`, `${area.humMax}%`, area.humEstado],
    ['Presión', `${area.ultimaPresion} Pa`, `${area.presMin} Pa`, `${area.presMax} Pa`, area.presEstado],
  ];

  drawTable(doc, [headers, ...rows], { colWidths: [120, 80, 60, 60, 80], headerColor: colors.grisClaro });

  // Alertas si hay
  if (area.alertasRecientes && area.alertasRecientes.length > 0) {
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor(colors.rojoCritico).font('Helvetica-Bold').text('Alertas Recientes:');
    doc.moveDown(0.3);
    for (const alerta of area.alertasRecientes.slice(0, 3)) {
      doc.fontSize(9).fillColor(colors.grisOscuro).font('Helvetica')
        .text(`• ${format(new Date(alerta.fecha), 'dd/MM HH:mm', { locale: es })} - ${alerta.tipo}: ${alerta.mensaje}`, { indent: 10 });
    }
  }
}

function drawTable(doc, data, options = {}) {
  const { colWidths = [], headerColor = colors.vinotinto } = options;
  const startX = 50;
  let y = doc.y;
  const rowHeight = 22;

  // Header
  doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.blanco);
  let x = startX;
  data[0].forEach((header, i) => {
    doc.rect(x, y, colWidths[i], rowHeight).fill(headerColor);
    doc.fillColor(colors.blanco).text(header, x + 4, y + 6, { width: colWidths[i] - 8, align: i === 0 ? 'left' : 'center' });
    x += colWidths[i];
  });
  y += rowHeight;

  // Rows
  doc.font('Helvetica').fontSize(9);
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const isEven = r % 2 === 0;
    x = startX;

    // Background
    if (isEven) {
      doc.fillColor(colors.grisClaro);
      doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill();
    }

    row.forEach((cell, i) => {
      let fillColor = colors.grisOscuro;
      if (i === 4) { // Estado column
        const estado = cell.toLowerCase();
        if (estado === 'estable') fillColor = colors.verde;
        else if (estado === 'irregular') fillColor = colors.amarillo;
        else if (estado === 'critica') fillColor = colors.rojoCritico;
        else fillColor = colors.grisMedio;
      }
      doc.fillColor(fillColor).text(cell, x + 4, y + 6, { width: colWidths[i] - 8, align: i === 0 ? 'left' : 'center' });
      x += colWidths[i];
    });

    // Grid lines
    doc.strokeColor('#ddd').lineWidth(0.3);
    x = startX;
    for (let i = 0; i <= colWidths.length; i++) {
      doc.moveTo(x, y).lineTo(x, y + rowHeight).stroke();
      x += colWidths[i] || 0;
    }
    doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();

    y += rowHeight;
  }

  doc.y = y + 5;
}