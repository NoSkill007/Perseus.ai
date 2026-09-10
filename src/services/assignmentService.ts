/**
 * Servicio de Asignaciones y Resolución de Conflictos — Perseus.ai
 * Gestiona la toma de casos por brigadas y la detección de conflictos de asignación.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { AssignmentRecord, AssignmentStatus } from '../types/triageTypes';
import { updateReportStatus } from './reportService';

interface AssignmentRow {
  id: string;
  report_id: string;
  node_id: string;
  assigned_at: number;
  status: string;
  notes: string | null;
}

function rowToAssignment(row: AssignmentRow): AssignmentRecord {
  return {
    id: row.id,
    reportId: row.report_id,
    nodeId: row.node_id,
    assignedAt: row.assigned_at,
    status: (row.status as AssignmentStatus) || 'propuesta',
    notes: row.notes || undefined,
  };
}

/**
 * Reclama o asigna un caso de emergencia a un nodo rescatista
 */
export function claimReport(
  db: SQLiteDatabase,
  reportId: string,
  nodeId: string,
  notes?: string
): AssignmentRecord {
  const assignmentId = `assign-${Date.now()}-${reportId.slice(0, 8)}`;
  const now = Date.now();

  const record: AssignmentRecord = {
    id: assignmentId,
    reportId,
    nodeId,
    assignedAt: now,
    status: 'en_camino',
    notes,
  };

  db.runSync(
    `INSERT OR REPLACE INTO assignments (
      id, report_id, node_id, assigned_at, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.reportId,
      record.nodeId,
      record.assignedAt,
      record.status,
      record.notes || '',
    ]
  );

  // Actualizar el estado del reporte a 'en_atencion'
  updateReportStatus(db, reportId, 'en_atencion');
  console.log(`[AssignmentService] Reporte ${reportId} asignado al nodo ${nodeId} (${record.status}).`);

  return record;
}

/**
 * Registra una asignación remota recibida vía P2P
 */
export function recordRemoteAssignment(
  db: SQLiteDatabase,
  assignment: AssignmentRecord
): { isConflict: boolean; conflictingAssignments: AssignmentRecord[] } {
  const existing = getAssignmentsForReport(db, assignment.reportId);
  
  // Guardar la asignación recibida
  db.runSync(
    `INSERT OR REPLACE INTO assignments (
      id, report_id, node_id, assigned_at, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      assignment.id,
      assignment.reportId,
      assignment.nodeId,
      assignment.assignedAt,
      assignment.status,
      assignment.notes || '',
    ]
  );

  // Detección de Conflicto: Si otro nodo distinto ya había asignado este mismo reporte
  const conflicting = existing.filter(
    (a) => a.nodeId !== assignment.nodeId && a.status !== 'cancelado' && a.status !== 'atendido'
  );

  if (conflicting.length > 0) {
    console.warn(`[AssignmentService] ⚠️ CONFLICTO DETECTADO en reporte ${assignment.reportId}: Múltiples brigadas asignadas.`);
    // Marcar en la tabla como conflicto
    db.runSync('UPDATE assignments SET status = ? WHERE report_id = ?', ['conflicto', assignment.reportId]);
    return { isConflict: true, conflictingAssignments: [...conflicting, assignment] };
  }

  return { isConflict: false, conflictingAssignments: [] };
}

/**
 * Obtiene todas las asignaciones de un reporte
 */
export function getAssignmentsForReport(db: SQLiteDatabase, reportId: string): AssignmentRecord[] {
  try {
    const rows = db.getAllSync<AssignmentRow>(
      'SELECT * FROM assignments WHERE report_id = ? ORDER BY assigned_at DESC',
      [reportId]
    );
    return rows.map(rowToAssignment);
  } catch (err) {
    console.warn(`[AssignmentService] Error al obtener asignaciones de ${reportId}:`, err);
    return [];
  }
}

/**
 * Obtiene todos los casos con conflicto de asignación activo
 */
export function getConflictingAssignments(db: SQLiteDatabase): AssignmentRecord[] {
  try {
    const rows = db.getAllSync<AssignmentRow>(
      "SELECT * FROM assignments WHERE status = 'conflicto' ORDER BY assigned_at DESC"
    );
    return rows.map(rowToAssignment);
  } catch (err) {
    console.warn('[AssignmentService] Error al obtener conflictos:', err);
    return [];
  }
}

/**
 * Resuelve un conflicto de asignación dejando activo a un nodo designado
 */
export function resolveAssignmentConflict(
  db: SQLiteDatabase,
  reportId: string,
  winningNodeId: string
): void {
  db.runSync(
    "UPDATE assignments SET status = 'cancelado' WHERE report_id = ? AND node_id != ?",
    [reportId, winningNodeId]
  );
  db.runSync(
    "UPDATE assignments SET status = 'en_camino' WHERE report_id = ? AND node_id = ?",
    [reportId, winningNodeId]
  );
  console.log(`[AssignmentService] Conflicto resuelto para reporte ${reportId}. Asignado a ${winningNodeId}.`);
}
