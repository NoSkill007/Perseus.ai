/**
 * Envoltorio TypeScript para el Módulo Nativo Android Bluetooth RFCOMM / SPP — Perseus.ai
 * Permite transmisión P2P real (antena a antena) sin internet ni servidores intermedios.
 */

let NativeModules: any = null;
let NativeEventEmitter: any = null;
let Platform: any = { OS: 'other' };

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native');
  NativeModules = RN?.NativeModules || null;
  NativeEventEmitter = RN?.NativeEventEmitter || null;
  Platform = RN?.Platform || { OS: 'other' };
} catch {
  // Entorno Node.js (Vitest)
}

const BluetoothP2P = NativeModules?.BluetoothP2P || null;

export interface PairedDevice {
  name: string;
  address: string;
}

export interface BluetoothSendResult {
  success: boolean;
  responseJson?: string;
  bytes: number;
  peerAddress?: string;
  peerName?: string;
  error?: string;
}

export interface BluetoothPacketEvent {
  packetJson: string;
  senderAddress: string;
  senderName: string;
}

const eventEmitter = (BluetoothP2P && NativeEventEmitter) ? new NativeEventEmitter(BluetoothP2P) : null;

/**
 * Indica si el módulo nativo de Bluetooth RFCOMM está presente en el entorno de ejecución
 */
export function isBluetoothNativeSupported(): boolean {
  return Platform.OS === 'android' && Boolean(BluetoothP2P);
}

/**
 * Comprueba si el hardware soporta Bluetooth
 */
export async function checkBluetoothAvailable(): Promise<boolean> {
  if (!isBluetoothNativeSupported()) return false;
  try {
    return await BluetoothP2P.isBluetoothAvailable();
  } catch {
    return false;
  }
}

/**
 * Comprueba si el Bluetooth del dispositivo está encendido
 */
export async function checkBluetoothEnabled(): Promise<boolean> {
  if (!isBluetoothNativeSupported()) return false;
  try {
    return await BluetoothP2P.isBluetoothEnabled();
  } catch {
    return false;
  }
}

/**
 * Obtiene la lista de dispositivos Bluetooth emparejados en Android
 */
export async function getPairedBluetoothDevices(): Promise<PairedDevice[]> {
  if (!isBluetoothNativeSupported()) return [];
  try {
    const devices: PairedDevice[] = await BluetoothP2P.getPairedDevices();
    return devices || [];
  } catch (err) {
    console.warn('[BluetoothNative] Error al obtener dispositivos emparejados:', err);
    return [];
  }
}

/**
 * Inicia el servidor Bluetooth RFCOMM en el dispositivo (Modo Receptor / Rescatista)
 */
export async function startBluetoothServer(
  serviceName: string = 'PerseusRescue',
  uuid: string = '00001101-0000-1000-8000-00805F9B34FB'
): Promise<boolean> {
  if (!isBluetoothNativeSupported()) {
    console.warn('[BluetoothNative] Módulo nativo no disponible en esta plataforma');
    return false;
  }
  try {
    return await BluetoothP2P.startServer(serviceName, uuid);
  } catch (err) {
    console.error('[BluetoothNative] Error al iniciar servidor Bluetooth:', err);
    throw err;
  }
}

/**
 * Detiene el servidor Bluetooth RFCOMM
 */
export async function stopBluetoothServer(): Promise<boolean> {
  if (!isBluetoothNativeSupported()) return true;
  try {
    return await BluetoothP2P.stopServer();
  } catch (err) {
    console.warn('[BluetoothNative] Error al detener servidor Bluetooth:', err);
    return false;
  }
}

/**
 * Envía un paquete a través de un socket Bluetooth RFCOMM directo al receptor
 */
export async function sendBluetoothPacket(
  targetAddressOrName: string,
  packetJson: string,
  uuid: string = '00001101-0000-1000-8000-00805F9B34FB',
  timeoutMs: number = 8000
): Promise<BluetoothSendResult> {
  if (!isBluetoothNativeSupported()) {
    return {
      success: false,
      bytes: 0,
      error: 'Módulo nativo Bluetooth RFCOMM no disponible.',
    };
  }

  try {
    const result = await BluetoothP2P.sendPacket(targetAddressOrName, uuid, packetJson, timeoutMs);
    return {
      success: Boolean(result?.success),
      responseJson: result?.responseJson,
      bytes: result?.bytes || 0,
      peerAddress: result?.peerAddress,
      peerName: result?.peerName,
    };
  } catch (err: any) {
    return {
      success: false,
      bytes: 0,
      error: err.message || 'Error al conectar por socket Bluetooth',
    };
  }
}

/**
 * Suscribe un callback para escuchar paquetes entrantes por Bluetooth
 */
export function subscribeToIncomingBluetoothPackets(
  callback: (event: BluetoothPacketEvent) => void
): { remove: () => void } {
  if (!eventEmitter) {
    return { remove: () => {} };
  }

  const subscription = eventEmitter.addListener('onBluetoothPacketReceived', callback);
  return {
    remove: () => subscription.remove(),
  };
}
