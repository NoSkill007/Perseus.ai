export async function loadModel(options: any) {
  return 'loaded-model-id';
}

export async function unloadModel(options: any) {
  return true;
}

export function completion(params: {
  modelId: string;
  history: Array<{ role: string; content: string }>;
  responseFormat?: any;
  stream?: boolean;
}) {
  const userContent = params.history.find(h => h.role === 'user')?.content || '';
  const lower = userContent.toLowerCase();

  const isCritical =
    lower.includes('atrapad') ||
    lower.includes('debajo') ||
    lower.includes('bajo la casa') ||
    lower.includes('no nos podemos mover') ||
    lower.includes('herid') ||
    lower.includes('terremoto') ||
    lower.includes('sismo') ||
    lower.includes('techo') ||
    lower.includes('grave') ||
    lower.includes('inundad');

  const priority = isCritical ? 'ROJO' : 'AMARILLO';

  const needs: string[] = [];
  if (
    lower.includes('terremoto') ||
    lower.includes('atrapad') ||
    lower.includes('debajo') ||
    lower.includes('no nos podemos mover') ||
    lower.includes('herid')
  ) {
    needs.push('ACCESO_RESCATE', 'SALUD', 'PROTECCION', 'ALBERGUE');
  } else if (lower.includes('inund')) {
    needs.push('AGUA_SANEAMIENTO', 'ALIMENTACION', 'ALBERGUE', 'ACCESO_RESCATE');
  } else {
    needs.push('AGUA_SANEAMIENTO', 'ALBERGUE');
  }

  const peopleCount = lower.includes('8') || lower.includes('ocho') ? 8
    : lower.includes('5') || lower.includes('cinco') ? 5
    : lower.includes('4') || lower.includes('cuatro') ? 4
    : 2;

  const loc = lower.includes('calidonia') ? 'Calidonia, Distrito de Panamá, Panamá'
    : lower.includes('chiriquí') ? 'Chiriquí'
    : 'Bocas del Toro';

  const jsonResponse = JSON.stringify({
    extractedSummary: `Emergencia evaluada por Llama 3.2 1B en ${loc}.`,
    triagePriority: priority,
    needs,
    reportedPeopleCount: peopleCount,
    locationReference: loc,
    missingFields: ['Nombre de la calle o edificio', 'Coordenadas GPS exactas'],
  });

  return {
    final: Promise.resolve({
      content: jsonResponse,
      raw: { fullText: jsonResponse },
    }),
  };
}

export async function transcribe(params: { modelId: string; audioChunk: string; prompt?: string }) {
  return 'Hay 5 personas atrapadas debajo de la casa, estamos heridos y no nos podemos mover.';
}

export default {
  loadModel,
  unloadModel,
  completion,
  transcribe,
};
