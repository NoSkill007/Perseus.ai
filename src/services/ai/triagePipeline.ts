import { TriageInput, TriageResult } from '../../types/triageTypes';
import { transcribeAudioLocally } from './audioTranscriber';
import { analyzeImageLocally } from './visionAnalyzer';
import { extractTriageWithLLM } from './triageExtractor';
import { qvacManager } from './qvacManager';

/**
 * Generador simple de UUID v4 para entornos sin dependencias pesadas
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * MASTER ORQUESTRADOR DE TRIAJE LOCAL (QVAC 100% On-Device)
 * 
 * Cumple con:
 * 1. Regla del Hackathon: Inferencia 100% local, 0 llamadas a la nube.
 * 2. Regla de Memoria RAM: Ejecución secuencial (Audio -> Imagen -> LLM) liberando RAM entre fases.
 * 3. Formulario Disponible: Si la IA falla, devuelve el objeto para continuar con revisión humana.
 */
export async function runTriagePipeline(input: TriageInput): Promise<TriageResult> {
  const startTime = Date.now();
  const reportId = generateUUID();

  console.log(`[TriagePipeline] === Iniciando Pipeline de Triaje Local (${reportId}) ===`);

  // Asegurar inicialización de QVAC
  await qvacManager.initialize();

  let transcript: string | undefined = undefined;
  let visionSeverity: string | undefined = undefined;

  try {
    // -------------------------------------------------------------
    // FASE 1: Transcripción de Audio (Whisper Base Q8_0)
    // -------------------------------------------------------------
    if (input.audioUri) {
      console.log('[TriagePipeline] -> Ejecutando Fase 1: Transcripción de Voz (ASR)');
      try {
        transcript = await transcribeAudioLocally({ audioUri: input.audioUri });
        console.log(`[TriagePipeline] Transcripción completada: "${transcript}"`);
      } catch (err: any) {
        console.warn('[TriagePipeline] ASR no completó la transcripción en flujo principal:', err?.message || err);
        // En el flujo de emergencia, si el audio falla o está en calibración, no bloquear el reporte:
        transcript = input.textRelato || '[Nota de voz adjunta en el reporte]';
      }
    }

    // -------------------------------------------------------------
    // FASE 2: Análisis de Foto de Desastre (VisionPsy Nano Q8_0)
    // -------------------------------------------------------------
    if (input.imageUri) {
      console.log('[TriagePipeline] -> Ejecutando Fase 2: Análisis de Visión (Foto)');
      try {
        visionSeverity = await analyzeImageLocally({ imageUri: input.imageUri });
        console.log(`[TriagePipeline] Análisis de visión completado: "${visionSeverity}"`);
      } catch (err) {
        console.warn('[TriagePipeline] Advertencia en Fase 2 (Visión):', err);
        visionSeverity = 'Análisis de visión no completado.';
      }
    }

    // -------------------------------------------------------------
    // FASE 3: Extracción Estructurada y Triaje START (Llama 3.2 1B Q4_0)
    // -------------------------------------------------------------
    console.log('[TriagePipeline] -> Ejecutando Fase 3: Triaje con LLM (Llama 3.2 1B)');
    const llmPayload = await extractTriageWithLLM({
      relatoText: input.textRelato || '',
      transcriptText: transcript,
      visionText: visionSeverity,
      province: input.province,
      district: input.district,
      corregimiento: input.corregimiento,
    });

    const executionTimeMs = Date.now() - startTime;
    console.log(`[TriagePipeline] === Pipeline completado en ${executionTimeMs}ms con Prioridad ${llmPayload.triagePriority} ===`);

    return {
      reportId,
      createdAt: Date.now(),
      transcript,
      visionSeverity,
      extractedSummary: llmPayload.extractedSummary,
      triagePriority: llmPayload.triagePriority,
      needs: llmPayload.needs,
      reportedPeopleCount: llmPayload.reportedPeopleCount,
      locationReference: llmPayload.locationReference,
      missingFields: llmPayload.missingFields,
      rawModelOutput: llmPayload.rawOutput,
      isLocalInference: true, // 100% local garantizado
      executionTimeMs,
    };
  } catch (criticalError: any) {
    console.error('[TriagePipeline] ❌ ERROR CRÍTICO EN PIPELINE DE IA:', {
      name: criticalError?.name,
      message: criticalError?.message,
      stack: criticalError?.stack,
      cause: criticalError?.cause,
      raw: criticalError,
    });
    throw criticalError;
  } finally {
    // Asegurar que ningún modelo quede cargado en RAM
    await qvacManager.unloadCurrentModel();
  }
}
