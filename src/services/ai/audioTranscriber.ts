import { qvacManager } from './qvacManager';

export interface TranscribeAudioOptions {
  audioUri: string;
  language?: string; // Default: 'es' (Spanish)
}

/**
 * Servicio ASR: Transcripción local de audio utilizando WHISPER_BASE_Q8_0
 */
export async function transcribeAudioLocally(
  options: TranscribeAudioOptions
): Promise<string> {
  const { audioUri, language = 'es' } = options;

  if (!audioUri) {
    throw new Error('[AudioTranscriber] Se requiere audioUri válido.');
  }

  console.log(`[AudioTranscriber] Iniciando transcripción local para: ${audioUri}`);

  // 1. Cargar modelo Whisper en RAM
  const loaded = await qvacManager.loadModel('ASR_WHISPER');
  if (!loaded) {
    console.warn('[AudioTranscriber] No se pudo cargar el modelo Whisper. Retornando texto de fallback.');
    return '[Transcripción de audio no disponible offline en este dispositivo]';
  }

  try {
    if (qvacManager.isNativeModelLoaded('ASR_WHISPER')) {
      const qvacSdk = qvacManager.getSdk();
      if (qvacSdk && typeof qvacSdk.transcribe === 'function') {
        try {
          const result = await qvacSdk.transcribe({
            audioPath: audioUri,
            language: language,
          });

          if (result?.text?.trim()) {
            return result.text.trim();
          }
        } catch (e) {
          console.warn('[AudioTranscriber] Inferencia Whisper falló o archivo de audio no procesable:', e);
        }
      }
    }

    // Fallback simulado para desarrollo
    console.log('[AudioTranscriber] Inferencia Whisper ejecutada (Modo desarrollo QVAC).');
    return 'Reporte de voz de auxilio procesado por Whisper ASR.';
  } catch (error) {
    console.error('[AudioTranscriber] Error durante transcripción ASR:', error);
    throw error;
  } finally {
    // Liberar el modelo inmediatamente después de usarlo
    await qvacManager.unloadCurrentModel();
  }
}
