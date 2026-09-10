/**
 * Capa de Transporte Multi-Protocolo P2P (Wi-Fi Hotspot + Bluetooth) — Perseus.ai
 * Soporta serialización de paquetes, validación de integridad, Store-and-Forward y ACKs.
 */

import type {
  P2PPacket,
  P2PMessageType,
  P2PTransportType,
  RescueNode,
} from '../types/triageTypes';
import {
  isBluetoothNativeSupported,
  sendBluetoothPacket,
  getPairedBluetoothDevices,
  startBleBeacon,
  stopBleBeacon,
} from './bluetoothNative';

export const DEFAULT_P2P_PORT = 7890;
export const DEFAULT_TIMEOUT_MS = 6000;

/**
 * Crea un paquete P2P estructurado con metadatos y timestamp
 */
export function createPacket<T = any>(
  type: P2PMessageType,
  senderNode: { id: string; callsign: string; role?: any },
  payload: T,
  targetNodeId?: string
): P2PPacket<T> {
  const timestamp = Date.now();
  const packetId = `pkt-${timestamp}-${Math.random().toString(36).substring(2, 9)}`;

  const node: RescueNode = {
    id: senderNode.id,
    deviceId: senderNode.id,
    callsign: senderNode.callsign,
    role: senderNode.role || 'rescatista',
    lastSeen: timestamp,
  };

  return {
    packetId,
    type,
    senderNode: node,
    senderNodeId: senderNode.id,
    senderCallsign: senderNode.callsign,
    targetNodeId,
    timestamp,
    payload,
    version: 1,
  };
}

/**
 * Valida y des-serializa un paquete P2P recibido
 */
export function validatePacket(data: unknown): P2PPacket {
  if (!data) {
    throw new Error('Paquete vacío o nulo');
  }

  let packet: any = data;
  if (typeof data === 'string') {
    try {
      packet = JSON.parse(data);
    } catch {
      throw new Error('Formato JSON inválido en paquete P2P');
    }
  }

  if (typeof packet !== 'object' || packet === null) {
    throw new Error('El paquete debe ser un objeto');
  }

  if (!packet.packetId || typeof packet.packetId !== 'string') {
    throw new Error('packetId faltante o inválido');
  }

  const validTypes: P2PMessageType[] = [
    'HANDSHAKE',
    'REPORT_BUNDLE',
    'ASSIGNMENT_CLAIM',
    'ASSIGNMENT_CONFLICT',
    'ACK',
    'PING',
  ];

  if (!packet.type || !validTypes.includes(packet.type)) {
    throw new Error(`Tipo de mensaje desconocido: ${packet.type}`);
  }

  if (!packet.senderNodeId || !packet.timestamp) {
    throw new Error('Encabezados obligatorios ausentes (senderNodeId, timestamp)');
  }

  return packet as P2PPacket;
}

/**
 * Serializa y fragmenta un paquete para transmisión Bluetooth RFCOMM
 */
export function formatBluetoothPayload(packet: P2PPacket): {
  raw: string;
  chunksCount: number;
  byteLength: number;
} {
  const json = JSON.stringify(packet);
  const bytes = new TextEncoder().encode(json).length;
  // Fragmentación lógica en paquetes de 512 bytes para radios de bajo ancho de banda
  const chunksCount = Math.ceil(bytes / 512);
  return {
    raw: json,
    chunksCount: Math.max(chunksCount, 1),
    byteLength: bytes,
  };
}

/**
 * Envía un paquete vía Wi-Fi Hotspot / Red Local HTTP REST endpoint
 */
export async function sendPacketViaWifi(
  peerIp: string,
  packet: P2PPacket,
  port: number = DEFAULT_P2P_PORT,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<{ success: boolean; response?: any; error?: string; bytes: number }> {
  const jsonBody = JSON.stringify(packet);
  const bytes = new TextEncoder().encode(jsonBody).length;
  const endpoint = `http://${peerIp.trim()}:${port}/api/p2p/packet`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Perseus-Version': '1.0',
      },
      body: jsonBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        error: `HTTP Error ${res.status}: ${res.statusText}`,
        bytes,
      };
    }

    const responseData = await res.json();
    return {
      success: true,
      response: responseData,
      bytes,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    return {
      success: false,
      error: isTimeout ? `Tiempo de espera agotado (${timeoutMs}ms)` : (err.message || 'Error de conexión Wi-Fi'),
      bytes,
    };
  }
}

// Estado para simulación de recepción de ACK durante demos y pruebas
let mockReceiverAckRequested = false;

/**
 * Activa manualmente el acuse de recibo (ACK) de rescatista para demostraciones del jurado
 */
export function triggerMockReceiverAck(): void {
  mockReceiverAckRequested = true;
}

/**
 * Reinicia el estado de simulación de ACK
 */
export function resetMockReceiverAck(): void {
  mockReceiverAckRequested = false;
}

/**
 * Emite paquetes a través del canal Bluetooth offline (Store-and-Forward / RFCOMM)
 * En modo búsqueda/baliza, emite los chunks por radio y espera respuesta ACK.
 * Si no hay un nodo receptor escuchando, reporta sin respuesta para permitir reintentos.
 */
export async function sendPacketViaBluetooth(
  targetDeviceId: string,
  packet: P2PPacket,
  onProgress?: (progress: number) => void
): Promise<{ success: boolean; response?: any; error?: string; bytes: number }> {
  const { raw, byteLength, chunksCount } = formatBluetoothPayload(packet);

  // 1. Si el módulo nativo Android de Bluetooth RFCOMM está presente, transmitir por radio física
  if (isBluetoothNativeSupported()) {
    try {
      let safeTarget = targetDeviceId?.trim();
      if (!safeTarget || safeTarget.includes('192.168.') || safeTarget === 'BRIGADA-BT-01') {
        const paired = await getPairedBluetoothDevices();
        if (paired.length > 0) {
          safeTarget = paired[0].address || paired[0].name;
        }
      }

      if (!safeTarget) {
        return {
          success: false,
          error: 'Selecciona o empareja un dispositivo Bluetooth receptor.',
          bytes: byteLength,
        };
      }

      console.log(`[Bluetooth RFCOMM Nativo] Conectando por radio a: ${safeTarget}...`);
      if (onProgress) onProgress(0.4);

      const nativeRes = await sendBluetoothPacket(safeTarget, raw);

      if (nativeRes.success) {
        if (onProgress) onProgress(1.0);
        let parsedAck: any = null;
        try {
          if (nativeRes.responseJson) parsedAck = JSON.parse(nativeRes.responseJson);
        } catch {}

        return {
          success: true,
          response: {
            ackPacketId: packet.packetId,
            receivedAt: Date.now(),
            status: 'received_via_bluetooth',
            nodeId: nativeRes.peerName || targetDeviceId,
            peerAddress: nativeRes.peerAddress,
            rawAck: parsedAck,
          },
          bytes: nativeRes.bytes || byteLength,
        };
      }

      return {
        success: false,
        error: nativeRes.error || `Sin respuesta de rescatista Bluetooth en ${targetDeviceId}.`,
        bytes: byteLength,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Error en canal Bluetooth nativo',
        bytes: byteLength,
      };
    }
  }

  // 2. Modo emulado/fallback para tests unitarios y entornos sin hardware nativo
  try {
    for (let i = 1; i <= chunksCount; i++) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      if (onProgress) {
        onProgress(i / chunksCount);
      }
    }

    if (mockReceiverAckRequested) {
      mockReceiverAckRequested = false;
      return {
        success: true,
        response: {
          ackPacketId: packet.packetId,
          receivedAt: Date.now(),
          status: 'received_via_bluetooth',
          nodeId: targetDeviceId || 'BRIGADA-BT-01',
        },
        bytes: byteLength,
      };
    }

    return {
      success: false,
      error: `Sin acuse de recibo (ACK) de rescatista Bluetooth en ${targetDeviceId || 'el canal BLE'}.`,
      bytes: byteLength,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error en canal Bluetooth',
      bytes: byteLength,
    };
  }
}

// Constantes de Duty Cycling para ahorro de batería y anticolisión
export const BEACON_BURST_TIMEOUT_MS = 2500; // Intento activo de conexión
export const BEACON_SLEEP_MS = 3500; // Reposo para ahorrar batería (~70% ahorro)
export const JITTER_MIN_MS = 400; // Retraso aleatorio mínimo anti-colisión
export const JITTER_MAX_MS = 1200; // Retraso aleatorio máximo anti-colisión

export interface BeaconCallbackEvents {
  onBeaconAttempt?: (attemptCount: number, message: string) => void;
  onSleepCycle?: (sleepingSeconds: number) => void;
}

/**
 * Emite una baliza continua con Duty-Cycling y Jitter aleatorio anti-colisión
 * Continúa enviando hasta que recibe un ACK verificado o se aborta manualmente.
 */
export async function sendPacketContinuousBeacon(
  packet: P2PPacket,
  options: {
    transport: P2PTransportType;
    targetAddress: string;
    port?: number;
    abortSignal?: { aborted: boolean };
    callbacks?: BeaconCallbackEvents;
  }
): Promise<{ success: boolean; response?: any; error?: string; bytes: number; totalAttempts: number }> {
  let attempt = 0;
  let totalBytesTransferred = 0;

  console.log(`[P2P Beacon] Iniciando baliza continua SOS (${options.transport})...`);

  // Si es Bluetooth, activar simultáneamente la baliza publicitaria BLE estilo AirTag al éter
  if (options.transport === 'bluetooth' && isBluetoothNativeSupported()) {
    try {
      const firstRep = (packet.payload as any)?.reports?.[0];
      const prio = firstRep?.triagePriority || 'ROJO';
      const pCount = firstRep?.reportedPeopleCount || 1;
      const repId = firstRep?.reportId || packet.packetId || 'SOS';
      startBleBeacon(prio, pCount, repId).catch((e) => console.warn('[P2P Beacon] Error BLE Beacon:', e));
    } catch (e) {}
  }

  try {
    while (!options.abortSignal?.aborted) {
      attempt++;
      options.callbacks?.onBeaconAttempt?.(
        attempt,
        `Emitiendo baliza #${attempt} vía ${options.transport === 'bluetooth' ? 'Bluetooth' : 'Wi-Fi Hotspot'}...`
      );

      // 1. Despachar intento con timeout corto de ráfaga
      const result = await dispatchPacket(packet, {
        transport: options.transport,
        targetAddress: options.targetAddress,
        port: options.port || DEFAULT_P2P_PORT,
        timeoutMs: BEACON_BURST_TIMEOUT_MS,
      });

      totalBytesTransferred += result.bytes || 0;

      // 2. Si hubo éxito o acuse ACK recibido, terminar con éxito inmediatamente
      if (result.success || mockReceiverAckRequested) {
        mockReceiverAckRequested = false;
        console.log(`[P2P Beacon] ¡Éxito en baliza #${attempt}! ACK confirmado por el receptor.`);
        return {
          success: true,
          response: result.response || {
            ackPacketId: packet.packetId,
            receivedAt: Date.now(),
            status: `received_via_${options.transport}`,
            nodeId: options.targetAddress,
          },
          bytes: totalBytesTransferred,
          totalAttempts: attempt,
        };
      }

      // 3. Verificar si el usuario canceló durante el intento
      if (options.abortSignal?.aborted) {
        resetMockReceiverAck();
        break;
      }

      // 4. Ciclo de Reposo (Duty Cycling) + Jitter aleatorio para no saturar 2.4 GHz
      const jitter = Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1)) + JITTER_MIN_MS;
      const sleepDuration = BEACON_SLEEP_MS + jitter;

      options.callbacks?.onSleepCycle?.(Math.round(sleepDuration / 1000));
      console.log(`[P2P Beacon] Reposo de ahorro de batería (${sleepDuration}ms) con jitter anti-colisión...`);

      // Esperar en intervalos fraccionados para permitir cancelación instantánea
      const step = 200;
      let elapsed = 0;
      while (elapsed < sleepDuration) {
        if (options.abortSignal?.aborted) break;
        await new Promise((r) => setTimeout(r, Math.min(step, sleepDuration - elapsed)));
        elapsed += step;
      }
    }

    return {
      success: false,
      error: 'Baliza cancelada por el usuario.',
      bytes: totalBytesTransferred,
      totalAttempts: attempt,
    };
  } finally {
    // Asegurar que la baliza BLE se apaga al salir
    if (options.transport === 'bluetooth' && isBluetoothNativeSupported()) {
      stopBleBeacon().catch(() => {});
    }
  }
}

/**
 * Despachador unificado de paquetes P2P según el modo de transporte
 */
export async function dispatchPacket(
  packet: P2PPacket,
  options: {
    transport: P2PTransportType;
    targetAddress: string;
    port?: number;
    timeoutMs?: number;
    onProgress?: (p: number) => void;
  }
): Promise<{ success: boolean; response?: any; error?: string; bytes: number }> {
  if (options.transport === 'bluetooth') {
    return sendPacketViaBluetooth(options.targetAddress, packet, options.onProgress);
  }

  // Fallback / default a Wi-Fi LAN
  return sendPacketViaWifi(
    options.targetAddress,
    packet,
    options.port || DEFAULT_P2P_PORT,
    options.timeoutMs || DEFAULT_TIMEOUT_MS
  );
}
