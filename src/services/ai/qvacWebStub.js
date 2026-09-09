/**
 * Web Stub para @qvac/sdk
 * Permite que Expo Web empaquete la aplicación sin errores de importación dinámica de Node.
 */
export class QvacClient {
  constructor(options = {}) {
    this.options = options;
  }
  async loadModel() {
    return true;
  }
  async unloadCurrentModel() {
    return true;
  }
  async loadMultimodalModel() {
    return true;
  }
  async chat() {
    return { text: '' };
  }
}

export default {
  QvacClient,
};
