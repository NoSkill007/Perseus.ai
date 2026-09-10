/**
 * Servicio de Bitácora de Sincronización (sync_log) — Perseus.ai
 * Registra evidencia técnica auditable de transferencias, acuses (ACK) y relays P2P para el jurado.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncLogRecord, P2PTransportType } from '../types/triageTypes';

interface SyncLogRow {
  id: string;
  report_id: string;
  node_id: string | null;
  synced_at: number;
  direction: string;
  transport: string;
  bytes_transferred: number | null;
  status: string;
}

function rowToSyncLog(row: SyncLogRow): SyncLogRecord {
  return {
    id: row.id,
    reportId: row.report_id,
    nodeId: row.node_id || undefined,
    syncedAt: row.synced_at,
    direction: (row.direction as 'sent' | 'received') || 'sent',
    transport: (row.transport as P2PTransportType) || 'wifi_lan',
    bytesTransferred: row.bytes_transferred ?? 0,
    status: (row.status as 'exitoso' | 'fallido' | 'duplicado') || 'exitoso',
  };
}

/**
 * Registra un evento en la bitácora de sincronización P2P
 */
export function recordSyncLog(
  db: SQLiteDatabase,
  entry: Omit<SyncLogRecord, 'id'>
): SyncLogRecord {
  const id = `synclog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record: SyncLogRecord = {
    id,
    ...entry,
  };

  try {
    db.runSync(
      `INSERT INTO sync_log (
        id, report_id, node_id, synced_at, direction, transport, bytes_transferred, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.reportId,
        record.nodeId || '',
        record.syncedAt,
        record.direction,
        record.transport,
        record.bytesTransferred || 0,
        record.status,
      ]
    );
    console.log(`[SyncLogService] Log P2P registrado: [${record.direction.toUpperCase()}] ${record.reportId.slice(0, 8)} (${record.transport}).`);
  } catch (err) {
    console.warn('[SyncLogService] Error al guardar sync_log:', err);
  }

  return record;
}

/**
 * Obtiene las últimas N entradas de la bitácora de sincronización P2P
 */
export function getRecentSyncLogs(db: SQLiteDatabase, limit: number = 30): SyncLogRecord[] {
  try {
    const rows = db.getAllSync<SyncLogRow>(
      'SELECT * FROM sync_log ORDER BY synced_at DESC LIMIT ?',
      [limit]
    );
    return rows.map(rowToSyncLog);
  } catch (err) {
    console.warn('[SyncLogService] Error al obtener sync_log:', err);
    return [];
  }
}

/**
 * Estadísticas de transferencias P2P
 */
export function getSyncStats(db: SQLiteDatabase): {
  totalSent: number;
  totalReceived: number;
  totalDuplicates: number;
} {
  try {
    const rows = db.getAllSync<{ direction: string; status: string; count: number }>(
      'SELECT direction, status, COUNT(*) as count FROM sync_log GROUP BY direction, status'
    );
    let totalSent = 0;
    let totalReceived = 0;
    let totalDuplicates = 0;

    for (const r of rows) {
      if (r.direction === 'sent' && r.status === 'exitoso') totalSent += r.count;
      if (r.direction === 'received' && r.status === 'exitoso') totalReceived += r.count;
      if (r.status === 'duplicado') totalDuplicates += r.count;
    }

    return { totalSent, totalReceived, totalDuplicates };
  } catch {
    return { totalSent: 0, totalReceived: 0, totalDuplicates: 0 };
  }
}
