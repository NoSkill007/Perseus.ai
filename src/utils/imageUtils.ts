let ImageManipulator: any = null;
try {
  ImageManipulator = require('expo-image-manipulator');
} catch {}

/**
 * Redimensiona y comprime la imagen a un ancho maximo de 768px (proporcional)
 * antes de enviarla a la inferencia de vision para prevenir desbordamientos de memoria en el proyector multimodal (mmproj).
 */
export async function prepareImageForVision(imageUri: string): Promise<string> {
  if (!imageUri || typeof imageUri !== 'string') return imageUri;
  if (!ImageManipulator?.manipulateAsync) {
    return imageUri;
  }
  try {
    const SaveFormat = ImageManipulator.SaveFormat || { JPEG: 'jpeg' };
    const resized = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 768 } }],
      { compress: 0.7, format: SaveFormat.JPEG || 'jpeg' }
    );
    return resized.uri || imageUri;
  } catch (err) {
    console.warn('[imageUtils] Fallo al redimensionar imagen:', err);
    return imageUri;
  }
}
