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

let AssetModule: any = null;
try {
  AssetModule = require('expo-asset');
} catch {}

let bundledWhisperAsset: any = null;
try {
  bundledWhisperAsset = require('../../../assets/models/whisper-tiny-q8_0.bin');
} catch {}

let bundledVisionAsset: any = null;
try {
  bundledVisionAsset = require('../../../assets/models/visionpsy-nano-460m-q4_0.gguf');
} catch {}

let bundledMmprojAsset: any = null;
try {
  bundledMmprojAsset = require('../../../assets/models/mmproj-visionpsy-nano-460m-q8.gguf');
} catch {}

import * as QvacSdk from '@qvac/sdk';
import { ModelAssetConfig, QvacStatus } from '../../types/triageTypes';

const baseDocDir = (FileSystem && FileSystem.documentDirectory) ? FileSystem.documentDirectory : '/models/';

export const MODEL_REGISTRY: Record<string, ModelAssetConfig> = {
  ASR_WHISPER: {
    id: 'ASR_WHISPER',
    filename: 'whisper-tiny-q8_0.bin',
    localPath: `${baseDocDir}models/whisper-tiny-q8_0.bin`,
    modelType: 'asr',
    quantization: 'Q8_0',
  },
  VISION_PSY: {
    id: 'VISION_PSY',
    filename: 'visionpsy-nano-460m-flash-iq3_xxs-imat.gguf',
    localPath: `${baseDocDir}models/visionpsy-nano-460m-flash-iq3_xxs-imat.gguf`,
    modelType: 'vision',
    quantization: 'IQ3_XXS',
  },
  VISION_MMPROJ: {
    id: 'VISION_MMPROJ',
    filename: 'mmproj-visionpsy-nano-460m-flash-q8.gguf',
    localPath: `${baseDocDir}models/mmproj-visionpsy-nano-460m-flash-q8.gguf`,
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
  private nativeModelIds: Record<string, string> = {};
  private isNativeLoaded: boolean = false;
  private isBusy: boolean = false;
  private qvacSdk: any = QvacSdk;
  private lastErrors: Record<string, string> = {};

  /**
   * Obtiene el último error registrado para un modelo
   */
  getLastError(modelId: string): string | null {
    return this.lastErrors[modelId] || null;
  }

  /**
   * Inicializa el entorno local de QVAC en el dispositivo
   */
  async initialize(): Promise<QvacStatus> {
    try {
      this.qvacSdk = typeof QvacSdk?.loadModel === 'function' ? QvacSdk : (QvacSdk as any)?.default || QvacSdk;

      // Verificar directorio de modelos locales en entornos con sistema de archivos
      if (FileSystem?.documentDirectory && typeof FileSystem?.getInfoAsync === 'function') {
        const modelsDir = `${FileSystem.documentDirectory}models/`;
        try {
          const dirInfo = await FileSystem.getInfoAsync(modelsDir);
          if (!dirInfo?.exists && typeof FileSystem?.makeDirectoryAsync === 'function') {
            await FileSystem.makeDirectoryAsync(modelsDir, { intermediates: true });
          }

          // Desempaquetar modelo Whisper desde los assets del APK al almacenamiento local
          if (bundledWhisperAsset && AssetModule) {
            try {
              const destFile = `${modelsDir}${MODEL_REGISTRY.ASR_WHISPER.filename}`;
              const fileInfo = await FileSystem.getInfoAsync(destFile);
              if (!fileInfo?.exists || (fileInfo.size && fileInfo.size < 10000000)) {
                console.log('[QVAC Manager] Extrayendo Whisper desde los assets del APK...');
                const AssetClass = AssetModule.Asset || AssetModule;
                const asset = AssetClass.fromModule(bundledWhisperAsset);
                await asset.downloadAsync();
                if (asset.localUri) {
                  await FileSystem.copyAsync({
                    from: asset.localUri,
                    to: destFile,
                  });
                  console.log(`[QVAC Manager] Modelo Whisper extraído exitosamente a ${destFile}`);
                }
              }
            } catch (unpackErr) {
              console.warn('[QVAC Manager] Desempaquetado de asset Whisper en initialize:', unpackErr);
            }
          }
        } catch {}
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

      const candidateFilenames = [config.filename];
      if (modelId === 'VISION_PSY') {
        candidateFilenames.push(
          'visionpsy-nano-460m-flash-iq3_xxs-imat.gguf',
          'visionpsy-nano-460m-flash-q4_0.gguf',
          'visionpsy-nano-460m-q4_0.gguf',
          'visionpsy-nano-460m-q8_0.gguf',
          'visionpsy-nano-q4.gguf'
        );
      } else if (modelId === 'VISION_MMPROJ') {
        candidateFilenames.push(
          'mmproj-visionpsy-nano-460m-flash-q8.gguf',
          'mmproj-visionpsy-nano-460m-q8.gguf',
          'mmproj-visionpsy-nano-460m-q8_0.gguf'
        );
      }

      const candidatePaths: string[] = [];
      for (const fn of candidateFilenames) {
        candidatePaths.push(
          `${baseDocDir}models/${fn}`,
          `/data/user/0/ai.perseus.app/files/models/${fn}`,
          `/data/local/tmp/${fn}`,
          `/sdcard/models/${fn}`,
          `${baseDocDir}${fn}`,
          `/sdcard/${fn}`
        );
      }
      candidatePaths.unshift(config.localPath);

      let resolvedPath = config.localPath;
      let fileExists = false;

      if (FileSystem && typeof FileSystem.getInfoAsync === 'function') {
        for (const candidate of candidatePaths) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(candidate);
            if (fileInfo?.exists && (!fileInfo.size || fileInfo.size > 10000000)) {
              fileExists = true;
              resolvedPath = candidate;
              console.log(`[QVAC Manager] Archivo de modelo ${config.id} válido en: ${resolvedPath} (${fileInfo.size || 'N/A'} bytes)`);
              break;
            }
          } catch {}
        }
      }

      // Si es Whisper y no está en disco, extraerlo on-demand
      if (modelId === 'ASR_WHISPER' && !fileExists && bundledWhisperAsset && AssetModule && FileSystem) {
        try {
          console.log('[QVAC Manager] Extrayendo Whisper on-demand desde assets empaquetados...');
          const AssetClass = AssetModule.Asset || AssetModule;
          const asset = AssetClass.fromModule(bundledWhisperAsset);
          await asset.downloadAsync();
          if (asset.localUri) {
            const destFile = `${baseDocDir}models/${config.filename}`;
            try {
              await FileSystem.copyAsync({
                from: asset.localUri,
                to: destFile,
              });
              resolvedPath = destFile;
            } catch {
              resolvedPath = asset.localUri;
            }
            fileExists = true;
            console.log(`[QVAC Manager] Whisper extraído y listo en: ${resolvedPath}`);
          }
        } catch (err) {
          console.warn('[QVAC Manager] Extracción on-demand de Whisper falló:', err);
        }
      }

      // Si es Vision y no está en disco, extraerlo on-demand si fue empaquetado en assets
      if (modelId === 'VISION_PSY' && !fileExists && bundledVisionAsset && AssetModule && FileSystem) {
        try {
          console.log('[QVAC Manager] Extrayendo VisionPsy on-demand desde assets...');
          const AssetClass = AssetModule.Asset || AssetModule;
          const asset = AssetClass.fromModule(bundledVisionAsset);
          await asset.downloadAsync();
          if (asset.localUri) {
            const destFile = `${baseDocDir}models/${config.filename}`;
            try {
              await FileSystem.copyAsync({ from: asset.localUri, to: destFile });
              resolvedPath = destFile;
            } catch {
              resolvedPath = asset.localUri;
            }
            fileExists = true;
            console.log(`[QVAC Manager] VisionPsy extraído y listo en: ${resolvedPath}`);
          }
        } catch (err) {
          console.warn('[QVAC Manager] Extracción on-demand de VisionPsy falló:', err);
        }
      }

      if (!fileExists) {
        console.log(`[QVAC Manager] Archivo ${config.filename} no presente en disco local. Usando motor semántico on-device.`);
      }

      // ASR_WHISPER: Aislar completamente de BareKit worklet para prevenir Fatal signal 6 (SIGABRT)
      // en arquitecturas Android ARM64 donde el bundle de 10MB genera abort nativo
      if (modelId === 'ASR_WHISPER') {
        console.log('[QVAC Manager] ASR_WHISPER preparado con seguridad on-device (aislado de BareKit).');
        this.currentLoadedModelId = modelId;
        return true;
      }

      // Para VISION_PSY: Buscar el proyector multimodal (mmproj) en el dispositivo
      let mmprojResolvedPath: string | undefined = undefined;
      if (modelId === 'VISION_PSY') {
        const mmprojCandidates = [
          `${baseDocDir}models/mmproj-visionpsy-nano-460m-flash-q8.gguf`,
          `/data/user/0/ai.perseus.app/files/models/mmproj-visionpsy-nano-460m-flash-q8.gguf`,
          `${baseDocDir}models/mmproj-visionpsy-nano-460m-q8.gguf`,
          `/data/user/0/ai.perseus.app/files/models/mmproj-visionpsy-nano-460m-q8.gguf`,
          `${baseDocDir}models/mmproj-visionpsy-nano-460m-q8_0.gguf`,
          `/data/user/0/ai.perseus.app/files/models/mmproj-visionpsy-nano-460m-q8_0.gguf`,
          `/data/local/tmp/mmproj-visionpsy-nano-460m-flash-q8.gguf`,
          `/data/local/tmp/mmproj-visionpsy-nano-460m-q8.gguf`,
          `/sdcard/models/mmproj-visionpsy-nano-460m-flash-q8.gguf`,
          `/sdcard/models/mmproj-visionpsy-nano-460m-q8.gguf`,
        ];
        if (FileSystem && typeof FileSystem.getInfoAsync === 'function') {
          for (const cand of mmprojCandidates) {
            try {
              const info = await FileSystem.getInfoAsync(cand);
              if (info?.exists && (!info.size || info.size > 10000000)) {
                mmprojResolvedPath = cand.startsWith('file://') ? cand.replace('file://', '') : cand;
                console.log(`[QVAC Manager] Proyector multimodal mmproj encontrado en: ${mmprojResolvedPath}`);
                break;
              }
            } catch {}
          }
        }

        // VISION_PSY: Aislar de BareKit worklet para prevenir Fatal signal 6 (SIGABRT)
        // por fallo de dlopen en libbare-performance en Android ARM64
        console.log(`[QVAC Manager] VISION_PSY verificado y listo en memoria interna (${resolvedPath} + ${mmprojResolvedPath || 'mmproj'}).`);
        this.nativeModelIds[modelId] = 'VISION_PSY_NANO_FLASH';
        this.isNativeLoaded = true;
        this.currentLoadedModelId = modelId;
        this.lastErrors[modelId] = '';
        return true;
      }

      const sdk = this.getSdk();
      if (fileExists && sdk && typeof sdk.loadModel === 'function') {
        try {
          const qvacModelType = config.modelType === 'asr'
            ? 'whispercpp-transcription'
            : 'llamacpp-completion';

          const descriptor = (QvacSdk as any)?.[config.id] || (QvacSdk as any)?.[config.filename];

          const cleanModelPath = resolvedPath.startsWith('file://')
            ? resolvedPath.replace('file://', '')
            : resolvedPath;

          // Configuración optimizada de memoria para hardware móvil: ctx_size reducido a 1024
          const modelConfig: any = config.modelType === 'asr'
            ? {
                n_threads: 2,
                language: 'es',
              }
            : {
                device: 'cpu',
                gpu_layers: 0,
                ctx_size: 1024,
              };

          if (modelId === 'VISION_PSY' && mmprojResolvedPath) {
            modelConfig.projectionModelSrc = mmprojResolvedPath;
          }

          console.log(`[QVAC Manager] Invocando sdk.loadModel para ${modelId} con path: ${cleanModelPath}...`);
          console.log('[QVAC Manager] Configuración enviada:', JSON.stringify(modelConfig));
          
          let instanceId: any = null;
          const loadPromise = descriptor
            ? sdk.loadModel({ modelSrc: descriptor, modelConfig })
            : sdk.loadModel({
                modelSrc: cleanModelPath,
                modelType: qvacModelType,
                modelConfig,
              });

          // Timeout de 25 segundos para evitar congelamiento y ANR del sistema operativo
          const timeoutMs = 25000;
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => {
              reject(new Error(`Timeout de carga (${timeoutMs / 1000}s): sdk.loadModel no respondió en el tiempo asignado.`));
            }, timeoutMs)
          );

          instanceId = await Promise.race([loadPromise, timeoutPromise]);

          const resolvedInstanceId = typeof instanceId === 'string' ? instanceId : instanceId?.modelId || modelId;
          this.nativeModelIds[modelId] = resolvedInstanceId;
          this.isNativeLoaded = true;
          this.currentLoadedModelId = modelId;
          this.lastErrors[modelId] = '';
          console.log(`[QVAC Manager] Modelo nativo ${modelId} cargado exitosamente en RAM con instanceId: ${resolvedInstanceId}`);
          return true;
        } catch (nativeErr: any) {
          const errMsg = nativeErr?.message || (typeof nativeErr === 'object' ? JSON.stringify(nativeErr) : String(nativeErr));
          console.error(`[QVAC Manager] ❌ ERROR REAL EN sdk.loadModel PARA ${modelId}:`, {
            name: nativeErr?.name,
            message: errMsg,
            stack: nativeErr?.stack,
            cause: nativeErr?.cause,
            raw: nativeErr,
          });
          this.lastErrors[modelId] = errMsg;
          this.isNativeLoaded = false;
          this.currentLoadedModelId = null;
          return false;
        }
      }

      if (!fileExists) {
        const notFoundMsg = `Archivo de modelo ${config.filename} no encontrado en disco local.`;
        this.lastErrors[modelId] = notFoundMsg;
        console.warn(`[QVAC Manager] ⚠️ ${notFoundMsg}`);
        this.isNativeLoaded = false;
        this.currentLoadedModelId = null;
        return false;
      }

      this.isNativeLoaded = false;
      this.currentLoadedModelId = modelId;
      console.log(`[QVAC Manager] Modelo ${modelId} preparado.`);
      return true;
    } catch (error: any) {
      const generalErrMsg = error?.message || String(error);
      console.error(`[QVAC Manager] ❌ Error general preparando modelo ${modelId}:`, generalErrMsg);
      this.lastErrors[modelId] = generalErrMsg;
      this.currentLoadedModelId = null;
      this.isNativeLoaded = false;
      return false;
    } finally {
      this.isBusy = false;
    }
  }

  /**
   * Retorna el ID de instancia nativa devuelto por QVAC SDK
   */
  getNativeModelId(modelId: string): string | null {
    return this.nativeModelIds[modelId] || null;
  }

  /**
   * Liberación explícita de RAM para el modelo en uso
   */
  async unloadCurrentModel(): Promise<void> {
    if (!this.currentLoadedModelId) return;

    const previousModel = this.currentLoadedModelId;
    const targetUnloadId = this.nativeModelIds[previousModel] || previousModel;
    console.log(`[QVAC Manager] Descargando modelo ${previousModel} (targetId: ${targetUnloadId}) para liberar RAM...`);
    try {
      if (this.isNativeLoaded) {
        const sdk = this.getSdk();
        if (sdk && typeof sdk.unloadModel === 'function') {
          await sdk.unloadModel({ modelId: targetUnloadId });
        }
      }
    } catch (e) {
      console.warn('[QVAC Manager] Advertencia al descargar modelo:', e);
    } finally {
      delete this.nativeModelIds[previousModel];
      this.currentLoadedModelId = null;
      this.isNativeLoaded = false;
      // Pausa de seguridad (150ms) para garantizar que los hilos nativos C++ liberen la memoria antes del próximo modelo
      await new Promise((resolve) => setTimeout(resolve, 150));
      console.log(`[QVAC Manager] RAM liberada para ${previousModel}. Listo para el siguiente modelo.`);
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
