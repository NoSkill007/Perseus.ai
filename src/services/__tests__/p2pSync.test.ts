import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPacket,
  validatePacket,
  formatBluetoothPayload,
} from '../p2pTransport';
import {
  upsertRescueNode,
  getRescueNodes,
  getNodeById,
  getLocalNode,
} from '../nodeService';
import {
  claimReport,
  recordRemoteAssignment,
  getAssignmentsForReport,
  getConflictingAssignments,
  resolveAssignmentConflict,
} from '../assignmentService';
import {
  recordSyncLog,
  getRecentSyncLogs,
  getSyncStats,
} from '../syncLogService';
import { processIncomingPacket } from '../syncEngine';
import type { P2PPacket, AssignmentRecord, RescueNode } from '../../types/triageTypes';

// Mock simple de SQLiteDatabase en memoria para pruebas rápidas y determinísticas
class MockSQLiteDatabase {
  public tables: {
    user_profile: any[];
    reports: any[];
    rescue_nodes: any[];
    assignments: any[];
    sync_log: any[];
  } = {
    user_profile: [],
    reports: [],
    rescue_nodes: [],
    assignments: [],
    sync_log: [],
  };

  runSync(sql: string, params: any[] = []): any {
    const s = sql.trim();
    if (s.startsWith('INSERT OR REPLACE INTO rescue_nodes') || s.startsWith('INSERT INTO rescue_nodes')) {
      const [id, device_id, callsign, role, last_lat, last_lon, last_seen] = params;
      this.tables.rescue_nodes = this.tables.rescue_nodes.filter((r) => r.id !== id);
      this.tables.rescue_nodes.push({ id, device_id, callsign, role, last_lat, last_lon, last_seen });
      return { changes: 1 };
    }

    if (s.startsWith('INSERT OR REPLACE INTO assignments') || s.startsWith('INSERT INTO assignments')) {
      const [id, report_id, node_id, assigned_at, status, notes] = params;
      this.tables.assignments = this.tables.assignments.filter((r) => r.id !== id);
      this.tables.assignments.push({ id, report_id, node_id, assigned_at, status, notes });
      return { changes: 1 };
    }

    if (s.includes("status = 'cancelado'") && s.includes('AND node_id != ?')) {
      const [report_id, node_id] = params;
      for (const a of this.tables.assignments) {
        if (a.report_id === report_id && a.node_id !== node_id) a.status = 'cancelado';
      }
      return { changes: 1 };
    }

    if (s.includes("status = 'en_camino'") && s.includes('AND node_id = ?')) {
      const [report_id, node_id] = params;
      for (const a of this.tables.assignments) {
        if (a.report_id === report_id && a.node_id === node_id) a.status = 'en_camino';
      }
      return { changes: 1 };
    }

    if (s.startsWith('UPDATE assignments SET status = ? WHERE report_id = ?')) {
      const [status, report_id] = params;
      for (const a of this.tables.assignments) {
        if (a.report_id === report_id) a.status = status;
      }
      return { changes: 1 };
    }

    if (s.startsWith('INSERT INTO sync_log')) {
      const [id, report_id, node_id, synced_at, direction, transport, bytes_transferred, status] = params;
      this.tables.sync_log.push({ id, report_id, node_id, synced_at, direction, transport, bytes_transferred, status });
      return { changes: 1 };
    }

    if (s.startsWith('INSERT OR REPLACE INTO reports') || s.startsWith('INSERT INTO reports')) {
      const [report_id] = params;
      this.tables.reports = this.tables.reports.filter((r) => r.report_id !== report_id);
      this.tables.reports.push({ report_id, created_at: Date.now(), status: 'recibido' });
      return { changes: 1 };
    }

    if (s.startsWith('UPDATE reports SET status = ?')) {
      const [status, report_id] = params;
      for (const r of this.tables.reports) {
        if (r.report_id === report_id) r.status = status;
      }
      return { changes: 1 };
    }

    return { changes: 0 };
  }

  getAllSync<T>(sql: string, params: any[] = []): T[] {
    const s = sql.trim();
    if (s.includes('FROM rescue_nodes')) {
      return [...this.tables.rescue_nodes] as unknown as T[];
    }
    if (s.includes('FROM assignments WHERE report_id = ?')) {
      const [reportId] = params;
      return this.tables.assignments.filter((a) => a.report_id === reportId) as unknown as T[];
    }
    if (s.includes("FROM assignments WHERE status = 'conflicto'")) {
      return this.tables.assignments.filter((a) => a.status === 'conflicto') as unknown as T[];
    }
    if (s.includes('FROM assignments')) {
      return [...this.tables.assignments] as unknown as T[];
    }
    if (s.includes('FROM sync_log GROUP BY direction, status')) {
      const map: Record<string, number> = {};
      for (const row of this.tables.sync_log) {
        const key = `${row.direction}__${row.status}`;
        map[key] = (map[key] || 0) + 1;
      }
      return Object.entries(map).map(([k, count]) => {
        const [direction, status] = k.split('__');
        return { direction, status, count } as unknown as T;
      });
    }
    if (s.includes('FROM sync_log')) {
      return [...this.tables.sync_log] as unknown as T[];
    }
    return [] as T[];
  }

  getFirstSync<T>(sql: string, params: any[] = []): T | null {
    const s = sql.trim();
    if (s.includes('FROM rescue_nodes WHERE id = ?')) {
      const [id] = params;
      const found = this.tables.rescue_nodes.find((n) => n.id === id);
      return (found as unknown as T) || null;
    }
    if (s.includes('FROM reports WHERE report_id = ?')) {
      const [id] = params;
      const found = this.tables.reports.find((r) => r.report_id === id);
      return (found as unknown as T) || null;
    }
    return null;
  }
}

describe('Persona C - Capa de Transporte P2P y Protocolo de Mensajes', () => {
  it('debe crear y validar un paquete P2P estructurado (Handshake / Report Bundle)', () => {
    const sender = { id: 'nodo-panama-01', callsign: 'Rescatista Alfa' };
    const payload = { test: true, data: [1, 2, 3] };

    const packet = createPacket('REPORT_BUNDLE', sender, payload, 'nodo-chiriqui-02');

    expect(packet.packetId).toBeDefined();
    expect(packet.type).toBe('REPORT_BUNDLE');
    expect(packet.senderNodeId).toBe('nodo-panama-01');
    expect(packet.senderCallsign).toBe('Rescatista Alfa');
    expect(packet.targetNodeId).toBe('nodo-chiriqui-02');
    expect(packet.version).toBe(1);
    expect(packet.timestamp).toBeGreaterThan(0);

    // Validar serialización JSON y re-validación
    const rawJson = JSON.stringify(packet);
    const parsed = validatePacket(rawJson);
    expect(parsed.packetId).toBe(packet.packetId);
    expect(parsed.type).toBe('REPORT_BUNDLE');
  });

  it('debe rechazar paquetes malformados o con tipos desconocidos', () => {
    expect(() => validatePacket(null)).toThrow('Paquete vacío');
    expect(() => validatePacket({ packetId: '123', type: 'INVALID_TYPE' })).toThrow(
      'Tipo de mensaje desconocido'
    );
  });

  it('debe calcular fragmentación / chunks para el canal Bluetooth', () => {
    const sender = { id: 'nodo-01', callsign: 'Alfa' };
    const packet = createPacket('REPORT_BUNDLE', sender, { lorem: 'a'.repeat(2000) });

    const formatted = formatBluetoothPayload(packet);
    expect(formatted.byteLength).toBeGreaterThan(2000);
    expect(formatted.chunksCount).toBeGreaterThanOrEqual(4);
  });
});

describe('Persona C - Gestión de Nodos y Bitácora de Sincronización', () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = new MockSQLiteDatabase();
  });

  it('debe registrar y recuperar nodos en rescue_nodes', () => {
    const node: RescueNode = {
      id: 'node-david-01',
      deviceId: 'node-david-01',
      callsign: 'Brigada David Centro',
      role: 'rescatista',
      lastSeen: Date.now(),
    };

    upsertRescueNode(mockDb, node);

    const nodes = getRescueNodes(mockDb);
    expect(nodes.length).toBe(1);
    expect(nodes[0].callsign).toBe('Brigada David Centro');

    const singleNode = getNodeById(mockDb, 'node-david-01');
    expect(singleNode).toBeDefined();
    expect(singleNode?.deviceId).toBe('node-david-01');
  });

  it('debe registrar auditoría en sync_log y calcular estadísticas', () => {
    recordSyncLog(mockDb, {
      reportId: 'rep-001',
      nodeId: 'node-david-01',
      syncedAt: Date.now(),
      direction: 'sent',
      transport: 'wifi_lan',
      bytesTransferred: 1024,
      status: 'exitoso',
    });

    recordSyncLog(mockDb, {
      reportId: 'rep-002',
      nodeId: 'node-david-02',
      syncedAt: Date.now(),
      direction: 'received',
      transport: 'bluetooth',
      bytesTransferred: 512,
      status: 'exitoso',
    });

    recordSyncLog(mockDb, {
      reportId: 'rep-001',
      nodeId: 'node-david-02',
      syncedAt: Date.now(),
      direction: 'received',
      transport: 'bluetooth',
      bytesTransferred: 0,
      status: 'duplicado',
    });

    const logs = getRecentSyncLogs(mockDb, 10);
    expect(logs.length).toBe(3);

    const stats = getSyncStats(mockDb);
    expect(stats.totalSent).toBe(1);
    expect(stats.totalReceived).toBe(1);
    expect(stats.totalDuplicates).toBe(1);
  });
});

describe('Persona C - Asignación de Casos y Resolución de Conflictos', () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = new MockSQLiteDatabase();
  });

  it('debe permitir a un rescatista tomar un caso (claimReport)', () => {
    const assignment = claimReport(mockDb, 'rep-volcan-101', 'nodo-brigada-alpha', 'En camino');
    expect(assignment.reportId).toBe('rep-volcan-101');
    expect(assignment.nodeId).toBe('nodo-brigada-alpha');
    expect(assignment.status).toBe('en_camino');

    const list = getAssignmentsForReport(mockDb, 'rep-volcan-101');
    expect(list.length).toBe(1);
  });

  it('debe detectar conflicto cuando dos brigadas distintas toman el mismo caso', () => {
    // 1. Brigada Alfa toma el caso
    claimReport(mockDb, 'rep-volcan-101', 'nodo-alfa');

    // 2. Brigada Beta remota también reclama el mismo caso vía P2P
    const remoteAssignment: AssignmentRecord = {
      id: 'assign-beta-999',
      reportId: 'rep-volcan-101',
      nodeId: 'nodo-beta',
      assignedAt: Date.now() + 100,
      status: 'en_camino',
      notes: 'Brigada Beta respondiendo',
    };

    const conflictResult = recordRemoteAssignment(mockDb, remoteAssignment);
    expect(conflictResult.isConflict).toBe(true);
    expect(conflictResult.conflictingAssignments.length).toBe(2);

    const conflicts = getConflictingAssignments(mockDb);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  });

  it('debe resolver el conflicto asignando la victoria a una brigada designada', () => {
    claimReport(mockDb, 'rep-volcan-101', 'nodo-alfa');
    recordRemoteAssignment(mockDb, {
      id: 'assign-beta-999',
      reportId: 'rep-volcan-101',
      nodeId: 'nodo-beta',
      assignedAt: Date.now() + 100,
      status: 'en_camino',
    });

    // Resolver en favor de Brigada Alfa
    resolveAssignmentConflict(mockDb, 'rep-volcan-101', 'nodo-alfa');

    const assignments = getAssignmentsForReport(mockDb, 'rep-volcan-101');
    const alfa = assignments.find((a) => a.nodeId === 'nodo-alfa');
    const beta = assignments.find((a) => a.nodeId === 'nodo-beta');

    expect(alfa?.status).toBe('en_camino');
    expect(beta?.status).toBe('cancelado');
  });
});
