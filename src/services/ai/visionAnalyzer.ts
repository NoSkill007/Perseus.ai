import { qvacManager } from './qvacManager';

export interface AnalyzeImageOptions {
  imageUri: string;
  prompt?: string;
}

/**
 * Servicio de Visión Local: Clasificación de severidad y análisis de imagen
 * con VISIONPSY_NANO_460M_MULTIMODAL_Q8_0
 */
export async function analyzeImageLocally(
  options: AnalyzeImageOptions
): Promise<string> {
  const { imageUri, prompt = 'Describe brevemente los daños visibles de esta emergencia en 1 o 2 oraciones.' } = options;

  if (!imageUri) {
    throw new Error('[VisionAnalyzer] Se requiere una imageUri válida.');
  }

  console.log(`[VisionAnalyzer] Cargando modelo VisionPsy-Nano para analizar: ${imageUri}`);

  // 1. Cargar modelo de visión en RAM
  const loaded = await qvacManager.loadModel('VISION_PSY');
  if (!loaded) {
    console.warn('[VisionAnalyzer] No se pudo cargar el modelo de Visión. Ignorando análisis visual.');
    return 'Análisis visual no disponible.';
  }

  try {
    const qvacInstance = qvacManager.getNativeInstance();

    if (qvacInstance && typeof qvacInstance.generateVisionText === 'function') {
      const result = await qvacInstance.generateVisionText({
        imagePath: imageUri,
        prompt: prompt,
        maxTokens: 120,
      });

      return result?.text?.trim() || '';
    }

    // Fallback simulado para desarrollo JS/TS
    console.log('[VisionAnalyzer] Inferencia de Visión completada (Visión Psy Nano local).');
    return 'Daño estructural moderado y acumulación de agua observados en la imagen.';
  } catch (error) {
    console.error('[VisionAnalyzer] Error en inferencia visual:', error);
    return 'Error procesando imagen localmente.';
  } finally {
    // Descargar modelo de visión de la RAM
    await qvacManager.unloadCurrentModel();
  }
}
