import { describe, it, expect } from 'vitest';
import { runTriagePipeline } from '../triagePipeline';
import { StartPriority, DisasterNeedCategory } from '../../../types/triageTypes';

describe('Perseus AI - Local Triage Pipeline (Persona B)', () => {
  it('debe procesar el caso sintético oficial de Chiriquí con éxito', async () => {
    const input = {
      textRelato: 'Somos cuatro personas junto a la escuela del barrio en Chiriquí. Nos falta agua. No sé el nombre de la calle.',
      province: 'Chiriquí',
      operatorDeviceId: 'UNIT-TEST-DEVICE-01',
    };

    const result = await runTriagePipeline(input);

    // 1. Verificación de campos principales
    expect(result.reportId).toBeDefined();
    expect(result.isLocalInference).toBe(true);
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);

    // 2. Validación de Prioridad START (Enum Forzado)
    const validPriorities: StartPriority[] = ['ROJO', 'AMARILLO', 'VERDE', 'NEGRO'];
    expect(validPriorities).toContain(result.triagePriority);

    // 3. Validación de Extracción de Datos
    expect(result.reportedPeopleCount).toBe(4);
    expect(result.needs).toContain('AGUA_SANEAMIENTO');
    expect(result.locationReference).toBeDefined();

    // 4. Verificación de Campos Faltantes (No inventar datos)
    expect(result.missingFields.length).toBeGreaterThan(0);
  });

  it('debe clasificar prioridad crítica (ROJO) cuando hay personas atrapadas o riesgo inminente', async () => {
    const input = {
      textRelato: 'Hay una familia de cinco personas atrapadas por la inundación en el techo de la casa. Urgente rescate.',
      province: 'Bocas del Toro',
      operatorDeviceId: 'UNIT-TEST-DEVICE-02',
    };

    const result = await runTriagePipeline(input);

    expect(result.triagePriority).toBe('ROJO');
    expect(result.reportedPeopleCount).toBe(5);
    expect(result.isLocalInference).toBe(true);
  });

  it('debe manejar fallback seguro sin crashear si no se recibe relato', async () => {
    const input = {
      operatorDeviceId: 'UNIT-TEST-DEVICE-03',
    };

    const result = await runTriagePipeline(input);

    expect(result.reportId).toBeDefined();
    expect(result.triagePriority).toBeDefined();
    expect(result.isLocalInference).toBe(true);
  });
});
