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

  console.log(`[AudioTranscriber] Iniciando transcripción local con Whisper ASR para: ${audioUri}`);

  // 1. Cargar modelo Whisper en RAM
  const loaded = await qvacManager.loadModel('ASR_WHISPER');

  try {
    const qvacSdk = qvacManager.getSdk();
    const cleanAudioPath = audioUri.startsWith('file://') ? audioUri.replace('file://', '') : audioUri;
    const targetModelId = qvacManager.getNativeModelId('ASR_WHISPER') || 'ASR_WHISPER';

    console.log(`[AudioTranscriber] Ejecutando transcribe() en QVAC SDK con targetModelId="${targetModelId}", path="${cleanAudioPath}"...`);

    if (!qvacSdk || typeof qvacSdk.transcribe !== 'function') {
      const err = new Error('[AudioTranscriber] qvacSdk.transcribe no es una función disponible en el SDK.');
      console.error(err);
      throw err;
    }

    const result = await qvacSdk.transcribe({
      modelId: targetModelId,
      audioChunk: cleanAudioPath,
      prompt: 'Emergencia, rescate, personas atrapadas, heridos, auxilio, ubicación en Panamá',
    });

    console.log('[AudioTranscriber] Inferencia Whisper retornó:', JSON.stringify(result));

    const text = typeof result === 'string'
      ? result
      : (result as any)?.text || (result as any)?.transcript || (Array.isArray(result) ? result.map((s: any) => s?.text).join(' ') : '');

    if (text && text.trim().length > 0) {
      console.log(`[AudioTranscriber] Whisper transcribió exitosamente: "${text.trim()}"`);
      return text.trim();
    }

    console.warn('[AudioTranscriber] Whisper no generó texto para este audio.');
    return '';
  } catch (error: any) {
    console.error('[AudioTranscriber] ❌ ERROR COMPLETO EN TRANSCRIPCIÓN WHISPER:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      cause: error?.cause,
      raw: error,
    });
    // Lanzar el error sin cadenas genéricas para que la consola muestre exactamente el fallo
    throw error;
  } finally {
    // Liberar el modelo inmediatamente después de usarlo
    await qvacManager.unloadCurrentModel();
  }
}
