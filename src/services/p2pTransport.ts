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
 * Formatea un paquete P2P para transmisión Bluetooth (fragmentación / chunking)
 */
export function formatBluetoothPayload(packet: P2PPacket): {
  raw: string;
  byteLength: number;
  chunksCount: number;
} {
  const raw = JSON.stringify(packet);
  const byteLength = new TextEncoder().encode(raw).length;
  const CHUNK_SIZE = 512; // Tamaño estándar de buffer BLE / RFCOMM
  const chunksCount = Math.ceil(byteLength / CHUNK_SIZE);

  return {
    raw,
    byteLength,
    chunksCount,
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

/**
 * Simula el canal de transporte Bluetooth offline (Store-and-Forward / RFCOMM)
 */
export async function sendPacketViaBluetooth(
  targetDeviceId: string,
  packet: P2PPacket,
  onProgress?: (progress: number) => void
): Promise<{ success: boolean; response?: any; error?: string; bytes: number }> {
  const { raw, byteLength, chunksCount } = formatBluetoothPayload(packet);

  try {
    // Simular el handshake y transmisión de chunks BLE
    for (let i = 1; i <= chunksCount; i++) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (onProgress) {
        onProgress(i / chunksCount);
      }
    }

    return {
      success: true,
      response: {
        ackPacketId: packet.packetId,
        receivedAt: Date.now(),
        status: 'received_via_bluetooth',
      },
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
