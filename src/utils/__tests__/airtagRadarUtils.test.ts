import { describe, it, expect } from 'vitest';
import {
  calculateEstimatedMeters,
  formatDistanceMeters,
  getCardinalDirectionFromId,
  getProximityLabel,
  getTacticalAirTagTelemetry,
} from '../airtagRadarUtils';

describe('Airtag Radar Utils — Telemetría Táctica', () => {
  it('debe calcular metros aproximados basados en RSSI correctamente', () => {
    // Muy cerca
    const closeMeters = calculateEstimatedMeters(-45);
    expect(closeMeters).toBeLessThan(1.0);
    expect(closeMeters).toBeGreaterThanOrEqual(0.3);

    // Distancia media (-75 dBm)
    const midMeters = calculateEstimatedMeters(-75);
    expect(midMeters).toBeGreaterThan(3.0);
    expect(midMeters).toBeLessThan(10.0);

    // Perímetro (-95 dBm)
    const farMeters = calculateEstimatedMeters(-95);
    expect(farMeters).toBeGreaterThan(25.0);
    expect(farMeters).toBeLessThanOrEqual(55.0);
  });

  it('debe formatear texto de metros adecuadamente', () => {
    expect(formatDistanceMeters(4.2)).toBe('~4.2 m');
    expect(formatDistanceMeters(undefined, -50)).toBe('~0.4 m');
    expect(formatDistanceMeters(undefined, -70)).toBe('~3.2 m');
    expect(formatDistanceMeters(undefined, undefined)).toBe('~3.5 m');
  });

  it('debe mapear correctamente los cuadrantes cardinales N, S, E, O', () => {
    // Norte: 0°
    const n = getCardinalDirectionFromId('', 0);
    expect(n.primaryCardinal).toBe('N');
    expect(n.cardinal).toBe('N');
    expect(n.arrow).toBe('↑');

    // Este: 90°
    const e = getCardinalDirectionFromId('', 90);
    expect(e.primaryCardinal).toBe('E');
    expect(e.cardinal).toBe('E');
    expect(e.arrow).toBe('→');

    // Sur: 180°
    const s = getCardinalDirectionFromId('', 180);
    expect(s.primaryCardinal).toBe('S');
    expect(s.cardinal).toBe('S');
    expect(s.arrow).toBe('↓');

    // Oeste: 270°
    const o = getCardinalDirectionFromId('', 270);
    expect(o.primaryCardinal).toBe('O');
    expect(o.cardinal).toBe('O');
    expect(o.arrow).toBe('←');

    // Intermedios (Noreste: 45°)
    const ne = getCardinalDirectionFromId('', 45);
    expect(ne.cardinal).toBe('NE');
    expect(ne.primaryCardinal).toBe('N');
    expect(ne.arrow).toBe('↗');

    // Suroeste: 225°
    const so = getCardinalDirectionFromId('', 225);
    expect(so.cardinal).toBe('SO');
    expect(so.primaryCardinal).toBe('O');
    expect(so.arrow).toBe('↙');
  });

  it('debe generar telemetría AirTag consolidada con metros y dirección', () => {
    const telemetry = getTacticalAirTagTelemetry(-65, 2.5, '00:11:22:33:44:55');
    expect(telemetry.distanceMeters).toBe(2.5);
    expect(telemetry.distanceText).toBe('~2.5 m');
    expect(['N', 'S', 'E', 'O']).toContain(telemetry.direction.primaryCardinal);
    expect(telemetry.badge).toBe('CERCANO');
    expect(telemetry.percent).toBe('75%');
  });
});
