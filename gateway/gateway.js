// ============================================
// GATEWAY INDUSTRIAL: Modbus TCP -> Pharma Monitor API
//
//  [PLC / sensor] --Modbus TCP--> [este gateway] --HTTP POST--> [backend]
//
// Hace polling a cada dispositivo definido en devices.json, convierte los
// registros a unidades de ingeniería y los envía a /api/sensores/lectura.
// Si el backend no responde, guarda las lecturas en un buffer en memoria
// y las reenvía cuando vuelve la conexión (store-and-forward).
// ============================================

import fs from 'fs';
import ModbusRTU from 'modbus-serial';

const API_URL = process.env.API_URL || 'http://localhost:3000/api/sensores/lectura';
const API_KEY = process.env.ARDUINO_API_KEY || 'arduino_secret_key';
const POLL_MS = Number(process.env.POLL_MS || 5000);
const MAX_BUFFER = 5000;

const devices = JSON.parse(fs.readFileSync(new URL('./devices.json', import.meta.url), 'utf-8'));
const buffer = []; // cola de lecturas pendientes de envío

// ---------- Envío al backend ----------
async function postReading(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function flushBuffer() {
  while (buffer.length > 0) {
    try {
      await postReading(buffer[0]);
      buffer.shift();
    } catch (e) {
      return; // sigue sin conexión; se reintenta en el próximo ciclo
    }
  }
}

// ---------- Lectura Modbus ----------
async function readDevice(dev) {
  const client = new ModbusRTU();
  try {
    await client.connectTCP(dev.host, { port: dev.port });
    client.setID(dev.unitId ?? 1);
    client.setTimeout(3000);

    const r = await client.readHoldingRegisters(dev.registers.start, dev.registers.count);
    const raw = r.data;
    const scale = dev.scale ?? 10;

    return {
      sensor_id: dev.sensorId,
      temperatura: raw[dev.map.temperatura] / scale,
      humedad: raw[dev.map.humedad] / scale,
      presion: raw[dev.map.presion] / scale,
      senal_calidad: 100,
      firmware_version: `modbus-gw-1.0`,
    };
  } finally {
    client.close(() => {});
  }
}

async function cycle() {
  for (const dev of devices) {
    try {
      const reading = await readDevice(dev);
      buffer.push(reading);
      if (buffer.length > MAX_BUFFER) buffer.shift(); // descarta lo más antiguo
      console.log(`📡 ${dev.name}: ${reading.temperatura}°C ${reading.humedad}% ${reading.presion}Pa`);
    } catch (e) {
      console.error(`❌ ${dev.name} (${dev.host}:${dev.port}) sin respuesta: ${e.message}`);
    }
  }
  await flushBuffer();
  if (buffer.length > 0) console.warn(`⏳ ${buffer.length} lectura(s) pendientes (backend inaccesible)`);
}

console.log(`🚀 Gateway Modbus -> ${API_URL} | ${devices.length} dispositivo(s) | cada ${POLL_MS} ms`);
cycle();
setInterval(cycle, POLL_MS);
