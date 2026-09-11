/**
 * Servicio de Gestión de Nodos Rescatistas (rescue_nodes) — Perseus.ai
 * Mantiene el registro de dispositivos pares descubiertos en la red P2P/Mesh.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { RescueNode, AppRole } from '../types/triageTypes';

interface NodeRow {
  id: string;
  device_id: string;
  callsign: string;
  role: string;
  last_lat: number | null;
  last_lon: number | null;
  last_seen: number;
}

function rowToNode(row: NodeRow): RescueNode {
  return {
    id: row.id,
    deviceId: row.device_id,
    callsign: row.callsign,
    role: (row.role as AppRole) || 'rescatista',
    lastLat: row.last_lat ?? undefined,
    lastLon: row.last_lon ?? undefined,
    lastSeen: row.last_seen,
  };
}

/**
 * Registra o actualiza un nodo descubierto en la red
 */
export function upsertRescueNode(db: SQLiteDatabase, node: RescueNode): void {
  try {
    db.runSync(
      `INSERT OR REPLACE INTO rescue_nodes (
        id, device_id, callsign, role, last_lat, last_lon, last_seen
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        node.id,
        node.deviceId,
        node.callsign,
        node.role || 'rescatista',
        node.lastLat ?? 0,
        node.lastLon ?? 0,
        node.lastSeen || Date.now(),
      ]
    );
    console.log(`[NodeService] Nodo ${node.callsign} (${node.deviceId.slice(0, 8)}) registrado/actualizado.`);
  } catch (err) {
    console.warn('[NodeService] Error al guardar nodo:', err);
  }
}

/**
 * Obtiene todos los nodos conocidos ordenados por última conexión
 */
export function getRescueNodes(db: SQLiteDatabase): RescueNode[] {
  try {
    const rows = db.getAllSync<NodeRow>('SELECT * FROM rescue_nodes ORDER BY last_seen DESC');
    return rows.map(rowToNode);
  } catch (err) {
    console.warn('[NodeService] Error al obtener nodos:', err);
    return [];
  }
}

/**
 * Obtiene un nodo por su ID
 */
export function getNodeById(db: SQLiteDatabase, nodeId: string): RescueNode | null {
  try {
    const row = db.getFirstSync<NodeRow>('SELECT * FROM rescue_nodes WHERE id = ?', [nodeId]);
    return row ? rowToNode(row) : null;
  } catch (err) {
    console.warn(`[NodeService] Error al obtener nodo ${nodeId}:`, err);
    return null;
  }
}

/**
 * Obtiene o crea el nodo local de este dispositivo
 */
export function getLocalNode(db: SQLiteDatabase, deviceId: string, callsign: string, role: AppRole): RescueNode {
  const existing = getNodeById(db, deviceId);
  if (existing) {
    existing.lastSeen = Date.now();
    upsertRescueNode(db, existing);
    return existing;
  }

  const newNode: RescueNode = {
    id: deviceId,
    deviceId,
    callsign,
    role,
    lastSeen: Date.now(),
  };
  upsertRescueNode(db, newNode);
  return newNode;
}
