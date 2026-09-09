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

// =============================================
// Tipos de la App (Persona A)
// =============================================

export type AppRole = 'ciudadano' | 'rescatista';

export type ReportStatus =
  | 'borrador'
  | 'confirmado'
  | 'enviado'
  | 'recibido'
  | 'en_atencion'
  | 'completado';

export type Sex = 'M' | 'F' | 'Otro';

export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export interface UserProfile {
  id?: number;
  fullName: string;
  age: number;
  sex: Sex;
  phone: string;
  address?: string;
  province: string;
  bloodType?: BloodType;
  hasDisability: boolean;
  disabilityDescription?: string;
  medicalConditions?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  role: AppRole;
  createdAt: number;
  updatedAt: number;
}

export type ReportSource = 'local' | 'received';

export interface ReportRecord {
  reportId: string;
  createdAt: number;
  source: ReportSource;
  status: ReportStatus;

  // Datos de TriageResult
  transcript?: string;
  visionSeverity?: string;
  extractedSummary: string;
  triagePriority: StartPriority;
  needs: DisasterNeedCategory[];
  reportedPeopleCount?: number;
  locationReference?: string;
  missingFields: string[];
  rawModelOutput?: string;
  isLocalInference: boolean;
  executionTimeMs: number;

  // Ubicación manual
  province?: string;
  district?: string;
  corregimiento?: string;

  // Perfil del reportante (para reportes recibidos via P2P)
  reporterProfile?: UserProfile;

  // Sincronización
  syncEventId?: string;
  sentAt?: number;
  receivedAt?: number;
  ackReceived: boolean;

  updatedAt: number;
}

export interface SyncEvent {
  eventId: string;
  reportId: string;
  direction: 'sent' | 'received';
  peerIp?: string;
  timestamp: number;
  ackReceived: boolean;
}
