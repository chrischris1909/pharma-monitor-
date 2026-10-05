import { evaluateArea } from '../src/services/threshold.service.js';

describe('Threshold Service - evaluateArea', () => {
  let baseArea;

  beforeEach(() => {
    // Área simulada con parámetros base
    baseArea = {
      nombre: 'Área de Prueba',
      temp_min: 15,
      temp_max: 25,
      temp_critica_min: 10,
      temp_critica_max: 30,
      humedad_min: 40,
      humedad_max: 60,
      humedad_critica_min: 30,
      humedad_critica_max: 70,
      presion_min: 10,
      presion_max: 20,
      presion_critica_min: null,
      presion_critica_max: null,
      temperatura: null,
      humedad: null,
      presion: null
    };
  });

  it('No debe generar alertas si los valores están dentro del rango', () => {
    baseArea.temperatura = 20; // dentro de 15-25
    baseArea.humedad = 50;     // dentro de 40-60
    
    const alertas = evaluateArea(baseArea);
    expect(alertas.length).toBe(0);
  });

  it('Debe generar alerta de ADVERTENCIA si temperatura supera el máximo permitido', () => {
    baseArea.temperatura = 26; // mayor a 25, menor a 30 (crítico)
    
    const alertas = evaluateArea(baseArea);
    expect(alertas.length).toBe(1);
    expect(alertas[0].tipo).toBe('temperatura');
    expect(alertas[0].severidad).toBe('advertencia');
    expect(alertas[0].valor).toBe(26);
  });

  it('Debe generar alerta CRÍTICA si la temperatura supera el límite crítico', () => {
    baseArea.temperatura = 32; // mayor a 30 (crítico max)
    
    const alertas = evaluateArea(baseArea);
    expect(alertas.length).toBe(1);
    expect(alertas[0].tipo).toBe('temperatura');
    expect(alertas[0].severidad).toBe('critica');
  });

  it('Debe generar alertas combinadas si varios parámetros fallan', () => {
    baseArea.temperatura = 8;  // menor a 10 (Crítico min)
    baseArea.humedad = 65;     // mayor a 60 (Advertencia max)
    
    const alertas = evaluateArea(baseArea);
    expect(alertas.length).toBe(2);
    
    const tempAlert = alertas.find(a => a.tipo === 'temperatura');
    expect(tempAlert.severidad).toBe('critica');
    
    const humAlert = alertas.find(a => a.tipo === 'humedad');
    expect(humAlert.severidad).toBe('advertencia');
  });
});
