import React, { useCallback, useState, useMemo } from 'react';
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
import { useTheme } from '../../src/context/ThemeContext';
import { PRIORITY_COLORS, type ThemeColors } from '../../src/constants/theme';
import type { UserProfile, ReportRecord, StartPriority } from '../../src/types/triageTypes';

function PriorityBadge({ priority }: { priority: StartPriority }) {
  return (
    <View style={[stylesPriorityBadge.badge, { backgroundColor: PRIORITY_COLORS[priority] }]}>
      <Text style={stylesPriorityBadge.badgeText}>{priority}</Text>
    </View>
  );
}

const stylesPriorityBadge = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});

function ReportCard({
  report,
  onPress,
  showActions,
  onAtender,
  onCompletar,
  hasConflict,
  styles,
}: {
  report: ReportRecord;
  onPress: () => void;
  showActions?: boolean;
  onAtender?: () => void;
  onCompletar?: () => void;
  hasConflict?: boolean;
  styles: ReturnType<typeof createStyles>;
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
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
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
              <View style={[styles.statCard, { borderColor: theme.danger }]}>
                <Text style={styles.statNumber}>{counts['recibido'] || 0}</Text>
                <Text style={styles.statLabel}>Pendientes</Text>
              </View>
              <View style={[styles.statCard, { borderColor: theme.warning }]}>
                <Text style={styles.statNumber}>{counts['en_atencion'] || 0}</Text>
                <Text style={styles.statLabel}>En Atención</Text>
              </View>
              <View style={[styles.statCard, { borderColor: theme.success }]}>
                <Text style={styles.statNumber}>{counts['completado'] || 0}</Text>
                <Text style={styles.statLabel}>Completados</Text>
              </View>
            </View>

            {/* Cola de atención */}
            <Text style={styles.sectionTitle}>📋 Cola de Atención</Text>
            {receivedReports.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="radio-outline" size={48} color={theme.textMuted} />
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
                  styles={styles}
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
              <Ionicons name="warning" size={32} color="#FFFFFF" />
              <Text style={styles.ctaText}>Reportar Emergencia</Text>
              <Text style={styles.ctaSubtext}>Texto, audio o foto — procesamiento local con IA</Text>
            </TouchableOpacity>

            {/* Últimos reportes */}
            <Text style={styles.sectionTitle}>📄 Mis Últimos Reportes</Text>
            {recentReports.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="document-text-outline" size={48} color={theme.textMuted} />
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
                  styles={styles}
                />
              ))
            )}

            {/* Acceso a Laboratorio de Audio Whisper */}
            <TouchableOpacity
              style={styles.labCard}
              onPress={() => router.push('/whisper-test')}
              activeOpacity={0.8}
            >
              <Ionicons name="mic-circle" size={28} color={theme.sky} />
              <View style={{ flex: 1 }}>
                <Text style={styles.labTitle}>Laboratorio Whisper ASR</Text>
                <Text style={styles.labSubtitle}>Probar captura, carga y transcripción aislada</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>

            {/* Acceso a Laboratorio de Visión Computacional */}
            <TouchableOpacity
              style={[styles.labCard, { borderColor: theme.purple }]}
              onPress={() => router.push('/vision-test')}
              activeOpacity={0.8}
            >
              <Ionicons name="eye" size={28} color={theme.purple} />
              <View style={{ flex: 1 }}>
                <Text style={styles.labTitle}>Laboratorio Visión (VisionPsy)</Text>
                <Text style={styles.labSubtitle}>Probar análisis visual de daños y peligros on-device</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>

            {/* Info */}
            <View style={styles.infoCard}>
              <Ionicons name="shield-checkmark" size={24} color={theme.success} />
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

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    scroll: { flex: 1 },
    scrollContent: { padding: 16 },
    header: { alignItems: 'center', marginBottom: 24, marginTop: 8 },
    appTitle: { fontSize: 28, fontWeight: '800', color: theme.primary, letterSpacing: 1 },
    userName: { fontSize: 18, color: theme.text, marginTop: 4 },
    roleBadge: {
      backgroundColor: theme.cardInner,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      marginTop: 6,
      borderWidth: 1,
      borderColor: theme.border,
    },
    roleText: { color: theme.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
    statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    statCard: {
      flex: 1,
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 12,
      marginHorizontal: 4,
      alignItems: 'center',
      borderLeftWidth: 3,
      borderWidth: 1,
      borderColor: theme.border,
    },
    statNumber: { fontSize: 24, fontWeight: '800', color: theme.text },
    statLabel: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 12 },
    card: {
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    cardDate: { fontSize: 12, color: theme.textMuted },
    cardSummary: { fontSize: 14, color: theme.text, lineHeight: 20, marginBottom: 6 },
    cardLocation: { fontSize: 12, color: theme.textMuted, marginBottom: 6 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardMeta: { fontSize: 12, color: theme.textMuted },
    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
    badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
    statusBadge: { backgroundColor: theme.cardInner, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: theme.border },
    statusText: { color: theme.textMuted, fontSize: 10, fontWeight: '600' },
    conflictBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.dangerMuted,
      padding: 8,
      borderRadius: 6,
      marginVertical: 6,
      gap: 6,
      borderWidth: 1,
      borderColor: theme.danger,
    },
    conflictText: { color: theme.danger, fontSize: 11, fontWeight: '600' },
    actionRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      gap: 6,
    },
    actionComplete: { backgroundColor: theme.success },
    actionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
    ctaButton: {
      backgroundColor: theme.primary,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      marginBottom: 24,
    },
    ctaText: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginTop: 8 },
    ctaSubtext: { fontSize: 13, color: '#DBEAFE', marginTop: 4 },
    emptyCard: {
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 32,
      alignItems: 'center',
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    emptyText: { fontSize: 16, color: theme.textMuted, marginTop: 12 },
    emptySubtext: { fontSize: 13, color: theme.textPlaceholder, marginTop: 4, textAlign: 'center' },
    infoCard: {
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    infoText: { fontSize: 13, color: theme.textMuted, flex: 1, lineHeight: 18 },
    labCard: {
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.sky,
    },
    labTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
    labSubtitle: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
  });
}
