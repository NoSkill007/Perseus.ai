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

  it('debe clasificar terremoto con atrapados en Calidonia como ROJO con necesidades de rescate y salud', async () => {
    const input = {
      textRelato: 'Somos 8 personas atrapadas en un edificio en calidonia. Hubo un terremoto y quedamos atrapados.',
      province: 'Panamá',
      operatorDeviceId: 'UNIT-TEST-DEVICE-04',
    };

    const result = await runTriagePipeline(input);

    expect(result.triagePriority).toBe('ROJO');
    expect(result.reportedPeopleCount).toBe(8);
    expect(result.locationReference).toContain('Calidonia');
    expect(result.needs).toContain('ACCESO_RESCATE');
    expect(result.needs).toContain('SALUD');
    expect(result.needs).toContain('ALBERGUE');
    expect(result.isLocalInference).toBe(true);
  });

  it('debe procesar reporte con nota de voz obligatoria y relato de texto opcional (audio-only)', async () => {
    const input = {
      audioUri: 'file:///mock/audio_emergencia_chiriqui.m4a',
      province: 'Chiriquí',
      operatorDeviceId: 'UNIT-TEST-DEVICE-05',
    };

    const result = await runTriagePipeline(input);

    expect(result.reportId).toBeDefined();
    expect(result.transcript).toBeDefined();
    expect(result.isLocalInference).toBe(true);
    expect(result.triagePriority).toBeDefined();
  });

  it('debe clasificar ROJO y necesidades de rescate/salud cuando hay personas atrapadas bajo la casa y heridas', async () => {
    const input = {
      textRelato: 'Estoy con 5 personas debajo de mi casa, hay gente herida y no nos podemos mover.',
      province: 'Chiriquí',
      operatorDeviceId: 'UNIT-TEST-DEVICE-06',
    };

    const result = await runTriagePipeline(input);

    expect(result.triagePriority).toBe('ROJO');
    expect(result.reportedPeopleCount).toBe(5);
    expect(result.needs).toContain('ACCESO_RESCATE');
    expect(result.needs).toContain('SALUD');
    expect(result.needs).toContain('ALBERGUE');
    expect(result.isLocalInference).toBe(true);
  });
});
