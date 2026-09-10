import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { getProfile } from '../../src/services/profileService';
import {
  getRecentReports,
  getReceivedReports,
  getReportCounts,
  updateReportStatus,
} from '../../src/services/reportService';
import {
  claimReport,
  getConflictingAssignments,
  getAssignmentsForReport,
} from '../../src/services/assignmentService';
import type { UserProfile, ReportRecord, StartPriority } from '../../src/types/triageTypes';

const PRIORITY_COLORS: Record<StartPriority, string> = {
  ROJO: '#EF4444',
  AMARILLO: '#F59E0B',
  VERDE: '#22C55E',
  NEGRO: '#1F2937',
};

function PriorityBadge({ priority }: { priority: StartPriority }) {
  return (
    <View style={[styles.badge, { backgroundColor: PRIORITY_COLORS[priority] }]}>
      <Text style={styles.badgeText}>{priority}</Text>
    </View>
  );
}

function ReportCard({
  report,
  onPress,
  showActions,
  onAtender,
  onCompletar,
  hasConflict,
}: {
  report: ReportRecord;
  onPress: () => void;
  showActions?: boolean;
  onAtender?: () => void;
  onCompletar?: () => void;
  hasConflict?: boolean;
}) {
  const fecha = new Date(report.createdAt).toLocaleString('es-PA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <PriorityBadge priority={report.triagePriority} />
        <Text style={styles.cardDate}>{fecha}</Text>
      </View>
      <Text style={styles.cardSummary} numberOfLines={2}>
        {report.extractedSummary}
      </Text>
      {report.locationReference && (
        <Text style={styles.cardLocation}>📍 {report.locationReference}</Text>
      )}

      {hasConflict && (
        <View style={styles.conflictBanner}>
          <Ionicons name="warning" size={14} color="#EF4444" />
          <Text style={styles.conflictText}>⚠️ Conflicto: Otra brigada también tomó este caso</Text>
        </View>
      )}

      <View style={styles.cardFooter}>
        {report.reportedPeopleCount && (
          <Text style={styles.cardMeta}>👥 {report.reportedPeopleCount} personas</Text>
        )}
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{report.status.toUpperCase()}</Text>
        </View>
      </View>
      {showActions && report.status !== 'completado' && (
        <View style={styles.actionRow}>
          {report.status !== 'en_atencion' && (
            <TouchableOpacity style={styles.actionBtn} onPress={onAtender}>
              <Ionicons name="hand-left" size={16} color="#F8FAFC" />
              <Text style={styles.actionText}>Tomar Caso</Text>
            </TouchableOpacity>
          )}
          {report.status === 'en_atencion' && (
            <TouchableOpacity style={[styles.actionBtn, styles.actionComplete]} onPress={onCompletar}>
              <Ionicons name="checkmark-circle" size={16} color="#F8FAFC" />
              <Text style={styles.actionText}>Completado</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [recentReports, setRecentReports] = useState<ReportRecord[]>([]);
  const [receivedReports, setReceivedReports] = useState<ReportRecord[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const p = getProfile(db);
      setProfile(p);
      setRecentReports(getRecentReports(db, 5));
      setReceivedReports(getReceivedReports(db));
      setCounts(getReportCounts(db));

      const conflictList = getConflictingAssignments(db);
      setConflicts(new Set(conflictList.map((c) => c.reportId)));
    } catch (err) {
      console.error('[Home] Error cargando datos:', err);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleAtender = (reportId: string) => {
    const nodeId = profile?.phone || 'nodo-local';
    claimReport(db, reportId, nodeId, `Asignado a ${profile?.fullName || 'Brigada'}`);
    Alert.alert('Caso Asignado', 'Has tomado este caso. Estado actualizado a EN ATENCIÓN.');
    loadData();
  };

  const handleCompletar = (reportId: string) => {
    updateReportStatus(db, reportId, 'completado');
    Alert.alert('Caso Finalizado', 'El caso ha sido marcado como COMPLETADO.');
    loadData();
  };

  const isRescatista = profile?.role === 'rescatista';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appTitle}>Perseus.ai</Text>
          <Text style={styles.userName}>
            {isRescatista ? '🚑' : '🏠'} {profile?.fullName || 'Usuario'}
          </Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              {isRescatista ? 'RESCATISTA / BRIGADA' : 'CIUDADANO'}
            </Text>
          </View>
        </View>

        {isRescatista ? (
          /* ==================== VISTA RESCATISTA ==================== */
          <>
            {/* Estadísticas */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { borderColor: '#EF4444' }]}>
                <Text style={styles.statNumber}>{counts['recibido'] || 0}</Text>
                <Text style={styles.statLabel}>Pendientes</Text>
              </View>
              <View style={[styles.statCard, { borderColor: '#F59E0B' }]}>
                <Text style={styles.statNumber}>{counts['en_atencion'] || 0}</Text>
                <Text style={styles.statLabel}>En Atención</Text>
              </View>
              <View style={[styles.statCard, { borderColor: '#22C55E' }]}>
                <Text style={styles.statNumber}>{counts['completado'] || 0}</Text>
                <Text style={styles.statLabel}>Completados</Text>
              </View>
            </View>

            {/* Cola de atención */}
            <Text style={styles.sectionTitle}>📋 Cola de Atención</Text>
            {receivedReports.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="radio-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyText}>No hay reportes recibidos</Text>
                <Text style={styles.emptySubtext}>
                  Ve a la pestaña P2P para recibir reportes de ciudadanos en la red local
                </Text>
              </View>
            ) : (
              receivedReports.map((r) => (
                <ReportCard
                  key={r.reportId}
                  report={r}
                  hasConflict={conflicts.has(r.reportId)}
                  onPress={() => router.push(`/report/${r.reportId}`)}
                  showActions
                  onAtender={() => handleAtender(r.reportId)}
                  onCompletar={() => handleCompletar(r.reportId)}
                />
              ))
            )}
          </>
        ) : (
          /* ==================== VISTA CIUDADANO ==================== */
          <>
            {/* CTA Principal */}
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => router.push('/(tabs)/reportar')}
              activeOpacity={0.8}
            >
              <Ionicons name="warning" size={32} color="#F8FAFC" />
              <Text style={styles.ctaText}>🆘 Reportar Emergencia</Text>
              <Text style={styles.ctaSubtext}>Texto, audio o foto — procesamiento local con IA</Text>
            </TouchableOpacity>

            {/* Últimos reportes */}
            <Text style={styles.sectionTitle}>📄 Mis Últimos Reportes</Text>
            {recentReports.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="document-text-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyText}>Sin reportes aún</Text>
                <Text style={styles.emptySubtext}>
                  Crea tu primer reporte de emergencia usando el botón de arriba
                </Text>
              </View>
            ) : (
              recentReports.map((r) => (
                <ReportCard
                  key={r.reportId}
                  report={r}
                  onPress={() => router.push(`/report/${r.reportId}`)}
                />
              ))
            )}

            {/* Acceso a Laboratorio de Audio Whisper */}
            <TouchableOpacity
              style={styles.labCard}
              onPress={() => router.push('/whisper-test')}
              activeOpacity={0.8}
            >
              <Ionicons name="mic-circle" size={28} color="#38BDF8" />
              <View style={{ flex: 1 }}>
                <Text style={styles.labTitle}>Laboratorio Whisper ASR</Text>
                <Text style={styles.labSubtitle}>Probar captura, carga y transcripción aislada</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>

            {/* Info */}
            <View style={styles.infoCard}>
              <Ionicons name="shield-checkmark" size={24} color="#22C55E" />
              <Text style={styles.infoText}>
                Perseus.ai funciona 100% sin internet. Tu información se procesa y almacena localmente en tu dispositivo.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  header: { alignItems: 'center', marginBottom: 24, marginTop: 8 },
  appTitle: { fontSize: 28, fontWeight: '800', color: '#3B82F6', letterSpacing: 1 },
  userName: { fontSize: 18, color: '#F8FAFC', marginTop: 4 },
  roleBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  roleText: { color: '#94A3B8', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  statCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
    alignItems: 'center',
    borderLeftWidth: 3,
  },
  statNumber: { fontSize: 24, fontWeight: '800', color: '#F8FAFC' },
  statLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#F8FAFC', marginBottom: 12 },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardDate: { fontSize: 12, color: '#94A3B8' },
  cardSummary: { fontSize: 14, color: '#F8FAFC', lineHeight: 20, marginBottom: 6 },
  cardLocation: { fontSize: 12, color: '#94A3B8', marginBottom: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardMeta: { fontSize: 12, color: '#94A3B8' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  badgeText: { color: '#F8FAFC', fontSize: 11, fontWeight: '800' },
  statusBadge: { backgroundColor: '#334155', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusText: { color: '#94A3B8', fontSize: 10, fontWeight: '600' },
  conflictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#451A1A',
    padding: 8,
    borderRadius: 6,
    marginVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  conflictText: { color: '#FCA5A5', fontSize: 11, fontWeight: '600' },
  actionRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  actionComplete: { backgroundColor: '#22C55E' },
  actionText: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  ctaButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  ctaText: { fontSize: 20, fontWeight: '800', color: '#F8FAFC', marginTop: 8 },
  ctaSubtext: { fontSize: 13, color: '#BFDBFE', marginTop: 4 },
  emptyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: { fontSize: 16, color: '#94A3B8', marginTop: 12 },
  emptySubtext: { fontSize: 13, color: '#64748B', marginTop: 4, textAlign: 'center' },
  infoCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  infoText: { fontSize: 13, color: '#94A3B8', flex: 1, lineHeight: 18 },
  labCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#0284C7',
  },
  labTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  labSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
});
