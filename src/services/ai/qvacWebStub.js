/**
 * Web Stub para @qvac/sdk
 * Permite que Expo Web empaquete la aplicación sin errores de importación dinámica de Node.
 */
export async function loadModel(options) {
  return 'loaded-model-id';
}

export async function unloadModel(options) {
  return true;
}

export function completion(params) {
  return {
    final: Promise.resolve({
      content: '',
      raw: { fullText: '' },
    }),
  };
}

export async function transcribe(options) {
  return { text: '' };
}

export default {
  loadModel,
  unloadModel,
  completion,
  transcribe,
};
