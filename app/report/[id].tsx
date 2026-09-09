import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { getReportById } from '../../src/services/reportService';
import type { ReportRecord, StartPriority } from '../../src/types/triageTypes';

const PRIORITY_COLORS: Record<StartPriority, string> = {
  ROJO: '#EF4444',
  AMARILLO: '#F59E0B',
  VERDE: '#22C55E',
  NEGRO: '#1F2937',
};

const NEED_LABELS: Record<string, string> = {
  AGUA_SANEAMIENTO: 'Agua/Saneamiento',
  ALIMENTACION: 'Alimentación',
  SALUD: 'Salud',
  ALBERGUE: 'Albergue',
  PROTECCION: 'Protección',
  ACCESO_RESCATE: 'Acceso/Rescate',
  OTRA: 'Otra',
  DESCONOCIDA: 'Desconocida',
};

const STATUS_STEPS = [
  { key: 'borrador', label: 'Creado', icon: 'create' as const },
  { key: 'confirmado', label: 'Confirmado', icon: 'checkmark-circle' as const },
  { key: 'enviado', label: 'Enviado', icon: 'paper-plane' as const },
  { key: 'recibido', label: 'Recibido', icon: 'download' as const },
  { key: 'en_atencion', label: 'En Atención', icon: 'hand-left' as const },
  { key: 'completado', label: 'Completado', icon: 'checkmark-done-circle' as const },
];

export default function ReportDetailScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [report, setReport] = useState<ReportRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAudit, setShowAudit] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (id) {
        const r = getReportById(db, id);
        setReport(r);
      }
      setLoading(false);
    }, [db, id])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  if (!report) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#EF4444" />
          <Text style={styles.errorText}>Reporte no encontrado</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const fecha = new Date(report.createdAt).toLocaleString('es-PA', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const statusIndex = STATUS_STEPS.findIndex((s) => s.key === report.status);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Priority header */}
        <View style={[styles.priorityHeader, { backgroundColor: PRIORITY_COLORS[report.triagePriority] }]}>
          <Text style={styles.priorityLabel}>Prioridad START</Text>
          <Text style={styles.priorityValue}>{report.triagePriority}</Text>
        </View>

        {/* Timeline */}
        <View style={styles.timelineContainer}>
          {STATUS_STEPS.map((step, i) => {
            const isActive = i <= statusIndex;
            const isCurrent = i === statusIndex;
            return (
              <View key={step.key} style={styles.timelineStep}>
                <View style={[styles.timelineDot, isActive && styles.timelineDotActive, isCurrent && styles.timelineDotCurrent]}>
                  <Ionicons name={step.icon} size={14} color={isActive ? '#F8FAFC' : '#64748B'} />
                </View>
                {i < STATUS_STEPS.length - 1 && (
                  <View style={[styles.timelineLine, isActive && styles.timelineLineActive]} />
                )}
                <Text style={[styles.timelineLabel, isActive && styles.timelineLabelActive]}>
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Resumen */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📝 Resumen</Text>
          <Text style={styles.cardContent}>{report.extractedSummary}</Text>
        </View>

        {/* Datos principales */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Datos del Reporte</Text>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>Fecha</Text>
            <Text style={styles.dataValue}>{fecha}</Text>
          </View>

          {report.locationReference && (
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Ubicación</Text>
              <Text style={styles.dataValue}>📍 {report.locationReference}</Text>
            </View>
          )}

          {(report.province || report.district || report.corregimiento) && (
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Zona</Text>
              <Text style={styles.dataValue}>
                {[report.province, report.district, report.corregimiento].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}

          {report.reportedPeopleCount != null && (
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Personas</Text>
              <Text style={styles.dataValue}>👥 {report.reportedPeopleCount}</Text>
            </View>
          )}

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>Origen</Text>
            <Text style={styles.dataValue}>{report.source === 'local' ? '📱 Local' : '📡 Recibido P2P'}</Text>
          </View>
        </View>

        {/* Necesidades */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏥 Necesidades Identificadas</Text>
          <View style={styles.needsContainer}>
            {report.needs.map((need) => (
              <View key={need} style={styles.needChip}>
                <Text style={styles.needText}>{NEED_LABELS[need] || need}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Campos faltantes */}
        {report.missingFields.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>⚠️ Campos Faltantes</Text>
            {report.missingFields.map((field, i) => (
              <View key={i} style={styles.missingItem}>
                <Ionicons name="alert-circle-outline" size={16} color="#F59E0B" />
                <Text style={styles.missingText}>{field}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Perfil del reportante (solo para reportes recibidos) */}
        {report.reporterProfile && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>👤 Datos del Reportante</Text>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Nombre</Text>
              <Text style={styles.dataValue}>{report.reporterProfile.fullName}</Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Edad</Text>
              <Text style={styles.dataValue}>{report.reporterProfile.age} años</Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Sexo</Text>
              <Text style={styles.dataValue}>{report.reporterProfile.sex}</Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Teléfono</Text>
              <Text style={styles.dataValue}>{report.reporterProfile.phone}</Text>
            </View>
            {report.reporterProfile.bloodType && (
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Sangre</Text>
                <Text style={styles.dataValue}>🩸 {report.reporterProfile.bloodType}</Text>
              </View>
            )}
            {report.reporterProfile.hasDisability && (
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Discapacidad</Text>
                <Text style={styles.dataValue}>{report.reporterProfile.disabilityDescription || 'Sí'}</Text>
              </View>
            )}
            {report.reporterProfile.medicalConditions && (
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Condiciones</Text>
                <Text style={styles.dataValue}>{report.reporterProfile.medicalConditions}</Text>
              </View>
            )}
            {report.reporterProfile.emergencyContactName && (
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Contacto</Text>
                <Text style={styles.dataValue}>
                  {report.reporterProfile.emergencyContactName} ({report.reporterProfile.emergencyContactPhone})
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Auditoría IA */}
        <TouchableOpacity
          style={styles.auditToggle}
          onPress={() => setShowAudit(!showAudit)}
        >
          <Text style={styles.auditToggleText}>🔍 Auditoría IA</Text>
          <Ionicons name={showAudit ? 'chevron-up' : 'chevron-down'} size={20} color="#94A3B8" />
        </TouchableOpacity>

        {showAudit && (
          <View style={styles.card}>
            {report.transcript && (
              <>
                <Text style={styles.auditLabel}>Transcripción (Whisper)</Text>
                <Text style={styles.auditContent}>{report.transcript}</Text>
              </>
            )}
            {report.visionSeverity && (
              <>
                <Text style={styles.auditLabel}>Análisis Visual</Text>
                <Text style={styles.auditContent}>{report.visionSeverity}</Text>
              </>
            )}
            <Text style={styles.auditLabel}>Tiempo de ejecución</Text>
            <Text style={styles.auditContent}>{report.executionTimeMs}ms</Text>

            {report.rawModelOutput && (
              <>
                <Text style={styles.auditLabel}>Salida cruda del modelo</Text>
                <Text style={styles.auditRaw}>{report.rawModelOutput}</Text>
              </>
            )}

            <View style={styles.localBadge}>
              <Ionicons name="shield-checkmark" size={16} color="#22C55E" />
              <Text style={styles.localBadgeText}>
                {report.isLocalInference ? 'Inferencia 100% Local — QVAC' : 'Modo fallback'}
              </Text>
            </View>
          </View>
        )}

        {/* Acciones */}
        {report.source === 'local' && (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push('/(tabs)/sincronizar' as any)}
          >
            <Ionicons name="sync" size={20} color="#F8FAFC" />
            <Text style={styles.editButtonText}>Transmitir por P2P a Rescatistas</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 18, color: '#EF4444', marginTop: 12 },
  backButton: { marginTop: 16, padding: 12 },
  backButtonText: { color: '#3B82F6', fontSize: 16 },
  priorityHeader: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  priorityLabel: { color: '#FFFFFFCC', fontSize: 13, fontWeight: '600' },
  priorityValue: { color: '#F8FAFC', fontSize: 28, fontWeight: '900', marginTop: 4 },
  timelineContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  timelineStep: { alignItems: 'center', flex: 1 },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  timelineDotActive: { backgroundColor: '#3B82F6' },
  timelineDotCurrent: { backgroundColor: '#22C55E' },
  timelineLine: {
    position: 'absolute',
    top: 13,
    left: '50%',
    right: '-50%',
    height: 2,
    backgroundColor: '#334155',
  },
  timelineLineActive: { backgroundColor: '#3B82F6' },
  timelineLabel: { fontSize: 8, color: '#64748B', marginTop: 4, textAlign: 'center' },
  timelineLabelActive: { color: '#94A3B8' },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#F8FAFC', marginBottom: 10 },
  cardContent: { fontSize: 14, color: '#F8FAFC', lineHeight: 22 },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  dataLabel: { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
  dataValue: { fontSize: 13, color: '#F8FAFC', flex: 1, textAlign: 'right', marginLeft: 12 },
  needsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  needChip: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  needText: { color: '#F8FAFC', fontSize: 12, fontWeight: '600' },
  missingItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  missingText: { color: '#F59E0B', fontSize: 13 },
  auditToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  auditToggleText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  auditLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginTop: 10, marginBottom: 4 },
  auditContent: { fontSize: 13, color: '#F8FAFC', lineHeight: 20 },
  auditRaw: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: 'monospace',
    backgroundColor: '#0F172A',
    padding: 10,
    borderRadius: 8,
    lineHeight: 16,
  },
  localBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    padding: 10,
    backgroundColor: '#0F172A',
    borderRadius: 8,
  },
  localBadgeText: { color: '#22C55E', fontSize: 12, fontWeight: '600' },
  editButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  editButtonText: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
});
