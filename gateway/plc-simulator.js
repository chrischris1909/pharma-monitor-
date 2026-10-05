// ============================================
// PLC SIMULADO (Modbus TCP) - SOLO PARA DESARROLLO Y PRUEBAS
// ============================================

import { ServerTCP } from 'modbus-serial';

const PLCS = [
  { port: 5020, base: { t: 22, h: 48, p: 12.5 }, name: 'Mezcla Líquidos' },
  { port: 5021, base: { t: 24, h: 50, p: 12.0 }, name: 'Mezcla Sólidos' },
  { port: 5022, base: { t: 21, h: 45, p: 13.0 }, name: 'Pesada' },
  { port: 5023, base: { t: 20, h: 40, p: 12.8 }, name: 'Control Calidad' }
];

const ANOMALY_CHANCE = Number(process.env.ANOMALY_CHANCE ?? 0.03);

for (const plc of PLCS) {
  const holding = Buffer.alloc(16 * 2);

  const vector = {
    getHoldingRegister: (addr) => holding.readUInt16BE(addr * 2),
    getInputRegister: (addr) => holding.readUInt16BE(addr * 2),
    getCoil: () => false,
    setRegister: () => {},
  };

  const server = new ServerTCP(vector, { host: '0.0.0.0', port: plc.port, debug: false, unitID: 1 });
  server.on('error', (e) => console.error(`[PLC ${plc.name}]`, e.message));
  server.on('initialized', () => console.log(`🏭 PLC simulado "${plc.name}" escuchando en :${plc.port}`));

  const jitter = (v, amp) => v + (Math.random() - 0.5) * amp;

  setInterval(() => {
    let t = jitter(plc.base.t, 1.2);
    let h = jitter(plc.base.h, 4);
    let p = jitter(plc.base.p, 0.8);
    if (Math.random() < ANOMALY_CHANCE) t += 12;

    holding.writeUInt16BE(Math.round(t * 10), 0);
    holding.writeUInt16BE(Math.round(h * 10), 2);
    holding.writeUInt16BE(Math.round(p * 10), 4);
    holding.writeUInt16BE(0, 6);
  }, 2000);
}
