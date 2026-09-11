/**
 * Envoltorio TypeScript para el Módulo Nativo Android Google Nearby Connections API — Perseus.ai
 * Permite transmisión P2P real de alta velocidad (BLE + Wi-Fi Direct automático)
 * con soporte para payloads mixtos: BYTES (JSON) y FILE (audio/imágenes) sin internet ni router.
 */

let NativeModules: any = null;
let NativeEventEmitter: any = null;
let Platform: any = { OS: 'other' };
let PermissionsAndroid: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native');
  NativeModules = RN?.NativeModules || null;
  NativeEventEmitter = RN?.NativeEventEmitter || null;
  Platform = RN?.Platform || { OS: 'other' };
  PermissionsAndroid = RN?.PermissionsAndroid || null;
} catch {
  // Entorno Node.js (Vitest)
}

const NearbyP2P = NativeModules?.NearbyP2P || null;
const eventEmitter = (NearbyP2P && NativeEventEmitter) ? new NativeEventEmitter(NearbyP2P) : null;

export interface NearbyEndpoint {
  endpointId: string;
  endpointName: string;
  serviceId?: string;
}

export interface ConnectionInitiatedEvent {
  endpointId: string;
  endpointName: string;
  authenticationDigits: string;
  isIncoming: boolean;
}

export interface FileTransferMeta {
  isNearbyFileMeta?: boolean;
  filePayloadId?: number | string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  reportId?: string;
  type?: 'audio' | 'image' | 'report_json' | string;
  [key: string]: any;
}

export interface FileReceivedEvent {
  endpointId: string;
  payloadId: string;
  fileUri: string;
  fileName: string;
  fileSize: number;
  metadata: string;
}

export interface TransferProgressEvent {
  endpointId: string;
  payloadId: string;
  bytesTransferred: number;
  totalBytes: number;
  progress: number;
  status: number;
}

export interface NearbySendResult {
  success: boolean;
  payloadId?: string;
  bytes?: number;
  fileName?: string;
  fileSize?: number;
  error?: string;
}

/**
 * Indica si el módulo nativo de Nearby Connections está presente y soportado
 */
export function isNearbySupported(): boolean {
  return Platform.OS === 'android' && Boolean(NearbyP2P);
}

/**
 * Solicita los permisos requeridos para Google Nearby Connections en Android 12+ y anteriores
 */
export async function requestNearbyPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (!PermissionsAndroid) return true;

  try {
    const apiLevel = typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(String(Platform.Version), 10) || 30;

    if (apiLevel >= 33) {
      // Android 13+ (Tiramisu / API 33+)
      const perms = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ].filter(Boolean);

      const results = await PermissionsAndroid.requestMultiple(perms);
      const scanGranted = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
      const connectGranted = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
      const advGranted = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE] === PermissionsAndroid.RESULTS.GRANTED;

      return Boolean(connectGranted && (scanGranted || advGranted));
    } else if (apiLevel >= 31) {
      // Android 12 (API 31/32)
      const perms = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ].filter(Boolean);

      const results = await PermissionsAndroid.requestMultiple(perms);
      const scan = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
      const connect = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
      return Boolean(scan && connect);
    } else {
      // Android 11 y anteriores
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ].filter(Boolean));
      return (
        results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED ||
        results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
      );
    }
  } catch (err) {
    console.warn('[NearbyNative] Error solicitando permisos:', err);
    return false;
  }
}

/**
 * Configura auto-aceptar conexiones entrantes sin prompt manual
 */
export async function setAutoAccept(enabled: boolean): Promise<boolean> {
  if (!isNearbySupported()) return false;
  try {
    await NearbyP2P.setAutoAccept(enabled);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inicia la emisión/anuncio de presencia como endpoint en el cluster Nearby
 */
export async function startAdvertising(displayName: string): Promise<boolean> {
  if (!isNearbySupported()) return false;
  try {
    return await NearbyP2P.startAdvertising(displayName);
  } catch (err: any) {
    console.error('[NearbyNative] Error en startAdvertising:', err);
    throw err;
  }
}

/**
 * Detiene el anuncio de presencia
 */
export async function stopAdvertising(): Promise<boolean> {
  if (!isNearbySupported()) return true;
  try {
    return await NearbyP2P.stopAdvertising();
  } catch (err) {
    console.warn('[NearbyNative] Error en stopAdvertising:', err);
    return false;
  }
}

/**
 * Inicia el descubrimiento continuo de pares en el cluster Nearby
 */
export async function startDiscovery(): Promise<boolean> {
  if (!isNearbySupported()) return false;
  try {
    return await NearbyP2P.startDiscovery();
  } catch (err: any) {
    console.error('[NearbyNative] Error en startDiscovery:', err);
    throw err;
  }
}

/**
 * Detiene el descubrimiento de pares
 */
export async function stopDiscovery(): Promise<boolean> {
  if (!isNearbySupported()) return true;
  try {
    return await NearbyP2P.stopDiscovery();
  } catch (err) {
    console.warn('[NearbyNative] Error en stopDiscovery:', err);
    return false;
  }
}

/**
 * Solicita conexión a un endpoint descubierto
 */
export async function requestConnection(endpointId: string, displayName: string): Promise<boolean> {
  if (!isNearbySupported()) return false;
  try {
    return await NearbyP2P.requestConnection(endpointId, displayName);
  } catch (err: any) {
    console.error(`[NearbyNative] Error conectando a ${endpointId}:`, err);
    throw err;
  }
}

/**
 * Acepta manualmente una conexión iniciada
 */
export async function acceptConnection(endpointId: string): Promise<boolean> {
  if (!isNearbySupported()) return false;
  try {
    return await NearbyP2P.acceptConnection(endpointId);
  } catch (err) {
    console.warn(`[NearbyNative] Error aceptando conexión ${endpointId}:`, err);
    return false;
  }
}

/**
 * Rechaza una conexión entrante
 */
export async function rejectConnection(endpointId: string): Promise<boolean> {
  if (!isNearbySupported()) return false;
  try {
    return await NearbyP2P.rejectConnection(endpointId);
  } catch (err) {
    console.warn(`[NearbyNative] Error rechazando conexión ${endpointId}:`, err);
    return false;
  }
}

/**
 * Desconecta un endpoint específico
 */
export async function disconnect(endpointId: string): Promise<boolean> {
  if (!isNearbySupported()) return true;
  try {
    return await NearbyP2P.disconnect(endpointId);
  } catch (err) {
    console.warn(`[NearbyNative] Error desconectando ${endpointId}:`, err);
    return false;
  }
}

/**
 * Detiene todo: desconecta todos los endpoints y apaga discovery + advertising
 */
export async function disconnectAll(): Promise<boolean> {
  if (!isNearbySupported()) return true;
  try {
    return await NearbyP2P.disconnectAll();
  } catch (err) {
    console.warn('[NearbyNative] Error en disconnectAll:', err);
    return false;
  }
}

/**
 * Envía un payload de tipo BYTES (JSON estructurado, handshake o control, ≤32KB)
 */
export async function sendBytes(endpointId: string, data: string): Promise<NearbySendResult> {
  if (!isNearbySupported()) {
    return { success: false, error: 'Nearby Connections no soportado en esta plataforma.' };
  }
  try {
    const res = await NearbyP2P.sendBytes(endpointId, data);
    return {
      success: Boolean(res?.success),
      payloadId: res?.payloadId,
      bytes: res?.bytes,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error al enviar bytes vía Nearby',
    };
  }
}

/**
 * Envía un payload de tipo FILE (audio, imagen o documento binario de gran tamaño)
 * Envía automáticamente la metadata JSON correspondiente en BYTES antes del stream de archivo.
 */
export async function sendFile(
  endpointId: string,
  filePath: string,
  metadata: FileTransferMeta | string
): Promise<NearbySendResult> {
  if (!isNearbySupported()) {
    return { success: false, error: 'Nearby Connections no soportado en esta plataforma.' };
  }
  try {
    const metaStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
    const res = await NearbyP2P.sendFile(endpointId, filePath, metaStr);
    return {
      success: Boolean(res?.success),
      payloadId: res?.payloadId,
      fileName: res?.fileName,
      fileSize: res?.fileSize,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error al enviar archivo vía Nearby',
    };
  }
}

/**
 * Retorna la lista de endpoints actualmente conectados
 */
export async function getConnectedEndpoints(): Promise<NearbyEndpoint[]> {
  if (!isNearbySupported()) return [];
  try {
    return await NearbyP2P.getConnectedEndpoints();
  } catch (err) {
    console.warn('[NearbyNative] Error al obtener endpoints conectados:', err);
    return [];
  }
}

/**
 * Retorna el estado actual de Nearby (advertising, discovery y número de conexiones)
 */
export async function getNearbyStatus(): Promise<{
  isAdvertising: boolean;
  isDiscovering: boolean;
  connectedCount: number;
}> {
  if (!isNearbySupported()) {
    return { isAdvertising: false, isDiscovering: false, connectedCount: 0 };
  }
  try {
    return await NearbyP2P.getStatus();
  } catch {
    return { isAdvertising: false, isDiscovering: false, connectedCount: 0 };
  }
}

// =========================================================================
// SUSCRIPCIONES A EVENTOS NATIVOS
// =========================================================================

export function onEndpointFound(
  callback: (event: NearbyEndpoint) => void
): { remove: () => void } {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('onEndpointFound', callback);
  return { remove: () => sub.remove() };
}

export function onEndpointLost(
  callback: (event: { endpointId: string }) => void
): { remove: () => void } {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('onEndpointLost', callback);
  return { remove: () => sub.remove() };
}

export function onConnectionInitiated(
  callback: (event: ConnectionInitiatedEvent) => void
): { remove: () => void } {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('onConnectionInitiated', callback);
  return { remove: () => sub.remove() };
}

export function onConnected(
  callback: (event: NearbyEndpoint) => void
): { remove: () => void } {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('onConnected', callback);
  return { remove: () => sub.remove() };
}

export function onConnectionFailed(
  callback: (event: { endpointId: string; statusCode: number; statusMessage?: string }) => void
): { remove: () => void } {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('onConnectionFailed', callback);
  return { remove: () => sub.remove() };
}

export function onDisconnected(
  callback: (event: { endpointId: string }) => void
): { remove: () => void } {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('onDisconnected', callback);
  return { remove: () => sub.remove() };
}

export function onBytesReceived(
  callback: (event: { endpointId: string; payloadId: string; data: string }) => void
): { remove: () => void } {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('onBytesReceived', callback);
  return { remove: () => sub.remove() };
}

export function onFileReceived(
  callback: (event: FileReceivedEvent) => void
): { remove: () => void } {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('onFileReceived', callback);
  return { remove: () => sub.remove() };
}

export function onTransferProgress(
  callback: (event: TransferProgressEvent) => void
): { remove: () => void } {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('onTransferProgress', callback);
  return { remove: () => sub.remove() };
}

export function onTransferComplete(
  callback: (event: { endpointId: string; payloadId: string }) => void
): { remove: () => void } {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('onTransferComplete', callback);
  return { remove: () => sub.remove() };
}

export function onTransferFailed(
  callback: (event: { endpointId: string; payloadId: string; status: number }) => void
): { remove: () => void } {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('onTransferFailed', callback);
  return { remove: () => sub.remove() };
}
