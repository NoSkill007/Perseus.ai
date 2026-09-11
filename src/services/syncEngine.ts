/**
 * Motor de Sincronización P2P Offline — Perseus.ai
 * Orquesta la captura, serialización, transmisión multi-transporte, deduplicación y acuses (ACK).
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  P2PPacket,
  P2PTransportType,
  ReportRecord,
  UserProfile,
  RescueNode,
  AssignmentRecord,
} from '../types/triageTypes';
import {
  getReportById,
  getReports,
  markReportSent,
  markReportAckReceived,
  reportExists,
  saveReport,
  attachReportMedia,
} from './reportService';
import { upsertRescueNode, getLocalNode } from './nodeService';
import { recordRemoteAssignment, claimReport } from './assignmentService';
import { recordSyncLog } from './syncLogService';
import {
  createPacket,
  validatePacket,
  dispatchPacket,
  sendPacketContinuousBeacon,
  BeaconCallbackEvents,
} from './p2pTransport';

export interface SyncResult {
  success: boolean;
  reportsSent: number;
  bytesTransferred: number;
  transport: P2PTransportType;
  totalAttempts?: number;
  error?: string;
}

export interface BeaconSyncOptions {
  reportIds: string[];
  targetAddress: string;
  transport: P2PTransportType;
  localProfile: UserProfile | null;
  deviceId: string;
  abortSignal?: { aborted: boolean };
  onStatusUpdate?: (message: string, isSleeping?: boolean, attemptCount?: number) => void;
}

/**
 * Emite una baliza continua SOS para sincronizar reportes hasta que un rescatista responda con ACK
 * o el usuario detenga manualmente la baliza. Aplica Duty-Cycling y Jitter.
 */
export async function syncReportsBeaconLoop(
  db: SQLiteDatabase,
  options: BeaconSyncOptions
): Promise<SyncResult> {
  const { reportIds, targetAddress, transport, localProfile, deviceId, abortSignal, onStatusUpdate } = options;

  if (reportIds.length === 0) {
    return { success: false, reportsSent: 0, bytesTransferred: 0, transport, error: 'No hay reportes seleccionados' };
  }

  const senderNode = {
    id: deviceId,
    callsign: localProfile?.fullName || `Nodo-${deviceId.slice(0, 4)}`,
  };

  const reportsPayload: any[] = [];
  for (const rid of reportIds) {
    const r = getReportById(db, rid);
    if (r) {
      reportsPayload.push({
        ...r,
        reporterProfile: localProfile,
      });
    }
  }

  if (reportsPayload.length === 0) {
    return { success: false, reportsSent: 0, bytesTransferred: 0, transport, error: 'No se encontraron los reportes en la base de datos' };
  }

  const packet = createPacket('REPORT_BUNDLE', senderNode, {
    reports: reportsPayload,
    sentAt: Date.now(),
  });

  const callbacks: BeaconCallbackEvents = {
    onBeaconAttempt: (attemptCount, msg) => {
      onStatusUpdate?.(msg, false, attemptCount);
    },
    onSleepCycle: (sleepingSeconds) => {
      onStatusUpdate?.(`Ahorro de batería activo. Próxima baliza en ${sleepingSeconds}s...`, true);
    },
  };

  const beaconRes = await sendPacketContinuousBeacon(packet, {
    transport,
    targetAddress,
    abortSignal,
    callbacks,
  });

  const now = Date.now();

  if (!beaconRes.success) {
    // Si fue cancelado por el usuario
    return {
      success: false,
      reportsSent: 0,
      bytesTransferred: beaconRes.bytes,
      transport,
      totalAttempts: beaconRes.totalAttempts,
      error: beaconRes.error || 'Baliza SOS detenida',
    };
  }

  // Éxito confirmado por el receptor -> Marcar ACK y bitácora
  onStatusUpdate?.('¡ACK recibido de rescatista! Registrando entrega en SQLite...', false, beaconRes.totalAttempts);
  for (const r of reportsPayload) {
    const syncEventId = `sync-beacon-${now}-${r.reportId.slice(0, 8)}`;
    markReportSent(db, r.reportId, syncEventId);
    markReportAckReceived(db, r.reportId);

    recordSyncLog(db, {
      reportId: r.reportId,
      nodeId: targetAddress,
      syncedAt: now,
      direction: 'sent',
      transport,
      bytesTransferred: Math.round(beaconRes.bytes / reportsPayload.length),
      status: 'exitoso',
    });
  }

  return {
    success: true,
    reportsSent: reportsPayload.length,
    bytesTransferred: beaconRes.bytes,
    transport,
    totalAttempts: beaconRes.totalAttempts,
  };
}

/**
 * Prepara y envía un conjunto de reportes confirmados a un nodo par (Rescatista o Relay)
 */
export async function syncReportsToPeer(
  db: SQLiteDatabase,
  options: {
    reportIds: string[];
    targetAddress: string;
    transport: P2PTransportType;
    localProfile: UserProfile | null;
    deviceId: string;
    onProgress?: (progress: number, message: string) => void;
  }
): Promise<SyncResult> {
  const { reportIds, targetAddress, transport, localProfile, deviceId, onProgress } = options;

  if (reportIds.length === 0) {
    return { success: false, reportsSent: 0, bytesTransferred: 0, transport, error: 'No hay reportes seleccionados' };
  }

  const senderNode = {
    id: deviceId,
    callsign: localProfile?.fullName || `Nodo-${deviceId.slice(0, 4)}`,
  };

  // Recolectar reportes válidos
  const reportsPayload: any[] = [];
  for (const rid of reportIds) {
    const r = getReportById(db, rid);
    if (r) {
      reportsPayload.push({
        ...r,
        reporterProfile: localProfile,
      });
    }
  }

  if (reportsPayload.length === 0) {
    return { success: false, reportsSent: 0, bytesTransferred: 0, transport, error: 'No se encontraron los reportes en la base de datos' };
  }

  // 1. Crear Paquete P2P
  const packet = createPacket('REPORT_BUNDLE', senderNode, {
    reports: reportsPayload,
    sentAt: Date.now(),
  });

  onProgress?.(0.2, `Preparando transmisión por ${transport === 'bluetooth' ? 'Bluetooth' : transport === 'nearby' ? 'Google Nearby' : 'Wi-Fi Hotspot'}...`);

  // 2. Despachar paquete por el transporte seleccionado
  const dispatchRes = await dispatchPacket(packet, {
    transport,
    targetAddress,
    onProgress: (p) => onProgress?.(0.2 + p * 0.6, `Transmitiendo datos (${Math.round(p * 100)}%)...`),
  });

  const now = Date.now();

  if (!dispatchRes.success) {
    // Registrar fallo en auditoría
    for (const r of reportsPayload) {
      recordSyncLog(db, {
        reportId: r.reportId,
        nodeId: targetAddress,
        syncedAt: now,
        direction: 'sent',
        transport,
        bytesTransferred: dispatchRes.bytes,
        status: 'fallido',
      });
    }

    return {
      success: false,
      reportsSent: 0,
      bytesTransferred: dispatchRes.bytes,
      transport,
      error: dispatchRes.error || 'Fallo de transmisión P2P',
    };
  }

  // 3. Procesar éxito y marcar ACKs
  onProgress?.(0.9, 'Registrando acuses y bitácora de entrega...');
  for (const r of reportsPayload) {
    const syncEventId = `sync-${now}-${r.reportId.slice(0, 8)}`;
    markReportSent(db, r.reportId, syncEventId);
    markReportAckReceived(db, r.reportId);

    // Auditoría en sync_log
    recordSyncLog(db, {
      reportId: r.reportId,
      nodeId: targetAddress,
      syncedAt: now,
      direction: 'sent',
      transport,
      bytesTransferred: Math.round(dispatchRes.bytes / reportsPayload.length),
      status: 'exitoso',
    });
  }

  onProgress?.(1.0, '¡Sincronización completada exitosamente!');

  return {
    success: true,
    reportsSent: reportsPayload.length,
    bytesTransferred: dispatchRes.bytes,
    transport,
  };
}

/**
 * Procesa un paquete P2P entrante de cualquier transporte
 */
export function processIncomingPacket(
  db: SQLiteDatabase,
  rawPacket: unknown,
  transport: P2PTransportType = 'wifi_lan'
): {
  success: boolean;
  ackPacket?: P2PPacket;
  processedCount: number;
  conflictDetected: boolean;
  error?: string;
} {
  try {
    const packet = validatePacket(rawPacket);
    const now = Date.now();

    const senderId = packet.senderNode?.id || packet.senderNodeId || 'nodo-desconocido';
    const senderCallsign = packet.senderNode?.callsign || packet.senderCallsign || 'Rescatista';

    // 1. Registrar nodo emisor en rescue_nodes
    upsertRescueNode(db, {
      id: senderId,
      deviceId: senderId,
      callsign: senderCallsign,
      role: packet.senderNode?.role || 'rescatista',
      lastSeen: now,
    });

    let processedCount = 0;
    let conflictDetected = false;

    // 2. Procesar según tipo de mensaje
    switch (packet.type) {
      case 'REPORT_BUNDLE': {
        const bundle = packet.payload?.reports || packet.reports;
        if (Array.isArray(bundle)) {
          for (const rep of bundle) {
            const rid = rep.reportId || rep.id;
            if (!rid) continue;

            const exists = reportExists(db, rid);
            if (exists) {
              // Registro de duplicado evitado
              recordSyncLog(db, {
                reportId: rid,
                nodeId: senderId,
                syncedAt: now,
                direction: 'received',
                transport,
                bytesTransferred: 0,
                status: 'duplicado',
              });
              continue;
            }

            // Insertar reporte recibido preservando todos los datos clínicos y multimedia
            const newRecord: ReportRecord = {
              reportId: rid,
              createdAt: rep.createdAt || now,
              source: 'received',
              status: 'recibido',
              transcript: rep.transcript || rep.rawInputText || '',
              audioUri: rep.audioUri || undefined,
              imageUri: rep.imageUri || undefined,
              visionSeverity: rep.visionSeverity || undefined,
              visualTriageAnalysis: rep.visualTriageAnalysis || undefined,
              injuriesAndSymptoms: rep.injuriesAndSymptoms || undefined,
              extractedSummary: rep.extractedSummary || 'Reporte de emergencia recibido',
              triagePriority: rep.triagePriority || 'AMARILLO',
              needs: rep.needs || rep.sphereNeeds || ['SALUD'],
              locationReference: rep.locationReference || '',
              reportedPeopleCount: rep.reportedPeopleCount || 1,
              missingFields: rep.missingFields || [],
              province: rep.province || undefined,
              district: rep.district || undefined,
              corregimiento: rep.corregimiento || undefined,
              reporterProfile: rep.reporterProfile || undefined,
              rawModelOutput: rep.rawModelOutput || undefined,
              isLocalInference: rep.isLocalInference ?? true,
              executionTimeMs: rep.executionTimeMs || 0,
              receivedAt: now,
              ackReceived: true,
              updatedAt: now,
            };

            saveReport(db, newRecord);
            processedCount++;

            // Registrar log exitoso
            recordSyncLog(db, {
              reportId: rid,
              nodeId: senderId,
              syncedAt: now,
              direction: 'received',
              transport,
              bytesTransferred: 512,
              status: 'exitoso',
            });
          }
        }
        break;
      }

      case 'ASSIGNMENT_CLAIM': {
        const assignment: AssignmentRecord = packet.payload;
        if (assignment && assignment.reportId) {
          const res = recordRemoteAssignment(db, assignment);
          conflictDetected = res.isConflict;
          processedCount++;

          recordSyncLog(db, {
            reportId: assignment.reportId,
            nodeId: senderId,
            syncedAt: now,
            direction: 'received',
            transport,
            bytesTransferred: 256,
            status: 'exitoso',
          });
        }
        break;
      }

      case 'ACK': {
        const ackedReportIds = packet.payload?.ackedReportIds;
        if (Array.isArray(ackedReportIds)) {
          for (const rid of ackedReportIds) {
            markReportAckReceived(db, rid);
          }
        }
        break;
      }

      case 'HANDSHAKE':
      case 'PING':
        // Ya registrado el nodo
        break;
    }

    // 3. Generar Paquete ACK de respuesta
    const ackPacket = createPacket(
      'ACK',
      { id: 'local-node', callsign: 'Local-Receiver' },
      {
        inResponseTo: packet.packetId,
        receivedAt: now,
        processedCount,
        conflictDetected,
      },
      senderId
    );

    return {
      success: true,
      ackPacket,
      processedCount,
      conflictDetected,
    };
  } catch (err: any) {
    return {
      success: false,
      processedCount: 0,
      conflictDetected: false,
      error: err.message || 'Error al procesar paquete entrante',
    };
  }
}

/**
 * Reclama un caso y construye el paquete de broadcast para la red mesh
 */
export function claimAndBroadcastCase(
  db: SQLiteDatabase,
  reportId: string,
  localNode: { id: string; callsign: string; role: any },
  notes?: string
): { assignment: AssignmentRecord; packet: P2PPacket } {
  const assignment = claimReport(db, reportId, localNode.id, notes);
  const packet = createPacket('ASSIGNMENT_CLAIM', localNode, assignment);

  recordSyncLog(db, {
    reportId,
    nodeId: localNode.id,
    syncedAt: Date.now(),
    direction: 'sent',
    transport: 'wifi_lan',
    bytesTransferred: 256,
    status: 'exitoso',
  });

  return { assignment, packet };
}

/**
 * Procesa un archivo multimedia recibido vía Google Nearby Connections y lo asocia al reporte correspondiente
 */
export function handleIncomingNearbyFile(
  db: SQLiteDatabase,
  fileEvent: {
    endpointId: string;
    payloadId: string;
    fileUri: string;
    fileName: string;
    fileSize: number;
    metadata: string;
  }
): { success: boolean; reportId?: string; mediaType?: 'audio' | 'image'; error?: string } {
  try {
    let meta: any = {};
    if (typeof fileEvent.metadata === 'string' && fileEvent.metadata.startsWith('{')) {
      try {
        meta = JSON.parse(fileEvent.metadata);
      } catch {}
    } else if (typeof fileEvent.metadata === 'object' && fileEvent.metadata !== null) {
      meta = fileEvent.metadata;
    }

    const reportId = meta.reportId;
    const mediaType: 'audio' | 'image' = meta.type === 'image' || fileEvent.fileName?.endsWith('.jpg') || fileEvent.fileName?.endsWith('.jpeg') || fileEvent.fileName?.endsWith('.png')
      ? 'image'
      : 'audio';

    if (reportId) {
      attachReportMedia(db, reportId, fileEvent.fileUri, mediaType);
      recordSyncLog(db, {
        reportId,
        nodeId: fileEvent.endpointId,
        syncedAt: Date.now(),
        direction: 'received',
        transport: 'nearby',
        bytesTransferred: fileEvent.fileSize || 0,
        status: 'exitoso',
      });
      return { success: true, reportId, mediaType };
    }

    return { success: false, error: 'Metadata de archivo no contiene reportId' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error procesando archivo Nearby recibido' };
  }
}
