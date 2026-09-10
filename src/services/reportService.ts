/**
 * Servicio de reportes de emergencia — Perseus.ai
 * CRUD para reportes de triaje almacenados en SQLite local.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  ReportRecord,
  ReportStatus,
  ReportSource,
  StartPriority,
  DisasterNeedCategory,
  UserProfile,
  TriageResult,
} from '../types/triageTypes';

interface ReportRow {
  report_id: string;
  created_at: number;
  source: string;
  status: string;
  transcript: string | null;
  vision_severity: string | null;
  extracted_summary: string;
  triage_priority: string;
  needs: string | null;
  reported_people_count: number | null;
  location_reference: string | null;
  missing_fields: string | null;
  raw_model_output: string | null;
  is_local_inference: number;
  execution_time_ms: number | null;
  province: string | null;
  district: string | null;
  corregimiento: string | null;
  reporter_profile: string | null;
  sync_event_id: string | null;
  sent_at: number | null;
  received_at: number | null;
  ack_received: number;
  updated_at: number;
}

function rowToReport(row: ReportRow): ReportRecord {
  return {
    reportId: row.report_id,
    createdAt: row.created_at,
    source: (row.source as ReportSource) || 'local',
    status: (row.status as ReportStatus) || 'borrador',
    transcript: row.transcript || undefined,
    visionSeverity: row.vision_severity || undefined,
    extractedSummary: row.extracted_summary || '',
    triagePriority: (row.triage_priority as StartPriority) || 'AMARILLO',
    needs: row.needs ? JSON.parse(row.needs) : [],
    reportedPeopleCount: row.reported_people_count != null && row.reported_people_count > 0 ? row.reported_people_count : undefined,
    locationReference: row.location_reference || undefined,
    missingFields: row.missing_fields ? JSON.parse(row.missing_fields) : [],
    rawModelOutput: row.raw_model_output || undefined,
    isLocalInference: row.is_local_inference === 1,
    executionTimeMs: row.execution_time_ms ?? 0,
    province: row.province || undefined,
    district: row.district || undefined,
    corregimiento: row.corregimiento || undefined,
    reporterProfile: row.reporter_profile ? JSON.parse(row.reporter_profile) : undefined,
    syncEventId: row.sync_event_id || undefined,
    sentAt: row.sent_at || undefined,
    receivedAt: row.received_at || undefined,
    ackReceived: row.ack_received === 1,
    updatedAt: row.updated_at || Date.now(),
  };
}

/**
 * Guarda un reporte nuevo en SQLite local
 * NOTA: Expo SQLite / Kotlin no admite nulls en bindParams. Se sanitizan a strings vacíos/0.
 */
export function saveReport(
  db: SQLiteDatabase,
  report: ReportRecord
): void {
  const now = Date.now();
  db.runSync(
    `INSERT OR REPLACE INTO reports (
      report_id, created_at, source, status,
      transcript, vision_severity, extracted_summary, triage_priority,
      needs, reported_people_count, location_reference, missing_fields,
      raw_model_output, is_local_inference, execution_time_ms,
      province, district, corregimiento,
      reporter_profile, sync_event_id, sent_at, received_at, ack_received,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      report.reportId || '',
      report.createdAt || now,
      report.source || 'local',
      report.status || 'borrador',
      report.transcript || '',
      report.visionSeverity || '',
      report.extractedSummary || '',
      report.triagePriority || 'AMARILLO',
      JSON.stringify(report.needs || []),
      report.reportedPeopleCount ?? 0,
      report.locationReference || '',
      JSON.stringify(report.missingFields || []),
      report.rawModelOutput || '',
      report.isLocalInference ? 1 : 0,
      report.executionTimeMs || 0,
      report.province || '',
      report.district || '',
      report.corregimiento || '',
      report.reporterProfile ? JSON.stringify(report.reporterProfile) : '',
      report.syncEventId || '',
      report.sentAt || 0,
      report.receivedAt || 0,
      report.ackReceived ? 1 : 0,
      now,
    ]
  );
  console.log(`[ReportService] Reporte ${report.reportId} guardado (${report.status}).`);
}

/**
 * Convierte un TriageResult del pipeline de IA a un ReportRecord listo para guardar
 */
export function triageResultToReport(
  result: TriageResult,
  source: ReportSource = 'local',
  province?: string,
  district?: string,
  corregimiento?: string
): ReportRecord {
  return {
    reportId: result.reportId,
    createdAt: result.createdAt,
    source,
    status: 'borrador',
    transcript: result.transcript,
    visionSeverity: result.visionSeverity,
    extractedSummary: result.extractedSummary,
    triagePriority: result.triagePriority,
    needs: result.needs,
    reportedPeopleCount: result.reportedPeopleCount,
    locationReference: result.locationReference,
    missingFields: result.missingFields,
    rawModelOutput: result.rawModelOutput,
    isLocalInference: result.isLocalInference,
    executionTimeMs: result.executionTimeMs,
    province,
    district,
    corregimiento,
    ackReceived: false,
    updatedAt: Date.now(),
  };
}

/**
 * Obtiene todos los reportes ordenados por fecha descendente
 */
export function getReports(db: SQLiteDatabase): ReportRecord[] {
  try {
    const rows = db.getAllSync<ReportRow>('SELECT * FROM reports ORDER BY created_at DESC');
    return rows.map(rowToReport);
  } catch (err) {
    console.warn('[ReportService] Error al obtener reportes:', err);
    return [];
  }
}

/**
 * Obtiene reportes filtrados por estado
 */
export function getReportsByStatus(db: SQLiteDatabase, status: ReportStatus): ReportRecord[] {
  try {
    const rows = db.getAllSync<ReportRow>(
      'SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC',
      [status]
    );
    return rows.map(rowToReport);
  } catch (err) {
    console.warn('[ReportService] Error al obtener reportes por estado:', err);
    return [];
  }
}

/**
 * Obtiene reportes filtrados por prioridad
 */
export function getReportsByPriority(db: SQLiteDatabase, priority: StartPriority): ReportRecord[] {
  try {
    const rows = db.getAllSync<ReportRow>(
      'SELECT * FROM reports WHERE triage_priority = ? ORDER BY created_at DESC',
      [priority]
    );
    return rows.map(rowToReport);
  } catch (err) {
    console.warn('[ReportService] Error al obtener reportes por prioridad:', err);
    return [];
  }
}

/**
 * Obtiene reportes recibidos via P2P ordenados por prioridad (ROJO primero)
 */
export function getReceivedReports(db: SQLiteDatabase): ReportRecord[] {
  try {
    const priorityOrder = `CASE triage_priority 
      WHEN 'ROJO' THEN 1 
      WHEN 'AMARILLO' THEN 2 
      WHEN 'VERDE' THEN 3 
      WHEN 'NEGRO' THEN 4 
      ELSE 5 END`;
    const rows = db.getAllSync<ReportRow>(
      `SELECT * FROM reports WHERE source = 'received' ORDER BY ${priorityOrder}, created_at DESC`
    );
    return rows.map(rowToReport);
  } catch (err) {
    console.warn('[ReportService] Error al obtener reportes recibidos:', err);
    return [];
  }
}

/**
 * Obtiene un reporte por ID
 */
export function getReportById(db: SQLiteDatabase, reportId: string): ReportRecord | null {
  try {
    const row = db.getFirstSync<ReportRow>(
      'SELECT * FROM reports WHERE report_id = ?',
      [reportId]
    );
    return row ? rowToReport(row) : null;
  } catch (err) {
    console.warn(`[ReportService] Error al obtener reporte ${reportId}:`, err);
    return null;
  }
}

/**
 * Actualiza el estado de un reporte
 */
export function updateReportStatus(db: SQLiteDatabase, reportId: string, status: ReportStatus): void {
  db.runSync(
    'UPDATE reports SET status = ?, updated_at = ? WHERE report_id = ?',
    [status, Date.now(), reportId]
  );
  console.log(`[ReportService] Reporte ${reportId} actualizado a ${status}.`);
}

/**
 * Actualiza campos editables de un reporte (revisión humana)
 */
export function updateReportFields(
  db: SQLiteDatabase,
  reportId: string,
  fields: {
    extractedSummary?: string;
    triagePriority?: StartPriority;
    needs?: DisasterNeedCategory[];
    reportedPeopleCount?: number;
    locationReference?: string;
    status?: ReportStatus;
  }
): void {
  const updates: string[] = [];
  const params: any[] = [];

  if (fields.extractedSummary !== undefined) {
    updates.push('extracted_summary = ?');
    params.push(fields.extractedSummary || '');
  }
  if (fields.triagePriority !== undefined) {
    updates.push('triage_priority = ?');
    params.push(fields.triagePriority || 'AMARILLO');
  }
  if (fields.needs !== undefined) {
    updates.push('needs = ?');
    params.push(JSON.stringify(fields.needs || []));
  }
  if (fields.reportedPeopleCount !== undefined) {
    updates.push('reported_people_count = ?');
    params.push(fields.reportedPeopleCount || 0);
  }
  if (fields.locationReference !== undefined) {
    updates.push('location_reference = ?');
    params.push(fields.locationReference || '');
  }
  if (fields.status !== undefined) {
    updates.push('status = ?');
    params.push(fields.status || 'borrador');
  }

  if (updates.length === 0) return;

  updates.push('updated_at = ?');
  params.push(Date.now());
  params.push(reportId);

  db.runSync(
    `UPDATE reports SET ${updates.join(', ')} WHERE report_id = ?`,
    params
  );
  console.log(`[ReportService] Campos actualizados para reporte ${reportId}.`);
}

/**
 * Marca un reporte como enviado
 */
export function markReportSent(db: SQLiteDatabase, reportId: string, syncEventId: string): void {
  db.runSync(
    'UPDATE reports SET status = ?, sent_at = ?, sync_event_id = ?, updated_at = ? WHERE report_id = ?',
    ['enviado', Date.now(), syncEventId || '', Date.now(), reportId]
  );
}

/**
 * Marca un reporte como ACK recibido
 */
export function markReportAckReceived(db: SQLiteDatabase, reportId: string): void {
  db.runSync(
    'UPDATE reports SET ack_received = 1, updated_at = ? WHERE report_id = ?',
    [Date.now(), reportId]
  );
}

/**
 * Verifica si un reporte ya existe (deduplicación P2P)
 */
export function reportExists(db: SQLiteDatabase, reportId: string): boolean {
  try {
    const row = db.getFirstSync<{ count: number }>(
      'SELECT COUNT(*) as count FROM reports WHERE report_id = ?',
      [reportId]
    );
    return (row?.count ?? 0) > 0;
  } catch (err) {
    console.warn(`[ReportService] Error al verificar reporte ${reportId}:`, err);
    return false;
  }
}

/**
 * Elimina un reporte por su ID
 */
export function deleteReport(db: SQLiteDatabase, reportId: string): void {
  try {
    db.runSync('DELETE FROM assignments WHERE report_id = ?', [reportId]);
  } catch {}
  try {
    db.runSync('DELETE FROM sync_log WHERE report_id = ?', [reportId]);
  } catch {}
  try {
    db.runSync('DELETE FROM sync_events WHERE report_id = ?', [reportId]);
  } catch {}
  db.runSync('DELETE FROM reports WHERE report_id = ?', [reportId]);
  console.log(`[ReportService] Reporte ${reportId} eliminado.`);
}

/**
 * Cuenta reportes por estado (para dashboard del rescatista)
 */
export function getReportCounts(db: SQLiteDatabase): Record<string, number> {
  try {
    const rows = db.getAllSync<{ status: string; count: number }>(
      'SELECT status, COUNT(*) as count FROM reports GROUP BY status'
    );
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.status] = row.count;
    }
    return counts;
  } catch (err) {
    console.warn('[ReportService] Error al contar reportes:', err);
    return {};
  }
}

/**
 * Obtiene los últimos N reportes locales
 */
export function getRecentReports(db: SQLiteDatabase, limit: number = 3): ReportRecord[] {
  try {
    const rows = db.getAllSync<ReportRow>(
      'SELECT * FROM reports WHERE source = ? ORDER BY created_at DESC LIMIT ?',
      ['local', limit]
    );
    return rows.map(rowToReport);
  } catch (err) {
    console.warn('[ReportService] Error al obtener reportes recientes:', err);
    return [];
  }
}

/**
 * Búsqueda simple en resúmenes de reportes
 */
export function searchReports(db: SQLiteDatabase, query: string): ReportRecord[] {
  try {
    const rows = db.getAllSync<ReportRow>(
      'SELECT * FROM reports WHERE extracted_summary LIKE ? ORDER BY created_at DESC',
      [`%${query}%`]
    );
    return rows.map(rowToReport);
  } catch (err) {
    console.warn('[ReportService] Error en búsqueda de reportes:', err);
    return [];
  }
}
