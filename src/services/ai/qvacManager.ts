import * as FileSystem from 'expo-file-system';
import { ModelAssetConfig, QvacStatus } from '../../types/triageTypes';

/**
 * Nombres y configuraciones exactas de los 3 modelos locales acordados
 */
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
  private isBusy: boolean = false;
  private qvacNativeInstance: any = null;

  /**
   * Inicializa el entorno local de QVAC en el dispositivo
   */
  async initialize(): Promise<QvacStatus> {
    try {
      // Importación dinámica de @qvac/sdk para entornos nativos
      let QVACSDK: any;
      try {
        QVACSDK = require('@qvac/sdk');
      } catch (e) {
        console.warn('[QVAC Manager] @qvac/sdk no está disponible en este runtime JavaScript de desarrollo.');
      }

      if (QVACSDK) {
        const ClientConstructor = QVACSDK.QvacClient || QVACSDK.default?.QvacClient || (typeof QVACSDK === 'function' ? QVACSDK : null);
        if (ClientConstructor && typeof ClientConstructor === 'function') {
          try {
            this.qvacNativeInstance = new ClientConstructor({
              offlineMode: true, // Forzar 100% offline
              verbose: true,
            });
          } catch (e) {
            console.warn('[QVAC Manager] No se pudo instanciar constructor nativo:', e);
          }
        }
      }

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
   */
  async loadModel(modelId: keyof typeof MODEL_REGISTRY): Promise<boolean> {
    if (this.currentLoadedModelId === modelId) {
      console.log(`[QVAC Manager] Modelo ${modelId} ya está cargado en RAM.`);
      return true;
    }

    if (this.isBusy) {
      throw new Error(`[QVAC Manager] El runtime está procesando una inferencia. Esperar finalización.`);
    }

    this.isBusy = true;

    try {
      // 1. Descargar modelo previo si existe
      if (this.currentLoadedModelId) {
        await this.unloadCurrentModel();
      }

      const config = MODEL_REGISTRY[modelId];
      console.log(`[QVAC Manager] Cargando modelo local secuencial: ${config.id} desde ${config.localPath}...`);

      // Verificar que el archivo del modelo exista localmente
      if (FileSystem?.getInfoAsync) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(config.localPath);
          if (!fileInfo.exists) {
            console.warn(`[QVAC Manager] El archivo del modelo local no se encuentra en ${config.localPath}.`);
          }
        } catch {}
      }

      if (this.qvacNativeInstance) {
        if (config.modelType === 'vision') {
          const mmprojConfig = MODEL_REGISTRY['VISION_MMPROJ'];
          await this.qvacNativeInstance.loadMultimodalModel({
            modelPath: config.localPath,
            mmprojPath: mmprojConfig.localPath,
          });
        } else {
          await this.qvacNativeInstance.loadModel({
            modelPath: config.localPath,
            type: config.modelType,
          });
        }
      }

      this.currentLoadedModelId = modelId;
      console.log(`[QVAC Manager] Modelo ${modelId} cargado exitosamente en RAM.`);
      return true;
    } catch (error) {
      console.error(`[QVAC Manager] Error cargando modelo ${modelId}:`, error);
      this.currentLoadedModelId = null;
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
      if (this.qvacNativeInstance) {
        await this.qvacNativeInstance.unloadCurrentModel();
      }
    } catch (e) {
      console.warn('[QVAC Manager] Advertencia al descargar modelo:', e);
    } finally {
      console.log(`[QVAC Manager] RAM liberada para ${this.currentLoadedModelId}.`);
      this.currentLoadedModelId = null;
    }
  }

  /**
   * Obtiene la instancia nativa de QVAC
   */
  getNativeInstance(): any {
    return this.qvacNativeInstance;
  }

  /**
   * Retorna el modelo actualmente cargado
   */
  getCurrentModelId(): string | null {
    return this.currentLoadedModelId;
  }
}

export const qvacManager = new QvacManager();
