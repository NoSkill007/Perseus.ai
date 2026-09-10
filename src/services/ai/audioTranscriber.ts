import { qvacManager, MODEL_REGISTRY } from './qvacManager';

export interface TranscribeAudioOptions {
  audioUri: string;
  language?: string; // Default: 'es' (Spanish)
  fallbackText?: string;
  injuriesAndSymptoms?: string;
}

/**
 * Servicio ASR: Transcripción local de audio utilizando WHISPER_BASE_Q8_0
 * Implementa resiliencia 100% para emergencias en campo:
 * Intenta inferencia nativa segura (whisper.rn) o provee fallback asistido
 * sin invocar worklets de V8 propensos a SIGABRT en Android.
 */
export async function transcribeAudioLocally(
  options: TranscribeAudioOptions
): Promise<string> {
  const { audioUri, language = 'es', fallbackText, injuriesAndSymptoms } = options;

  if (!audioUri) {
    throw new Error('[AudioTranscriber] Se requiere audioUri válido.');
  }

  console.log(`[AudioTranscriber] Audio recibido para procesamiento ASR: ${audioUri}`);

  // Fallback garantizado de emergencia para no perder el reporte
  const safeFallback = fallbackText?.trim() ||
    (injuriesAndSymptoms?.trim() ? `[Audio adjunto - Síntomas: ${injuriesAndSymptoms.trim()}]` : '[Audio de voz registrado en el reporte]');

  try {
    // 1. Preparar modelo ASR sin BareKit
    await qvacManager.loadModel('ASR_WHISPER');

    const cleanAudioPath = audioUri.startsWith('file://') ? audioUri.replace('file://', '') : audioUri;

    // 2. Intentar motor nativo whisper.rn si está disponible en el entorno
    try {
      const rnWhisper = require('whisper.rn');
      if (typeof rnWhisper?.initWhisper === 'function') {
        const config = MODEL_REGISTRY.ASR_WHISPER;
        const rawModelPath = config?.localPath || '';
        const cleanModelPath = rawModelPath.startsWith('file://') ? rawModelPath.replace('file://', '') : rawModelPath;

        console.log(`[AudioTranscriber] Intentando inferencia directa con whisper.rn...`);
        const whisperContext = await rnWhisper.initWhisper({
          filePath: cleanModelPath,
          useGpu: false,
        });

        const task = whisperContext.transcribe(cleanAudioPath, {
          language: language || 'es',
        });

        const res = await task.promise;
        await whisperContext.release();

        if (res?.result && res.result.trim().length > 0) {
          console.log(`[AudioTranscriber] whisper.rn transcribió exitosamente: "${res.result.trim()}"`);
          return res.result.trim();
        }
      }
    } catch (rnErr: any) {
      console.warn('[AudioTranscriber] whisper.rn no disponible o omitido:', rnErr?.message || rnErr);
    }

    // 3. Si no hay motor nativo activo o el audio está vacío, aplicar fallback asistido de campo
    console.log('[AudioTranscriber] Empleando transcripción asistida de emergencia.');
    return safeFallback;
  } catch (error: any) {
    console.warn('[AudioTranscriber] Advertencia mitigada en ASR:', error?.message || error);
    return safeFallback;
  } finally {
    try {
      await qvacManager.unloadCurrentModel();
    } catch {}
  }
}
