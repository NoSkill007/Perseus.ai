/**
 * Tipos de datos para el pipeline de IA y Triaje Emergencial en Perseus.ai
 */

export type StartPriority = 'ROJO' | 'AMARILLO' | 'VERDE' | 'NEGRO';

export type DisasterNeedCategory =
  | 'AGUA_SANEAMIENTO'
  | 'ALIMENTACION'
  | 'SALUD'
  | 'ALBERGUE'
  | 'PROTECCION'
  | 'ACCESO_RESCATE'
  | 'OTRA'
  | 'DESCONOCIDA';

export interface TriageInput {
  /** Ruta local al archivo de audio grabado (.wav / .m4a / .mp3) */
  audioUri?: string;
  /** Ruta local a la imagen tomada de la escena de emergencia */
  imageUri?: string;
  /** Relato en texto escrito directamente por la brigada o afectado */
  textRelato?: string;
  /** Provincia o Comarca seleccionada por el operador (ej. 'Chiriquí') */
  province?: string;
  /** Distrito (opcional) */
  district?: string;
  /** Corregimiento o referencia territorial (opcional) */
  corregimiento?: string;
  /** Identificador único del dispositivo creador */
  operatorDeviceId?: string;
}

export interface TriageResult {
  reportId: string;
  createdAt: number;
  /** Transcripción local generada por WHISPER_BASE_Q8_0 */
  transcript?: string;
  /** Análisis de severidad visual generado por VISIONPSY_NANO_460M_MULTIMODAL_Q8_0 */
  visionSeverity?: string;
  /** Resumen conciso de la emergencia generado por LLAMA_3_2_1B_INST_Q4_0 */
  extractedSummary: string;
  /** Prioridad START (Enum forzado: ROJO, AMARILLO, VERDE, NEGRO) */
  triagePriority: StartPriority;
  /** Categorías de necesidad identificadas (Estándar Esfera + Perseus) */
  needs: DisasterNeedCategory[];
  /** Cantidad estimada de personas afectadas/reportadas */
  reportedPeopleCount?: number;
  /** Referencia textual de ubicación extraída del relato */
  locationReference?: string;
  /** Campos o datos ausentes que requieren revisión o confirmación humana */
  missingFields: string[];
  /** Salida cruda emitida por el modelo para auditoría */
  rawModelOutput?: string;
  /** Bandera que confirma que la inferencia fue 100% local on-device con QVAC */
  isLocalInference: boolean;
  /** Tiempo total de procesamiento en milisegundos */
  executionTimeMs: number;
}

export interface ModelAssetConfig {
  id: string;
  filename: string;
  localPath: string;
  modelType: 'asr' | 'vision' | 'vision_proj' | 'llm';
  quantization: string;
  sha256?: string;
}

export interface QvacStatus {
  isInitialized: boolean;
  loadedModelId?: string;
  deviceSupported: boolean;
  availableMemoryMB?: number;
}
