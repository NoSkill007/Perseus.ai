export class QvacClient {
  private offlineMode: boolean;
  private verbose: boolean;

  constructor(options: { offlineMode?: boolean; verbose?: boolean } = {}) {
    this.offlineMode = options.offlineMode ?? true;
    this.verbose = options.verbose ?? false;
  }

  async loadModel(options: any) {
    return true;
  }

  async loadMultimodalModel(options: any) {
    return true;
  }

  async unloadCurrentModel() {
    return true;
  }

  async generateText(options: { prompt: string; temperature?: number; maxTokens?: number }) {
    const prompt = options.prompt || '';
    
    // Simulación inteligente para pruebas
    const isCritical = prompt.toLowerCase().includes('atrapad') || prompt.toLowerCase().includes('inundad') || prompt.toLowerCase().includes('grave');
    const priority = isCritical ? 'ROJO' : 'AMARILLO';
    
    return {
      text: JSON.stringify({
        extractedSummary: 'Reporte procesado por modelo local.',
        triagePriority: priority,
        needs: ['AGUA_SANEAMIENTO', 'ALBERGUE'],
        reportedPeopleCount: prompt.includes('cuatro') ? 4 : prompt.includes('cinco') ? 5 : 2,
        locationReference: 'Referencia detectada en Chiriquí',
        missingFields: ['Nombre de la calle', 'Coordenadas GPS exactas'],
      }),
    };
  }

  async transcribe(options: { audioPath: string; language?: string }) {
    return { text: 'Reporte dictado por la brigada en zona de desastre en Panamá.' };
  }

  async generateVisionText(options: { imagePath: string; prompt?: string }) {
    return { text: 'Daño estructural moderado y acumulación de agua observados en la imagen.' };
  }
}

export const assessModelFit = async () => ({
  verdict: 'likely-fits',
});
