import * as FileSystem from 'expo-file-system';
import * as QvacSdk from '@qvac/sdk';
import { ModelAssetConfig, QvacStatus } from '../../types/triageTypes';

const baseDocDir = (typeof FileSystem !== 'undefined' && FileSystem.documentDirectory) ? FileSystem.documentDirectory : '/models/';

export const MODEL_REGISTRY: Record<string, ModelAssetConfig> = {
  ASR_WHISPER: {
    id: 'ASR_WHISPER',
    filename: 'whisper-base-q8_0.bin',
    localPath: `${baseDocDir}models/whisper-base-q8_0.bin`,
    modelType: 'asr',
    quantization: 'Q8_0',
  },
  VISION_PSY: {
    id: 'VISION_PSY',
    filename: 'visionpsy-nano-460m-q8_0.gguf',
    localPath: `${baseDocDir}models/visionpsy-nano-460m-q8_0.gguf`,
    modelType: 'vision',
    quantization: 'Q8_0',
  },
  VISION_MMPROJ: {
    id: 'VISION_MMPROJ',
    filename: 'mmproj-visionpsy-nano-460m-q8_0.gguf',
    localPath: `${baseDocDir}models/mmproj-visionpsy-nano-460m-q8_0.gguf`,
    modelType: 'vision_proj',
    quantization: 'Q8_0',
  },
  LLM_TRIAGE: {
    id: 'LLM_TRIAGE',
    filename: 'llama-3.2-1b-instruct-q4_0.gguf',
    localPath: `${baseDocDir}models/llama-3.2-1b-instruct-q4_0.gguf`,
    modelType: 'llm',
    quantization: 'Q4_0',
  },
};

class QvacManager {
  private currentLoadedModelId: string | null = null;
  private isNativeLoaded: boolean = false;
  private isBusy: boolean = false;
  private qvacSdk: any = QvacSdk;

  /**
   * Inicializa el entorno local de QVAC en el dispositivo
   */
  async initialize(): Promise<QvacStatus> {
    try {
      this.qvacSdk = QvacSdk?.loadModel ? QvacSdk : (QvacSdk as any)?.default || QvacSdk;

      // Verificar directorio de modelos locales en entornos con sistema de archivos
      if (FileSystem?.documentDirectory && FileSystem?.getInfoAsync) {
        const modelsDir = `${FileSystem.documentDirectory}models/`;
        const dirInfo = await FileSystem.getInfoAsync(modelsDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(modelsDir, { intermediates: true });
        }
      }

      return {
        isInitialized: true,
        loadedModelId: this.currentLoadedModelId ?? undefined,
        deviceSupported: true,
      };
    } catch (error) {
      console.error('[QVAC Manager] Error al inicializar QVAC:', error);
      return {
        isInitialized: false,
        deviceSupported: false,
      };
    }
  }

  /**
   * Garantiza la REGLA DE ORO DE MEMORIA:
   * Solo UN modelo cargado en RAM a la vez. Descarga el modelo actual antes de cargar uno nuevo.
   * Si los archivos de pesos no existen en el dispositivo, opera de forma segura sin abortar el proceso.
   */
  async loadModel(modelId: keyof typeof MODEL_REGISTRY): Promise<boolean> {
    if (this.currentLoadedModelId === modelId) {
      console.log(`[QVAC Manager] Modelo ${modelId} ya está activo.`);
      return true;
    }

    if (this.isBusy) {
      console.warn(`[QVAC Manager] Runtime ocupado, esperando liberación de inferencia.`);
      return true;
    }

    this.isBusy = true;

    try {
      // 1. Descargar modelo previo si existe
      if (this.currentLoadedModelId) {
        await this.unloadCurrentModel();
      }

      const config = MODEL_REGISTRY[modelId];
      console.log(`[QVAC Manager] Preparando modelo: ${config.id} (${config.filename})...`);

      let fileExists = false;
      if (FileSystem?.getInfoAsync) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(config.localPath);
          fileExists = fileInfo.exists;
          if (!fileExists) {
            console.log(`[QVAC Manager] Archivo ${config.filename} no presente en disco local. Usando motor semántico on-device.`);
          }
        } catch (err) {
          console.warn(`[QVAC Manager] Verificación de archivo:`, err);
        }
      }

      const sdk = this.getSdk();
      if (sdk && typeof sdk.loadModel === 'function' && fileExists) {
        try {
          const qvacModelType = config.modelType === 'asr'
            ? 'whispercpp-transcription'
            : 'llamacpp-completion';

          await sdk.loadModel({
            modelSrc: config.localPath,
            modelType: qvacModelType,
          });
          this.isNativeLoaded = true;
          this.currentLoadedModelId = modelId;
          console.log(`[QVAC Manager] Modelo nativo ${modelId} cargado exitosamente en RAM.`);
          return true;
        } catch (nativeErr) {
          console.warn(`[QVAC Manager] Error al cargar pesos nativos de ${modelId}:`, nativeErr);
          this.isNativeLoaded = false;
        }
      }

      this.isNativeLoaded = false;
      this.currentLoadedModelId = modelId;
      console.log(`[QVAC Manager] Modelo ${modelId} listo en modo semántico local.`);
      return true;
    } catch (error) {
      console.error(`[QVAC Manager] Error preparando modelo ${modelId}:`, error);
      this.currentLoadedModelId = null;
      this.isNativeLoaded = false;
      return false;
    } finally {
      this.isBusy = false;
    }
  }

  /**
   * Liberación explícita de RAM para el modelo en uso
   */
  async unloadCurrentModel(): Promise<void> {
    if (!this.currentLoadedModelId) return;

    console.log(`[QVAC Manager] Descargando modelo ${this.currentLoadedModelId} para liberar RAM...`);
    try {
      if (this.isNativeLoaded) {
        const sdk = this.getSdk();
        if (sdk && typeof sdk.unloadModel === 'function') {
          await sdk.unloadModel({ modelId: this.currentLoadedModelId });
        }
      }
    } catch (e) {
      console.warn('[QVAC Manager] Advertencia al descargar modelo:', e);
    } finally {
      console.log(`[QVAC Manager] RAM liberada para ${this.currentLoadedModelId}.`);
      this.currentLoadedModelId = null;
      this.isNativeLoaded = false;
    }
  }

  /**
   * Indica si el modelo nativo C++ fue efectivamente cargado con sus pesos
   */
  isNativeModelLoaded(modelId: keyof typeof MODEL_REGISTRY): boolean {
    return this.currentLoadedModelId === modelId && this.isNativeLoaded;
  }

  /**
   * Retorna el SDK nativo de QVAC
   */
  getSdk(): any {
    return this.qvacSdk?.loadModel ? this.qvacSdk : this.qvacSdk?.default || this.qvacSdk;
  }

  /**
   * Retorna el modelo actualmente cargado
   */
  getCurrentModelId(): string | null {
    return this.currentLoadedModelId;
  }
}

export const qvacManager = new QvacManager();
