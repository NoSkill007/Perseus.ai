import * as FileSystem from 'expo-file-system';
import * as Device from 'expo-device';
import { MODEL_REGISTRY, qvacManager } from './qvacManager';
import { runTriagePipeline } from './triagePipeline';
import { TriageResult } from '../../types/triageTypes';

export interface SystemDiagnosticsReport {
  deviceModel: string | null;
  osName: string | null;
  osVersion: string | null;
  isDevicePhysical: boolean;
  qvacInitialized: boolean;
  modelsAvailability: Record<string, boolean>;
  systemCheckPassed: boolean;
}

/**
 * Servicio de Diagnóstico del Entorno de IA (Persona B / QA)
 */
export async function runAIDiagnostics(): Promise<SystemDiagnosticsReport> {
  console.log('[AI Diagnostics] Verificando requisitos del sistema y modelos locales...');

  const isPhysical = Device.isDevice;
  const osName = Device.osName;
  const osVersion = Device.osVersion;
  const deviceModel = Device.modelName;

  // Inicializar QVAC
  const status = await qvacManager.initialize();

  // Verificar presencia de archivos de modelos
  const modelsAvailability: Record<string, boolean> = {};
  for (const [key, config] of Object.entries(MODEL_REGISTRY)) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(config.localPath);
      modelsAvailability[key] = fileInfo.exists;
    } catch {
      modelsAvailability[key] = false;
    }
  }

  // Comprobar si pasa los requerimientos mínimos del hackathon
  const systemCheckPassed = isPhysical && (osName === 'Android' || osName === 'iOS');

  return {
    deviceModel,
    osName,
    osVersion,
    isDevicePhysical: isPhysical,
    qvacInitialized: status.isInitialized,
    modelsAvailability,
    systemCheckPassed,
  };
}

/**
 * Ejecuta el caso de prueba sintético oficial del hackathon (Escenario Chiriquí):
 * "Somos cuatro personas junto a la escuela del barrio. Nos falta agua. No sé el nombre de la calle."
 */
export async function runChiriquiSyntheticTest(): Promise<TriageResult> {
  console.log('[AI Diagnostics] === Ejecutando Caso de Prueba Sintético: Chiriquí ===');

  const testInput = {
    textRelato: 'Somos cuatro personas junto a la escuela del barrio. Nos falta agua. No sé el nombre de la calle.',
    province: 'Chiriquí',
    operatorDeviceId: 'DEV-TEST-NODE-01',
  };

  const result = await runTriagePipeline(testInput);

  console.log('[AI Diagnostics] Resultado de Prueba Sintética Chiriquí:');
  console.log(`- Prioridad START: ${result.triagePriority}`);
  console.log(`- Resumen: ${result.extractedSummary}`);
  console.log(`- Personas reportadas: ${result.reportedPeopleCount}`);
  console.log(`- Necesidades: ${result.needs.join(', ')}`);
  console.log(`- Campos pendientes: ${result.missingFields.join(', ')}`);
  console.log(`- Tiempo de ejecución: ${result.executionTimeMs}ms`);

  return result;
}
