/**
 * Servicio de perfil de usuario — Perseus.ai
 * CRUD para datos personales almacenados exclusivamente en SQLite local.
 * Los datos solo se comparten via P2P cuando el usuario envía un reporte.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { UserProfile, AppRole, Sex, BloodType } from '../types/triageTypes';

interface ProfileRow {
  id: number;
  full_name: string;
  age: number;
  sex: string;
  phone: string;
  address: string | null;
  province: string;
  blood_type: string | null;
  has_disability: number;
  disability_description: string | null;
  medical_conditions: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  role: string;
  created_at: number;
  updated_at: number;
}

function rowToProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    fullName: row.full_name || '',
    age: row.age || 0,
    sex: (row.sex as Sex) || 'Otro',
    phone: row.phone || '',
    address: row.address || undefined,
    province: row.province || '',
    bloodType: (row.blood_type as BloodType) || undefined,
    hasDisability: row.has_disability === 1,
    disabilityDescription: row.disability_description || undefined,
    medicalConditions: row.medical_conditions || undefined,
    emergencyContactName: row.emergency_contact_name || undefined,
    emergencyContactPhone: row.emergency_contact_phone || undefined,
    role: (row.role as AppRole) || 'ciudadano',
    createdAt: row.created_at || Date.now(),
    updatedAt: row.updated_at || Date.now(),
  };
}

/**
 * Verifica si existe un perfil guardado
 */
export function hasProfile(db: SQLiteDatabase): boolean {
  try {
    const row = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM user_profile');
    return (row?.count ?? 0) > 0;
  } catch (err) {
    console.warn('[ProfileService] Error al verificar perfil:', err);
    return false;
  }
}

/**
 * Obtiene el perfil del usuario (solo hay 1 fila)
 */
export function getProfile(db: SQLiteDatabase): UserProfile | null {
  try {
    const row = db.getFirstSync<ProfileRow>('SELECT * FROM user_profile WHERE id = 1');
    if (!row) return null;
    return rowToProfile(row);
  } catch (err) {
    console.warn('[ProfileService] Error al obtener perfil:', err);
    return null;
  }
}

/**
 * Guarda un perfil nuevo (primera vez en onboarding o actualización)
 * NOTA: Expo SQLite / Kotlin no admite nulls en bindParams. Se sanitizan a strings vacíos/0.
 */
export function saveProfile(db: SQLiteDatabase, profile: UserProfile): void {
  const now = Date.now();
  db.runSync(
    `INSERT OR REPLACE INTO user_profile (
      id, full_name, age, sex, phone, address, province, blood_type,
      has_disability, disability_description, medical_conditions,
      emergency_contact_name, emergency_contact_phone, role,
      created_at, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profile.fullName || '',
      profile.age || 0,
      profile.sex || 'Otro',
      profile.phone || '',
      profile.address || '',
      profile.province || '',
      profile.bloodType || '',
      profile.hasDisability ? 1 : 0,
      profile.disabilityDescription || '',
      profile.medicalConditions || '',
      profile.emergencyContactName || '',
      profile.emergencyContactPhone || '',
      profile.role || 'ciudadano',
      profile.createdAt || now,
      now,
    ]
  );
  console.log('[ProfileService] Perfil guardado correctamente en SQLite.');
}

/**
 * Actualiza campos específicos del perfil
 */
export function updateProfile(db: SQLiteDatabase, updates: Partial<UserProfile>): void {
  const current = getProfile(db);
  if (!current) {
    console.warn('[ProfileService] No hay perfil para actualizar.');
    return;
  }

  const merged: UserProfile = { ...current, ...updates, updatedAt: Date.now() };
  saveProfile(db, merged);
  console.log('[ProfileService] Perfil actualizado.');
}

/**
 * Obtiene el rol actual del usuario
 */
export function getUserRole(db: SQLiteDatabase): AppRole | null {
  try {
    const row = db.getFirstSync<{ role: string }>('SELECT role FROM user_profile WHERE id = 1');
    return (row?.role as AppRole) || null;
  } catch (err) {
    console.warn('[ProfileService] Error al obtener rol:', err);
    return null;
  }
}
