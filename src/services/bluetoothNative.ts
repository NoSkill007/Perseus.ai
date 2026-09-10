/**
 * Envoltorio TypeScript para el Módulo Nativo Android Bluetooth RFCOMM / SPP — Perseus.ai
 * Permite transmisión P2P real (antena a antena) sin internet ni servidores intermedios.
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
 * Solicita los permisos necesarios de Bluetooth en Android en tiempo de ejecución (igual que cámara o micrófono)
 */
export async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (!PermissionsAndroid) return true;

  try {
    const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10) || 30;

    if (apiLevel >= 31) {
      const perms = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ].filter(Boolean);

      const results = await PermissionsAndroid.requestMultiple(perms);

      const scanGranted = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
      const connectGranted = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
      const advGranted = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE] === PermissionsAndroid.RESULTS.GRANTED;

      console.log('[BluetoothNative] Permisos Bluetooth concedidos:', { scanGranted, connectGranted, advGranted });
      return Boolean(connectGranted && (scanGranted || advGranted));
    } else {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Permiso de radio Bluetooth para emergencias',
          message: 'Android requiere acceso a dispositivos cercanos para emitir y rastrear balizas de emergencia SOS sin internet.',
          buttonPositive: 'Permitir',
          buttonNegative: 'Cancelar',
        }
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
  } catch (err) {
    console.warn('[BluetoothNative] Error al solicitar permisos de Bluetooth:', err);
    return false;
  }
}

/**
 * Verifica si los permisos de Bluetooth ya están otorgados
 */
export async function checkBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (!PermissionsAndroid) return true;

  try {
    const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10) || 30;
    if (apiLevel >= 31) {
      const scan = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
      const connect = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      return Boolean(scan && connect);
    } else {
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
  } catch {
    return false;
  }
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
 * Suscribe un callback para escuchar paquetes entrantes por Bluetooth RFCOMM
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

export interface BleBeaconDetection {
  deviceAddress: string;
  deviceName: string;
  priority: 'ROJO' | 'AMARILLO' | 'VERDE' | 'NEGRO';
  peopleCount: number;
  reportIdShort: string;
  rssi: number;
  distanceMeters: number;
  timestamp: number;
}

/**
 * Inicia la emisión de la baliza BLE estilo AirTag al éter (Broadcast sin emparejamiento)
 */
export async function startBleBeacon(
  priority: 'ROJO' | 'AMARILLO' | 'VERDE' | 'NEGRO' | string,
  peopleCount: number = 1,
  reportIdShort: string = 'SOS'
): Promise<boolean> {
  if (!isBluetoothNativeSupported()) return false;
  try {
    const code = priority === 'ROJO' ? 2 : priority === 'AMARILLO' ? 1 : priority === 'NEGRO' ? 3 : 0;
    const cleanId = (reportIdShort || 'SOS').slice(0, 8);
    const res = await BluetoothP2P.startBleBeacon(code, peopleCount, cleanId);
    console.log('[BluetoothNative] Baliza BLE AirTag iniciada:', res);
    return Boolean(res?.success);
  } catch (err) {
    console.warn('[BluetoothNative] Error al iniciar baliza BLE AirTag:', err);
    return false;
  }
}

/**
 * Detiene la emisión de la baliza BLE estilo AirTag
 */
export async function stopBleBeacon(): Promise<boolean> {
  if (!isBluetoothNativeSupported()) return true;
  try {
    return await BluetoothP2P.stopBleBeacon();
  } catch (err) {
    console.warn('[BluetoothNative] Error al detener baliza BLE:', err);
    return false;
  }
}

/**
 * Inicia el Radar de Proximidad BLE para rescatistas (Escaneo pasivo de balizas en el aire)
 */
export async function startBleRadar(): Promise<boolean> {
  if (!isBluetoothNativeSupported()) return false;
  try {
    const res = await BluetoothP2P.startBleRadar();
    console.log('[BluetoothNative] Radar de Proximidad BLE activo');
    return Boolean(res);
  } catch (err) {
    console.warn('[BluetoothNative] Error al iniciar Radar BLE:', err);
    return false;
  }
}

/**
 * Detiene el Radar de Proximidad BLE
 */
export async function stopBleRadar(): Promise<boolean> {
  if (!isBluetoothNativeSupported()) return true;
  try {
    return await BluetoothP2P.stopBleRadar();
  } catch (err) {
    console.warn('[BluetoothNative] Error al detener Radar BLE:', err);
    return false;
  }
}

/**
 * Suscribe un callback para recibir detecciones de balizas BLE AirTag cercanas en tiempo real
 */
export function subscribeToBleBeaconDetections(
  callback: (beacon: BleBeaconDetection) => void
): { remove: () => void } {
  if (!eventEmitter) {
    return { remove: () => {} };
  }

  const subscription = eventEmitter.addListener('onBleBeaconDetected', (data: any) => {
    callback({
      deviceAddress: data.deviceAddress,
      deviceName: data.deviceName,
      priority: data.priority,
      peopleCount: data.peopleCount,
      reportIdShort: data.reportIdShort,
      rssi: data.rssi,
      distanceMeters: data.distanceMeters,
      timestamp: data.timestamp,
    });
  });

  return {
    remove: () => subscription.remove(),
  };
}

/**
 * Inicia el servidor HTTP nativo para modo Wi-Fi Hotspot / Red Local en Android (puerto 7890 por defecto)
 */
export async function startHttpServer(port: number = 7890): Promise<boolean> {
  if (!isBluetoothNativeSupported()) return false;
  try {
    const res = await BluetoothP2P.startHttpServer(port);
    console.log('[BluetoothNative] Servidor HTTP nativo iniciado en puerto', port);
    return Boolean(res);
  } catch (err) {
    console.warn('[BluetoothNative] Error al iniciar servidor HTTP:', err);
    return false;
  }
}

/**
 * Detiene el servidor HTTP nativo
 */
export async function stopHttpServer(): Promise<boolean> {
  if (!isBluetoothNativeSupported()) return true;
  try {
    return await BluetoothP2P.stopHttpServer();
  } catch (err) {
    console.warn('[BluetoothNative] Error al detener servidor HTTP:', err);
    return false;
  }
}

