let NativeModules: any = null;
let Platform: any = { OS: 'android' };
try {
  const RN = require('react-native');
  NativeModules = RN.NativeModules;
  Platform = RN.Platform || Platform;
} catch {}

import { qvacManager, MODEL_REGISTRY } from './qvacManager';

let FileSystem: any = null;
try {
  FileSystem = require('expo-file-system/legacy');
} catch {
  try {
    FileSystem = require('expo-file-system');
  } catch {
    FileSystem = null;
  }
}

export interface TranscribeAudioOptions {
  audioUri: string;
  language?: string; // Default: 'es' (Spanish)
  fallbackText?: string;
  injuriesAndSymptoms?: string;
}

/**
 * Servicio ASR: Transcripción local de audio utilizando WHISPER_TINY_Q8_0
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

        let transcribePath = cleanAudioPath;
        let tempWavToDelete: string | null = null;

        // Si estamos en Android y el archivo no termina en .wav, convertirlo a WAV 16kHz mono nativamente
        if (Platform.OS === 'android' && !cleanAudioPath.toLowerCase().endsWith('.wav')) {
          const BluetoothP2P = NativeModules?.BluetoothP2P;
          if (BluetoothP2P && typeof BluetoothP2P.convertAudioToWav === 'function') {
            try {
              const cacheDir = (FileSystem && FileSystem.cacheDirectory) ? FileSystem.cacheDirectory : '/data/user/0/ai.perseus.app/cache/';
              const cleanCacheDir = cacheDir.startsWith('file://') ? cacheDir.replace('file://', '') : cacheDir;
              const targetWav = `${cleanCacheDir}whisper_input_${Date.now()}.wav`;
              console.log(`[AudioTranscriber] Convirtiendo audio ${cleanAudioPath} a WAV 16kHz en ${targetWav}...`);
              const converted = await BluetoothP2P.convertAudioToWav(cleanAudioPath, targetWav);
              if (converted) {
                transcribePath = converted.startsWith('file://') ? converted.replace('file://', '') : converted;
                tempWavToDelete = transcribePath;
                console.log(`[AudioTranscriber] Audio convertido exitosamente a WAV 16kHz: ${transcribePath}`);
              }
            } catch (convErr: any) {
              console.warn('[AudioTranscriber] Fallo al convertir a WAV:', convErr?.message || convErr);
            }
          }
        }

        console.log(`[AudioTranscriber] Intentando inferencia directa con whisper.rn usando ${transcribePath}...`);
        const whisperContext = await rnWhisper.initWhisper({
          filePath: cleanModelPath,
          useGpu: false,
        });

        const task = whisperContext.transcribe(transcribePath, {
          language: language || 'es',
        });

        const res = await task.promise;
        await whisperContext.release();

        // Limpiar archivo WAV temporal si fue generado
        if (tempWavToDelete && FileSystem?.deleteAsync) {
          FileSystem.deleteAsync(`file://${tempWavToDelete}`, { idempotent: true }).catch(() => {});
        }

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
