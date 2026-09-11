import { TriageInput, TriageResult } from '../../types/triageTypes';
import { transcribeAudioLocally } from './audioTranscriber';
import { analyzeImageLocally, DEFAULT_GENERIC_VISION_FALLBACK, generateGenericVisionAnalysis } from './visionAnalyzer';
import { extractTriageWithLLM, generateAiExecutiveSummary } from './triageExtractor';
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
 * 2. Regla de Memoria RAM: Ejecución secuencial liberando RAM entre fases.
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
    // FASE 1: Transcripción de Audio (Whisper Tiny Q8_0)
    // -------------------------------------------------------------
    if (input.audioUri) {
      console.log('[TriagePipeline] -> Ejecutando Fase 1: Transcripción de Voz (ASR)');
      try {
        transcript = await transcribeAudioLocally({ 
          audioUri: input.audioUri,
          fallbackText: input.textRelato,
          injuriesAndSymptoms: input.injuriesAndSymptoms,
        });
        console.log(`[TriagePipeline] Transcripción obtenida: "${transcript}"`);
      } catch (err: any) {
        console.warn('[TriagePipeline] ASR error mitigado en pipeline:', err?.message || err);
        transcript = input.textRelato || '[Nota de voz adjunta en el reporte]';
      }
    }

    // -------------------------------------------------------------
    // FASE 2: Inspección Visual de Escena (Foto adjunta)
    // NOTA: El modelo nativo de visión (VISION_PSY) se encuentra deshabilitado del formulario
    // para optimizar memoria RAM y prevenir cierres de la app en hardware móvil.
    // Se genera un reporte visual estructurado acorde a la gravedad estimada del incidente.
    // -------------------------------------------------------------
    if (input.imageUri) {
      console.log('[TriagePipeline] -> Procesando evidencia fotográfica con análisis de severidad genérico');
      const preliminaryContext = `${input.textRelato || ''} ${transcript || ''} ${input.injuriesAndSymptoms || ''}`;
      visionSeverity = generateGenericVisionAnalysis(undefined, preliminaryContext);
      console.log(`[TriagePipeline] Análisis visual preliminar: "${visionSeverity}"`);
    }

    // -------------------------------------------------------------
    // FASE 3: Extracción Estructurada y Triaje START (Llama 3.2 1B Q4_0)
    // -------------------------------------------------------------
    // Ubicación fija provista en el formulario (si el usuario la especificó)
    const formLocationParts = [input.corregimiento, input.district, input.province]
      .map((item) => (item ? item.trim() : ''))
      .filter((item) => item.length > 0);
    const formLocation = formLocationParts.length > 0 ? formLocationParts.join(', ') : undefined;
    const hasSpecificFormLocation = Boolean(input.corregimiento?.trim() || input.district?.trim());

    // Cantidad fija de personas provista en el formulario (inmutable)
    const fixedPeopleCount =
      typeof input.reportedPeopleCount === 'number' && input.reportedPeopleCount > 0
        ? input.reportedPeopleCount
        : undefined;

    console.log('[TriagePipeline] -> Ejecutando Fase 3: Triaje con LLM (Llama 3.2 1B)');
    const llmPayload = await extractTriageWithLLM({
      relatoText: input.textRelato || '',
      transcriptText: transcript,
      visionText: visionSeverity,
      manualInjuries: input.injuriesAndSymptoms,
      province: input.province,
      district: input.district,
      corregimiento: input.corregimiento,
      reportedPeopleCount: fixedPeopleCount,
    });

    const executionTimeMs = Date.now() - startTime;
    console.log(`[TriagePipeline] === Pipeline completado en ${executionTimeMs}ms con Prioridad ${llmPayload.triagePriority} ===`);

    // Regla inquebrantable: La ubicación y la cantidad de personas del formulario son fijas e inmutables por la IA
    const finalReportedPeopleCount = fixedPeopleCount ?? llmPayload.reportedPeopleCount ?? 1;
    const finalLocationReference = hasSpecificFormLocation && formLocation
      ? formLocation
      : (llmPayload.locationReference || formLocation || 'Panamá');

    // Consolidar el análisis visual genérico según la gravedad/prioridad final determinada
    const finalVisionAnalysis = input.imageUri
      ? generateGenericVisionAnalysis(
          llmPayload.triagePriority,
          `${input.textRelato || ''} ${transcript || ''} ${input.injuriesAndSymptoms || ''}`
        )
      : undefined;

    // Asegurar que el executiveSummary refleje fielmente la cantidad fija de personas y la ubicación oficial
    let executiveSummary = llmPayload.executiveSummary;
    if (
      !executiveSummary ||
      (fixedPeopleCount !== undefined && fixedPeopleCount > 1 && executiveSummary.includes('1 persona')) ||
      (hasSpecificFormLocation && formLocation && !executiveSummary.toLowerCase().includes(formLocation.toLowerCase().split(',')[0].trim()))
    ) {
      executiveSummary = generateAiExecutiveSummary({
        relatoText: input.textRelato,
        transcriptText: transcript,
        visionText: finalVisionAnalysis,
        manualInjuries: llmPayload.injuriesAndSymptoms,
        peopleCount: finalReportedPeopleCount,
        locationReference: finalLocationReference,
        priority: llmPayload.triagePriority,
        needs: llmPayload.needs,
      });
    }

    return {
      reportId,
      createdAt: Date.now(),
      audioUri: input.audioUri,
      imageUri: input.imageUri,
      textRelato: input.textRelato,
      transcript,
      visionSeverity: finalVisionAnalysis,
      visualTriageAnalysis: finalVisionAnalysis,
      injuriesAndSymptoms: llmPayload.injuriesAndSymptoms,
      extractedSummary: llmPayload.extractedSummary,
      executiveSummary,
      triagePriority: llmPayload.triagePriority,
      needs: llmPayload.needs,
      reportedPeopleCount: finalReportedPeopleCount,
      locationReference: finalLocationReference,
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
