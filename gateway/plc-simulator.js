// ============================================
// PLC SIMULADO (Modbus TCP) - SOLO PARA DESARROLLO Y PRUEBAS
// Expone un esclavo Modbus con el siguiente mapa de registros
// (Holding Registers, función 03), valores enteros ESCALADOS x10:
//
//   Dirección | Variable      | Ejemplo
//   ----------|---------------|---------------------
//   0         | Temperatura   | 215  => 21.5 °C
//   1         | Humedad       | 480  => 48.0 %
//   2         | Presión       | 125  => 12.5 Pa
//   3         | Estado equipo | 0 = OK, 1 = falla
//
// Cada "PLC" corresponde a un puerto distinto (uno por área).
// ============================================

import { ServerTCP } from 'modbus-serial';

const PLCS = [
  { port: 5020, base: { t: 22, h: 48, p: 12.5 }, name: 'Mezcla Líquidos' },
  { port: 5021, base: { t: 24, h: 50, p: 12.0 }, name: 'Mezcla Sólidos' },
];

// Probabilidad de que un ciclo genere un valor fuera de rango (para probar alertas)
const ANOMALY_CHANCE = Number(process.env.ANOMALY_CHANCE ?? 0.03);

for (const plc of PLCS) {
  const holding = Buffer.alloc(16 * 2); // 16 registros de 16 bits

  const vector = {
    getHoldingRegister: (addr) => holding.readUInt16BE(addr * 2),
    getInputRegister: (addr) => holding.readUInt16BE(addr * 2),
    getCoil: () => false,
    setRegister: () => {}, // solo lectura
  };

  const server = new ServerTCP(vector, { host: '0.0.0.0', port: plc.port, debug: false, unitID: 1 });
  server.on('error', (e) => console.error(`[PLC ${plc.name}]`, e.message));
  server.on('initialized', () => console.log(`🏭 PLC simulado "${plc.name}" escuchando en :${plc.port}`));

  const jitter = (v, amp) => v + (Math.random() - 0.5) * amp;

  setInterval(() => {
    let t = jitter(plc.base.t, 1.2);
    let h = jitter(plc.base.h, 4);
    let p = jitter(plc.base.p, 0.8);
    if (Math.random() < ANOMALY_CHANCE) t += 12; // pico de temperatura

    holding.writeUInt16BE(Math.round(t * 10), 0);
    holding.writeUInt16BE(Math.round(h * 10), 2);
    holding.writeUInt16BE(Math.round(p * 10), 4);
    holding.writeUInt16BE(0, 6);
  }, 2000);
}
