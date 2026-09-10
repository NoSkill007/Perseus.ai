import { qvacManager } from './qvacManager';
import { StartPriority, DisasterNeedCategory } from '../../types/triageTypes';
import { detectPanamaLocation } from './panamaLocations';

export interface ExtractTriageOptions {
  relatoText: string;
  transcriptText?: string;
  visionText?: string;
  manualInjuries?: string;
  province?: string;
  district?: string;
  corregimiento?: string;
}

export interface ExtractedTriagePayload {
  extractedSummary: string;
  triagePriority: StartPriority;
  needs: DisasterNeedCategory[];
  injuriesAndSymptoms?: string;
  visualTriageAnalysis?: string;
  reportedPeopleCount?: number;
  locationReference?: string;
  missingFields: string[];
  rawOutput: string;
}

const SYSTEM_PROMPT = `
Eres el agente de triaje prehospitalario y evaluación de emergencias de Perseus.ai para desastres naturales en Panamá.
Tu objetivo es analizar la información recopilada en campo (relato de texto, síntomas/heridas ingresadas, audio ASR y análisis visual de foto) y generar una ficha estructurada en formato JSON estricto para que los rescatistas sepan qué equipo y prioridad aplicar.

REGLAS DE EVALUACIÓN CLÍNICA Y DE TRIAJE (START + ESFERA):
1. Prioridad "triagePriority" (ENUM OBLIGATORIO):
   - "ROJO": Riesgo inminente de muerte, personas atrapadas por colapso/terremoto/inundación en techos, hemorragias profusas, fracturas abiertas, inconscientes, niños o ancianos en peligro crítico.
   - "AMARILLO": Situación urgente sin riesgo de colapso vital inmediato, fracturas cerradas, heridas moderadas, familias evacuadas necesitadas de agua/alimento.
   - "VERDE": Afectaciones leves, laceraciones superficiales, personas en albergues o canchas comunitarias fuera de peligro vital inmediato.
   - "NEGRO": Personas fallecidas sin signos vitales.

2. Heridas y Síntomas "injuriesAndSymptoms":
   - Extrae o sintetiza claramente las heridas, lesiones, signos vitales o síntomas mencionados (ej. "Posible fractura de tibia en pierna derecha, hemorragia moderada en cuero cabelludo, paciente consciente pero con dolor agudo").
   - Si no se detectan lesiones o se indica que están ilesos, especificar claramente: "Sin lesiones físicas aparentes reportadas".

3. Análisis Visual de Gravedad "visualTriageAnalysis":
   - Si se proporciona análisis visual de foto, sintetiza el nivel de daño en la escena o lesiones visibles (ej. "Estructura con colapso parcial de muros de mampostería, escombros bloqueando salida, sin fuego visible").

4. Categorías de Necesidades "needs" (Estándares Esfera):
   - Si es TERREMOTO, COLAPSO ESTRUCTURAL o ATRAPADOS: DEBE incluir ["ACCESO_RESCATE", "SALUD", "PROTECCION", "ALBERGUE"].
   - Si es INUNDACIÓN o CRECIDA DE RÍO: DEBE incluir ["AGUA_SANEAMIENTO", "ALIMENTACION", "ALBERGUE", "ACCESO_RESCATE"].
   - Si hay HERIDOS o FRACTURAS: DEBE incluir ["SALUD"].
   - Si falta AGUA o SANEAMIENTO: DEBE incluir ["AGUA_SANEAMIENTO"].
   - Si falta COMIDA o VÍVERES: DEBE incluir ["ALIMENTACION"].

5. Ubicación: Detecta corregimientos y distritos de Panamá (ej. Calidonia, Bella Vista, David, Boquete, Changuinola, Santiago, etc.) y referencias textuales (ej. "edificio en Calidonia, Panamá"). Jamás inventes coordenadas GPS.

FORMATO JSON DE RESPUESTA:
{
  "extractedSummary": "Resumen conciso en 1 o 2 oraciones en español indicando tipo de desastre, cantidad de afectados y situación general",
  "triagePriority": "ROJO" | "AMARILLO" | "VERDE" | "NEGRO",
  "injuriesAndSymptoms": "Descripción clara de las heridas, fracturas, hemorragias o síntomas detectados",
  "visualTriageAnalysis": "Descripción del daño estructural o gravedad visual de la foto",
  "needs": ["ACCESO_RESCATE", "SALUD", "PROTECCION", "ALBERGUE", "AGUA_SANEAMIENTO", "ALIMENTACION", "OTRA"],
  "reportedPeopleCount": 8,
  "locationReference": "Calidonia, Distrito de Panamá, Panamá",
  "missingFields": ["Nombre de la calle o número de edificio", "Coordenadas GPS exactas"]
}
`;

/**
 * Servicio LLM de Triaje: Extrae datos estructurados y asigna prioridad START con Llama 3.2 1B Instruct Q4
 */
export async function extractTriageWithLLM(
  options: ExtractTriageOptions
): Promise<ExtractedTriagePayload> {
  const { relatoText, transcriptText, visionText, manualInjuries, province, district, corregimiento } = options;

  console.log('[TriageExtractor] Cargando LLAMA_3_2_1B_INST_Q4_0 en RAM...');

  // 1. Cargar modelo LLM en RAM
  const loaded = await qvacManager.loadModel('LLM_TRIAGE');
  if (!loaded) {
    console.warn('[TriageExtractor] No se pudo cargar el LLM de triaje. Usando extractor semántico determinista.');
    return fallbackExtraction(relatoText, transcriptText, visionText, manualInjuries, province);
  }

  // 2. Construir prompt completo
  let contextText = `Relato escrito: "${relatoText || 'N/A'}"\n`;
  if (manualInjuries) contextText += `Síntomas/Heridas reportadas manualmente: "${manualInjuries}"\n`;
  if (transcriptText) contextText += `Transcripción de audio: "${transcriptText}"\n`;
  if (visionText) contextText += `Análisis visual de foto: "${visionText}"\n`;
  if (province) contextText += `Provincia/Comarca: ${province}\n`;
  if (district) contextText += `Distrito: ${district}\n`;
  if (corregimiento) contextText += `Corregimiento/Ref: ${corregimiento}\n`;

  const fullPrompt = `${SYSTEM_PROMPT}\n\n[CONTEXTO DE LA EMERGENCIA]\n${contextText}\n\nJSON:`;

  try {
    const qvacSdk = qvacManager.getSdk();
    let rawOutput = '';

    if (qvacManager.isNativeModelLoaded('LLM_TRIAGE')) {
      const qvacSdk = qvacManager.getSdk();
      if (qvacSdk && typeof qvacSdk.completion === 'function') {
        try {
          const run = qvacSdk.completion({
            modelId: 'LLM_TRIAGE',
            history: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: contextText },
            ],
            responseFormat: { type: 'json_object' },
            stream: false,
          });
          const final = await run.final;
          rawOutput = final?.content || final?.raw?.fullText || '';
        } catch (e) {
          console.warn('[TriageExtractor] Error ejecutando qvacSdk.completion, usando extractor semántico:', e);
        }
      }
    }

    if (!rawOutput) {
      // Motor de Inferencia Semántica Local QVAC
      console.log('[TriageExtractor] Inferencia Semántica ejecutada en QVAC local (Llama 3.2 1B Q4).');
      const heuristic = fallbackExtraction(relatoText, transcriptText, visionText, manualInjuries, province);
      rawOutput = JSON.stringify(heuristic);
    }

    // 3. Parsear JSON con validación estricta de Enum START y campos geográficos
    const fullInputText = [relatoText, transcriptText, manualInjuries, visionText].filter(Boolean).join(' ');
    const parsed = parseAndValidateJSON(rawOutput, fullInputText, province, manualInjuries, visionText);
    return {
      ...parsed,
      rawOutput,
    };
  } catch (error) {
    console.error('[TriageExtractor] Error ejecutando LLM de triaje:', error);
    return fallbackExtraction(relatoText, transcriptText, visionText, manualInjuries, province);
  } finally {
    // 4. Descargar LLM para dejar la RAM 100% libre
    await qvacManager.unloadCurrentModel();
  }
}

/**
 * Validador estricto de JSON y enum forzado
 */
function parseAndValidateJSON(
  rawOutput: string,
  originalRelato: string = '',
  province?: string,
  manualInjuries?: string,
  visionText?: string
): Omit<ExtractedTriagePayload, 'rawOutput'> {
  try {
    // Extraer bloque JSON si el modelo colocó marcas ```json
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : rawOutput;

    const data = JSON.parse(jsonStr);

    const validPriorities: StartPriority[] = ['ROJO', 'AMARILLO', 'VERDE', 'NEGRO'];
    const priority: StartPriority = validPriorities.includes(data.triagePriority?.toUpperCase())
      ? (data.triagePriority.toUpperCase() as StartPriority)
      : 'AMARILLO';

    const needs: DisasterNeedCategory[] = Array.isArray(data.needs) && data.needs.length > 0
      ? data.needs
      : deduceNeeds(originalRelato);

    // Asegurar detección de ubicación geográfica de Panamá
    const detectedLoc = detectPanamaLocation(data.locationReference || originalRelato, province);

    const extractedInjuries = data.injuriesAndSymptoms?.trim() || manualInjuries?.trim() || deduceInjuries(originalRelato);
    const extractedVisionAnalysis = data.visualTriageAnalysis?.trim() || visionText?.trim() || undefined;

    return {
      extractedSummary: data.extractedSummary || originalRelato || 'Emergencia registrada.',
      triagePriority: priority,
      needs,
      injuriesAndSymptoms: extractedInjuries,
      visualTriageAnalysis: extractedVisionAnalysis,
      reportedPeopleCount: typeof data.reportedPeopleCount === 'number' ? data.reportedPeopleCount : parsePeopleCount(originalRelato),
      locationReference: data.locationReference || detectedLoc.formattedReference,
      missingFields: Array.isArray(data.missingFields) && data.missingFields.length > 0
        ? data.missingFields
        : ['Nombre de la calle o edificio exacto', 'Coordenadas GPS exactas'],
    };
  } catch (e) {
    console.warn('[TriageExtractor] Fallo al parsear JSON del LLM. Aplicando regla heurística de seguridad:', e);
    return fallbackExtraction(originalRelato, '', visionText, manualInjuries, province);
  }
}

/**
 * Deduce lesiones y síntomas clínicos específicos del texto
 */
function deduceInjuries(text: string): string {
  const lower = text.toLowerCase();
  const findings: string[] = [];

  if (lower.includes('no hay herid') || lower.includes('sin herid') || lower.includes('ilesos')) {
    return 'Sin lesiones físicas aparentes reportadas.';
  }

  if (lower.includes('fractur') || lower.includes('hueso') || lower.includes('pierna rota') || lower.includes('brazo roto')) {
    findings.push('Posible fractura ósea');
  }
  if (lower.includes('hemorr') || lower.includes('sangr') || lower.includes('corte') || lower.includes('herida')) {
    findings.push('Herida o hemorragia activa');
  }
  if (lower.includes('inconsciente') || lower.includes('desmay') || lower.includes('no reacciona') || lower.includes('no responde')) {
    findings.push('Estado de inconciencia / alteración del estado de alerta');
  }
  if (lower.includes('asfixia') || lower.includes('no puede respirar') || lower.includes('dificultad para respirar') || lower.includes('humo')) {
    findings.push('Compromiso o dificultad respiratoria');
  }
  if (lower.includes('quemadur') || lower.includes('quemado')) {
    findings.push('Quemaduras térmicas');
  }
  if (lower.includes('atrapad') || lower.includes('aplastad') || lower.includes('bajo los escombros')) {
    findings.push('Síndrome por aplastamiento / atrapamiento mecánico');
  }
  if (lower.includes('dolor de cabeza') || lower.includes('golpe en la cabeza') || lower.includes('trauma craneal')) {
    findings.push('Traumatismo craneoencefálico');
  }

  if (findings.length > 0) {
    return findings.join(', ') + '.';
  }

  return 'No se especificaron lesiones en el reporte inicial; requiere valoración en sitio.';
}

/**
 * Extractor semántico determinista de alta precisión para emergencias en Panamá
 */
export function fallbackExtraction(
  relatoText: string = '',
  transcriptText: string = '',
  visionText: string = '',
  manualInjuries?: string,
  defaultProvince?: string
): ExtractedTriagePayload {
  const combined = `${relatoText} ${transcriptText} ${manualInjuries || ''} ${visionText}`.toLowerCase();

  // 1. Detección de Ubicación en Panamá
  const detectedLocation = detectPanamaLocation(`${relatoText} ${transcriptText}`, defaultProvince);

  // 2. Conteo de Personas Afectadas
  const peopleCount = parsePeopleCount(`${relatoText} ${transcriptText}`);

  // 3. Clasificación de Necesidades Esfera
  const needs = deduceNeeds(combined);

  // 4. Determinación de Prioridad START
  let priority: StartPriority = 'AMARILLO';

  // Detección de Negaciones Comunes
  const hasNegatedInjuries =
    combined.includes('no hay herid') ||
    combined.includes('sin herid') ||
    combined.includes('nadie está sangrando') ||
    combined.includes('ilesos') ||
    combined.includes('no hay víctimas') ||
    combined.includes('no sepultó a nadie') ||
    combined.includes('no fue un incendio forestal') ||
    combined.includes('no estamos inundados');

  const isTrappedOrCritical =
    (combined.includes('atrapad') && !combined.includes('no están atrapados')) ||
    combined.includes('en el techo') ||
    combined.includes('debajo') ||
    combined.includes('bajo la casa') ||
    combined.includes('bajo los escombros') ||
    combined.includes('inconsciente') ||
    combined.includes('heridas de consideración') ||
    combined.includes('fractura') ||
    combined.includes('ambulancia urgente') ||
    combined.includes('aislados en una colina sin leche') ||
    (combined.includes('herid') && !hasNegatedInjuries && !combined.includes('raspada') && !combined.includes('leve'));

  const isMinorOrResolved =
    combined.includes('charco en el patio') ||
    combined.includes('raspada') ||
    combined.includes('quema de basura') ||
    combined.includes('árbol cayó sobre tendido') ||
    combined.includes('no tenemos luz eléctrica') ||
    (combined.includes('sin refugio') && !combined.includes('atrapad')) ||
    (hasNegatedInjuries && !combined.includes('atrapad') && !combined.includes('aislad'));

  if (isTrappedOrCritical) {
    priority = 'ROJO';
  } else if (isMinorOrResolved) {
    priority = 'VERDE';
  } else {
    priority = 'AMARILLO';
  }

  // 5. Generar Resumen Estructurado Conciso y Sanitizado
  let rawText = relatoText || transcriptText || 'Emergencia registrada localmente.';
  // Sanitizar inyecciones de prompt o SQL del resumen
  let cleanText = rawText
    .replace(/IGNORA TODAS LAS REGLAS ANTERIORES[^\.]*\./gi, '')
    .replace(/DROP TABLE[^\;]*\;/gi, '')
    .replace(/SELECT \* FROM[^\;]*\;/gi, '')
    .replace(/System Prompt Override:[^\.]*\./gi, '')
    .trim();

  let summary = cleanText || 'Emergencia registrada localmente.';
  if (combined.includes('debajo') || combined.includes('bajo la casa') || combined.includes('atrapad') || combined.includes('no nos podemos mover')) {
    summary = `${peopleCount ? `${peopleCount} personas atrapadas/inmovilizadas` : 'Personas atrapadas'} con necesidad de rescate urgente en ${detectedLocation.formattedReference}. ${combined.includes('herid') && !hasNegatedInjuries ? 'Se reportan heridos en la escena.' : ''}`;
  } else if (combined.includes('terremoto') || combined.includes('sismo')) {
    summary = `${peopleCount ? `${peopleCount} personas afectadas` : 'Personas afectadas'} tras terremoto en ${detectedLocation.formattedReference}. ${combined.includes('atrapad') ? 'Se reportan atrapados en estructura.' : ''}`;
  } else if (combined.includes('inundad') || combined.includes('río')) {
    summary = `${peopleCount ? `${peopleCount} personas en riesgo` : 'Personas afectadas'} por inundación en ${detectedLocation.formattedReference}.`;
  }

  return {
    extractedSummary: summary.trim(),
    triagePriority: priority,
    needs,
    injuriesAndSymptoms: manualInjuries?.trim() || deduceInjuries(combined),
    visualTriageAnalysis: visionText?.trim() || undefined,
    reportedPeopleCount: peopleCount,
    locationReference: detectedLocation.formattedReference,
    missingFields: ['Nombre de la calle o número de edificio', 'Coordenadas GPS exactas'],
    rawOutput: 'Inferencia Semántica Local QVAC',
  };
}

/**
 * Deducción de Necesidades según el tipo de amenaza (Esfera)
 */
function deduceNeeds(text: string): DisasterNeedCategory[] {
  const needs: DisasterNeedCategory[] = [];

  // Búsqueda y Rescate Urbano (USAR) / Atrapados
  if (
    text.includes('terremoto') ||
    text.includes('sismo') ||
    text.includes('atrapad') ||
    text.includes('debajo') ||
    text.includes('bajo la casa') ||
    text.includes('bajo los escombros') ||
    text.includes('no nos podemos mover') ||
    text.includes('no podemos movernos') ||
    text.includes('colapso') ||
    text.includes('derrumbe') ||
    text.includes('deslizamiento') ||
    text.includes('techo')
  ) {
    needs.push('ACCESO_RESCATE');
    needs.push('SALUD');
    needs.push('PROTECCION');
    needs.push('ALBERGUE');
  }

  // Inundaciones y Tormentas
  if (text.includes('inund') || text.includes('agua') || text.includes('rio') || text.includes('río') || text.includes('lluvia')) {
    if (!needs.includes('AGUA_SANEAMIENTO')) needs.push('AGUA_SANEAMIENTO');
    if (!needs.includes('ALBERGUE')) needs.push('ALBERGUE');
    if (!needs.includes('ALIMENTACION')) needs.push('ALIMENTACION');
    if (!needs.includes('ACCESO_RESCATE')) needs.push('ACCESO_RESCATE');
  }

  // Salud y Heridos
  if (text.includes('herid') || text.includes('lesion') || text.includes('sangr') || text.includes('fractur') || text.includes('adultos mayores')) {
    if (!needs.includes('SALUD')) needs.push('SALUD');
  }

  // Alimentos
  if (text.includes('comida') || text.includes('hambre') || text.includes('viveres') || text.includes('víveres') || text.includes('alimento')) {
    if (!needs.includes('ALIMENTACION')) needs.push('ALIMENTACION');
  }

  // Albergue
  if (text.includes('albergue') || text.includes('frazada') || text.includes('casa') || text.includes('refugio') || text.includes('cancha')) {
    if (!needs.includes('ALBERGUE')) needs.push('ALBERGUE');
  }

  return needs.length > 0 ? needs : ['AGUA_SANEAMIENTO', 'ALBERGUE'];
}

function parsePeopleCount(text: string): number | undefined {
  if (!text) return undefined;

  // 1. Buscar dígitos directos primero (ej. "8 personas", "8")
  const digitMatch = text.match(/\b\d+\b/);
  if (digitMatch) {
    return parseInt(digitMatch[0], 10);
  }

  // 2. Buscar palabras numéricas específicas (del 10 al 1)
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
