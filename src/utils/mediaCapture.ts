import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

export interface AudioRecordingState {
  isRecording: boolean;
  recordingObject: Audio.Recording | null;
  uri?: string;
  durationMillis?: number;
}

/**
 * Solicita permisos e inicia la grabación de audio local con feedback continuo
 */
export async function startAudioRecording(
  onStatusUpdate?: (status: Audio.RecordingStatus) => void
): Promise<Audio.Recording | null> {
  try {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso requerido', 'Se requiere permiso de micrófono para grabar audio.');
      return null;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
      onStatusUpdate,
      250 // Actualización cada 250ms para fluidez de cronómetro
    );

    return recording;
  } catch (err) {
    console.error('[MediaCapture] Error al iniciar grabación de audio:', err);
    Alert.alert('Error', 'No se pudo iniciar la grabación de audio en el dispositivo.');
    return null;
  }
}

/**
 * Detiene la grabación de audio activa y retorna la URI del archivo generado
 */
export async function stopAudioRecording(recording: Audio.Recording): Promise<string | null> {
  try {
    const status = await recording.getStatusAsync();
    if (status.canRecord) {
      await recording.stopAndUnloadAsync();
    }
    const uri = recording.getURI();

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    return uri;
  } catch (err) {
    console.error('[MediaCapture] Error al detener grabación de audio:', err);
    return null;
  }
}

/**
 * Permite seleccionar un archivo de audio del dispositivo o explorador de archivos
 */
export async function pickAudioFile(): Promise<string | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['audio/*'],
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      return result.assets[0].uri;
    }
    return null;
  } catch (err) {
    console.error('[MediaCapture] Error al seleccionar archivo de audio:', err);
    return null;
  }
}

/**
 * Abre la cámara del dispositivo en vivo para tomar una foto de la emergencia
 */
export async function takeCameraPhoto(): Promise<string | null> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Se requiere permiso de cámara para capturar fotos de la emergencia.');
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      return result.assets[0].uri;
    }
    return null;
  } catch (err) {
    console.error('[MediaCapture] Error al capturar foto con la cámara:', err);
    return null;
  }
}

/**
 * Abre la galería para seleccionar una foto existente de la escena
 */
export async function pickGalleryImage(): Promise<string | null> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Se requiere permiso de galería para seleccionar imágenes.');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      return result.assets[0].uri;
    }
    return null;
  } catch (err) {
    console.error('[MediaCapture] Error al seleccionar imagen de galería:', err);
    return null;
  }
}
