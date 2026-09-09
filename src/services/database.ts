/**
 * Inicialización y gestión de base de datos SQLite local para Perseus.ai
 * Usa expo-sqlite (SDK 54) con SQLiteProvider + useSQLiteContext
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

  console.log('[Database] Tablas inicializadas correctamente.');
}
