import { describe, it, expect } from 'vitest';
import { runTriagePipeline } from '../triagePipeline';
import { analyzeImageLocally, analyzeImageDetailed, DEFAULT_GENERIC_VISION_FALLBACK } from '../visionAnalyzer';
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

  it('debe generar un resumen ejecutivo de IA completo para rescatistas sin omitir detalles y preservar el relato del usuario', async () => {
    const input = {
      textRelato: 'Colapsó el puente sobre el río Caldera en Boquete. Hay 3 heridos con fracturas expuestas y traumatismo, 2 niños atrapados en el vehículo, necesitamos ambulancias y equipo hidráulico de rescate inmediatamente.',
      province: 'Chiriquí',
      district: 'Boquete',
      operatorDeviceId: 'UNIT-TEST-DEVICE-07',
    };

    const result = await runTriagePipeline(input);

    expect(result.textRelato).toBe(input.textRelato);
    expect(result.executiveSummary).toBeDefined();
    expect(typeof result.executiveSummary).toBe('string');
    expect(result.executiveSummary!.length).toBeGreaterThan(50);
    // Verificar que incluya detalles críticos consolidados
    expect(result.executiveSummary).toMatch(/rescate|atrapad|herid|fractura|Boquete/i);
    expect(result.triagePriority).toBe('ROJO');
    expect(result.needs).toContain('ACCESO_RESCATE');
    expect(result.needs).toContain('SALUD');
  });

  it('debe respetar estrictamente la ubicación y cantidad de personas fijadas en el formulario sin permitir que el razonamiento de la IA las modifique', async () => {
    const input = {
      // El relato intenta confundir diciendo "estoy solo" (1 persona) y mencionando "San Francisco" (Panamá)
      textRelato: 'Estoy solo atrapado bajo los escombros cerca de San Francisco, no puedo moverme.',
      province: 'Chiriquí',
      district: 'David',
      corregimiento: 'San Pablo',
      reportedPeopleCount: 3, // El formulario definió 3 personas oficialmente
      operatorDeviceId: 'UNIT-TEST-DEVICE-08',
    };

    const result = await runTriagePipeline(input);

    // La cantidad de personas y la ubicación del formulario son INMUTABLES
    expect(result.reportedPeopleCount).toBe(3);
    expect(result.locationReference).toBe('San Pablo, David, Chiriquí');
    expect(result.executiveSummary).toContain('3 personas');
    expect(result.executiveSummary).toContain('San Pablo, David, Chiriquí');
    expect(result.executiveSummary).not.toContain('San Francisco, Distrito de Panamá');
  });

  it('debe retornar mensaje genérico de fallback en analyzeImageLocally ante cualquier error o URI vacía sin cerrar la app', async () => {
    // Caso 1: URI vacía
    const resultEmpty = await analyzeImageLocally({ imageUri: '' });
    expect(resultEmpty).toBe(DEFAULT_GENERIC_VISION_FALLBACK);

    // Caso 2: Objeto detallado ante error o imagen sin datos
    const detailedFallback = await analyzeImageDetailed({ imageUri: '' });
    expect(detailedFallback.description).toBe(DEFAULT_GENERIC_VISION_FALLBACK);
    expect(detailedFallback.structuralDamage).toBe('Moderado');
    expect(detailedFallback.suggestedPriority).toBe('AMARILLO');
    expect(detailedFallback.isLocalInference).toBe(true);
  });

  it('debe ejecutar el pipeline completo con imagen problemática retornando el mensaje genérico de visión en vez de cerrar la aplicación', async () => {
    const input = {
      textRelato: 'Tenemos una casa afectada por lluvia en Boquete.',
      imageUri: 'file:///invalid/corrupted/path/not_found.jpg',
      province: 'Chiriquí',
      district: 'Boquete',
      reportedPeopleCount: 2,
    };

    // No debe lanzar excepción ni colapsar
    const result = await runTriagePipeline(input);

    expect(result.reportId).toBeDefined();
    expect(result.visionSeverity).toBe(DEFAULT_GENERIC_VISION_FALLBACK);
    expect(result.visualTriageAnalysis).toBe(DEFAULT_GENERIC_VISION_FALLBACK);
    expect(result.isLocalInference).toBe(true);
    expect(result.reportedPeopleCount).toBe(2);
    expect(result.locationReference).toBe('Boquete, Chiriquí');
  });
});

