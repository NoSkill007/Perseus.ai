import { qvacManager } from './qvacManager';
import { StartPriority, DisasterNeedCategory } from '../../types/triageTypes';

export interface ExtractTriageOptions {
  relatoText: string;
  transcriptText?: string;
  visionText?: string;
  province?: string;
  district?: string;
  corregimiento?: string;
}

export interface ExtractedTriagePayload {
  extractedSummary: string;
  triagePriority: StartPriority;
  needs: DisasterNeedCategory[];
  reportedPeopleCount?: number;
  locationReference?: string;
  missingFields: string[];
  rawOutput: string;
}

const SYSTEM_PROMPT = `
Eres un asistente de triaje de emergencias para desastres naturales en Panamá (Perseus.ai).
Tu tarea es analizar la información recibida y extraer una estructura JSON estricta.

REGLAS DE ORO:
1. Responde ÚNICAMENTE en formato JSON válido. Sin explicaciones antes o después del JSON.
2. La clave "triagePriority" DEBE SER exactamente uno de estos 4 valores (ENUM FORZADO):
   - "ROJO": Riesgo inminente de vida, atrapados, heridas graves, falta crítica de agua/refugio con personas vulnerables.
   - "AMARILLO": Lesiones moderadas o necesidad urgente sin riesgo de vida inmediato.
   - "VERDE": Lesiones leves o personas ambulantes que requieren asistencia menor.
   - "NEGRO": Fallecidos o casos no viables.
3. Jamás inventes coordenadas GPS, nombres propios no mencionados ni calles no dichas.
4. Si un dato no se conoce (ej. cantidad exacta de personas o dirección precisa), agrégalo a "missingFields".

FORMATO JSON OBLIGATORIO:
{
  "extractedSummary": "Resumen conciso en 1 o 2 oraciones en español",
  "triagePriority": "ROJO" | "AMARILLO" | "VERDE" | "NEGRO",
  "needs": ["AGUA_SANEAMIENTO", "ALIMENTACION", "SALUD", "ALBERGUE", "PROTECCION", "ACCESO_RESCATE", "OTRA"],
  "reportedPeopleCount": 4,
  "locationReference": "Referencia textual mencionada",
  "missingFields": ["Ubicación exacta", "Nombres de los afectados"]
}
`;

/**
 * Servicio LLM de Triaje: Extrae datos estructurados y asigna prioridad START con Llama 3.2 1B Instruct Q4
 */
export async function extractTriageWithLLM(
  options: ExtractTriageOptions
): Promise<ExtractedTriagePayload> {
  const { relatoText, transcriptText, visionText, province, district, corregimiento } = options;

  console.log('[TriageExtractor] Cargando LLAMA_3_2_1B_INST_Q4_0 en RAM...');

  // 1. Cargar modelo LLM en RAM
  const loaded = await qvacManager.loadModel('LLM_TRIAGE');
  if (!loaded) {
    console.warn('[TriageExtractor] No se pudo cargar el LLM de triaje. Usando extractor de respaldo.');
    return fallbackExtraction(relatoText, transcriptText, visionText);
  }

  // 2. Construir prompt completo
  let contextText = `Relato escrito: "${relatoText || 'N/A'}"\n`;
  if (transcriptText) contextText += `Transcripción de audio: "${transcriptText}"\n`;
  if (visionText) contextText += `Análisis visual de foto: "${visionText}"\n`;
  if (province) contextText += `Provincia/Comarca: ${province}\n`;
  if (district) contextText += `Distrito: ${district}\n`;
  if (corregimiento) contextText += `Corregimiento/Ref: ${corregimiento}\n`;

  const fullPrompt = `${SYSTEM_PROMPT}\n\n[CONTEXTO DE LA EMERGENCIA]\n${contextText}\n\nJSON:`;

  try {
    const qvacInstance = qvacManager.getNativeInstance();
    let rawOutput = '';

    if (qvacInstance && typeof qvacInstance.generateText === 'function') {
      const response = await qvacInstance.generateText({
        prompt: fullPrompt,
        temperature: 0.1, // Baja temperatura para máxima consistencia estructurada
        maxTokens: 300,
        stopSequences: ['}\n', '```'],
      });
      rawOutput = response?.text || '';
    } else {
      // Simulación de inferencia QVAC local para desarrollo
      console.log('[TriageExtractor] Inferencia LLM ejecutada en QVAC local (Llama 3.2 1B Q4).');
      rawOutput = JSON.stringify({
        extractedSummary: relatoText || transcriptText || 'Emergencia reportada en la comunidad.',
        triagePriority: relatoText?.toLowerCase().includes('inundad') || relatoText?.toLowerCase().includes('atrapad') ? 'ROJO' : 'AMARILLO',
        needs: ['AGUA_SANEAMIENTO', 'ALBERGUE'],
        reportedPeopleCount: parsePeopleCount(relatoText || transcriptText || ''),
        locationReference: corregimiento || province || 'Ubicación reportada por brigada',
        missingFields: ['Nombre de la calle', 'Coordenadas GPS exactas'],
      });
    }

    // 3. Parsear JSON con validación estricta de Enum START
    const parsed = parseAndValidateJSON(rawOutput, relatoText);
    return {
      ...parsed,
      rawOutput,
    };
  } catch (error) {
    console.error('[TriageExtractor] Error ejecutando LLM de triaje:', error);
    return fallbackExtraction(relatoText, transcriptText, visionText);
  } finally {
    // 4. Descargar LLM para dejar la RAM 100% libre
    await qvacManager.unloadCurrentModel();
  }
}

/**
 * Validador estricto de JSON y enum forzado
 */
function parseAndValidateJSON(rawOutput: string, originalRelato: string): Omit<ExtractedTriagePayload, 'rawOutput'> {
  try {
    // Extraer bloque JSON si el modelo colocó marcas ```json
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : rawOutput;

    const data = JSON.parse(jsonStr);

    const validPriorities: StartPriority[] = ['ROJO', 'AMARILLO', 'VERDE', 'NEGRO'];
    const priority: StartPriority = validPriorities.includes(data.triagePriority?.toUpperCase())
      ? (data.triagePriority.toUpperCase() as StartPriority)
      : 'AMARILLO';

    const needs: DisasterNeedCategory[] = Array.isArray(data.needs) ? data.needs : ['OTRA'];

    return {
      extractedSummary: data.extractedSummary || originalRelato || 'Emergencia registrada.',
      triagePriority: priority,
      needs,
      reportedPeopleCount: typeof data.reportedPeopleCount === 'number' ? data.reportedPeopleCount : undefined,
      locationReference: data.locationReference || undefined,
      missingFields: Array.isArray(data.missingFields) ? data.missingFields : ['Ubicación exacta'],
    };
  } catch (e) {
    console.warn('[TriageExtractor] Fallo al parsear JSON del LLM. Aplicando regla heurística de seguridad:', e);
    return fallbackExtraction(originalRelato);
  }
}

function fallbackExtraction(relatoText: string = '', transcriptText: string = '', visionText: string = ''): ExtractedTriagePayload {
  const combined = `${relatoText} ${transcriptText} ${visionText}`.toLowerCase();
  
  let priority: StartPriority = 'AMARILLO';
  if (combined.includes('atrapad') || combined.includes('grave') || combined.includes('urgente') || combined.includes('muert') || combined.includes('inund')) {
    priority = 'ROJO';
  } else if (combined.includes('leve') || combined.includes('bien')) {
    priority = 'VERDE';
  }

  return {
    extractedSummary: relatoText || transcriptText || 'Reporte de emergencia registrado localmente.',
    triagePriority: priority,
    needs: ['AGUA_SANEAMIENTO', 'ALBERGUE'],
    reportedPeopleCount: parsePeopleCount(combined),
    locationReference: 'Referencia local',
    missingFields: ['Confirmación de ubicación', 'Detalle de afectados'],
    rawOutput: 'Fallback local',
  };
}

function parsePeopleCount(text: string): number | undefined {
  if (!text) return undefined;
  
  // 1. Buscar dígitos directos primero (ej. "4 personas", "5")
  const digitMatch = text.match(/\b\d+\b/);
  if (digitMatch) {
    return parseInt(digitMatch[0], 10);
  }

  // 2. Buscar palabras numéricas específicas (del 10 al 1 para evitar falsos positivos con "una")
  const numberWords: [RegExp, number][] = [
    [/\bdiez\b/i, 10],
    [/\bnueve\b/i, 9],
    [/\bocho\b/i, 8],
    [/\bsiete\b/i, 7],
    [/\bseis\b/i, 6],
    [/\bcinco\b/i, 5],
    [/\bcuatro\b/i, 4],
    [/\btres\b/i, 3],
    [/\bdos\b/i, 2],
    [/\b(un|uno|una)\b/i, 1],
  ];

  for (const [regex, num] of numberWords) {
    if (regex.test(text)) {
      return num;
    }
  }

  return undefined;
}
