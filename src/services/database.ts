/**
 * Inicialización y gestión de base de datos SQLite local para Perseus.ai
 * Usa expo-sqlite (SDK 54) con SQLiteProvider + useSQLiteContext
 * 
 * Contiene el esquema completo de 4 tablas oficiales para la Hackathon:
 * 1. user_profile
 * 2. reports (triage_reports)
 * 3. rescue_nodes (nodos y brigadistas descubiertos)
 * 4. assignments (toma de casos y resolución de conflictos)
 * 5. sync_log (evidencia auditable de transferencias P2P y relays)
 */

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'perseus.db';

/**
 * Abre la base de datos sincrónicamente (para uso fuera de React context)
 */
export function openDatabase(): SQLite.SQLiteDatabase {
  return SQLite.openDatabaseSync(DB_NAME);
}

/**
 * Nombre de la base de datos para usar con <SQLiteProvider>
 */
export const DATABASE_NAME = DB_NAME;

/**
 * Inicializa las tablas de la base de datos.
 * Llamar dentro de SQLiteProvider onInit o al primer acceso.
 */
export async function initializeDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  console.log('[Database] Inicializando tablas de Perseus.ai...');

  // 1. Perfil de Usuario Local
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      full_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      sex TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT,
      province TEXT NOT NULL,
      blood_type TEXT,
      has_disability INTEGER DEFAULT 0,
      disability_description TEXT,
      medical_conditions TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      role TEXT NOT NULL DEFAULT 'ciudadano',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // 2. Reportes de Triaje (triage_reports)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS reports (
      report_id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'local',
      status TEXT NOT NULL DEFAULT 'borrador',
      transcript TEXT,
      vision_severity TEXT,
      extracted_summary TEXT NOT NULL,
      triage_priority TEXT NOT NULL,
      needs TEXT,
      reported_people_count INTEGER,
      location_reference TEXT,
      missing_fields TEXT,
      raw_model_output TEXT,
      is_local_inference INTEGER DEFAULT 1,
      execution_time_ms INTEGER,
      province TEXT,
      district TEXT,
      corregimiento TEXT,
      reporter_profile TEXT,
      sync_event_id TEXT,
      sent_at INTEGER,
      received_at INTEGER,
      ack_received INTEGER DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);

  // 3. Nodos Rescatistas (rescue_nodes)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS rescue_nodes (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      callsign TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'rescatista',
      last_lat REAL,
      last_lon REAL,
      last_seen INTEGER NOT NULL
    );
  `);

  // 4. Asignaciones de Casos (assignments)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      assigned_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'propuesta',
      notes TEXT,
      FOREIGN KEY (report_id) REFERENCES reports(report_id)
    );
  `);

  // 5. Bitácora de Sincronización P2P (sync_log - Evidencia para jurado)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      node_id TEXT,
      synced_at INTEGER NOT NULL,
      direction TEXT NOT NULL DEFAULT 'sent',
      transport TEXT NOT NULL DEFAULT 'wifi_lan',
      bytes_transferred INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'exitoso',
      FOREIGN KEY (report_id) REFERENCES reports(report_id)
    );
  `);

  // 6. Registro de eventos de sincronización (retrocompatibilidad)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_events (
      event_id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      peer_ip TEXT,
      timestamp INTEGER NOT NULL,
      ack_received INTEGER DEFAULT 0,
      FOREIGN KEY (report_id) REFERENCES reports(report_id)
    );
  `);

  console.log('[Database] Tablas P2P y Triaje inicializadas correctamente.');
}
