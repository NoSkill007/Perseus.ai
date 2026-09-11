import React, { useCallback, useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import {
  getReports,
  getReportsByStatus,
  getReportsByPriority,
  searchReports,
} from '../../src/services/reportService';
import { getProfile } from '../../src/services/profileService';
import { useTheme } from '../../src/context/ThemeContext';
import { PRIORITY_COLORS, type ThemeColors } from '../../src/constants/theme';
import type { ReportRecord, StartPriority, ReportStatus, ReportSource, UserProfile } from '../../src/types/triageTypes';

const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  confirmado: 'Confirmado',
  enviado: 'Enviado',
  recibido: 'Recibido',
  en_atencion: 'En Atención',
  completado: 'Completado',
};

type FilterType = 'all' | StartPriority | ReportStatus;

export default function HistorialScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const isRescatista = profile?.role === 'rescatista';

  const loadReports = useCallback(() => {
    try {
      const p = getProfile(db);
      setProfile(p);
      const targetSource: ReportSource = p?.role === 'rescatista' ? 'received' : 'local';

      if (searchQuery.trim()) {
        setReports(searchReports(db, searchQuery.trim(), targetSource));
      } else if (activeFilter === 'all') {
        setReports(getReports(db, targetSource));
      } else if (['ROJO', 'AMARILLO', 'VERDE', 'NEGRO'].includes(activeFilter)) {
        setReports(getReportsByPriority(db, activeFilter as StartPriority, targetSource));
      } else {
        setReports(getReportsByStatus(db, activeFilter as ReportStatus, targetSource));
      }
    } catch (err) {
      console.error('[Historial] Error cargando reportes:', err);
    }
  }, [db, searchQuery, activeFilter]);

  useFocusEffect(
    useCallback(() => {
      loadReports();
    }, [loadReports])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadReports();
    setRefreshing(false);
  }, [loadReports]);

  const filters: { label: string; value: FilterType }[] = [
    { label: 'Todos', value: 'all' },
    { label: '🔴', value: 'ROJO' },
    { label: '🟡', value: 'AMARILLO' },
    { label: '🟢', value: 'VERDE' },
    { label: '⚫', value: 'NEGRO' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerContainer}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <Text style={styles.title}>Historial de Reportes</Text>
        </View>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>
          {isRescatista
            ? 'Casos y fichas de emergencia recibidas por P2P'
            : 'Reportes de emergencia creados en este dispositivo'}
        </Text>

        {/* Búsqueda */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={theme.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar en resúmenes..."
            placeholderTextColor={theme.textPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={loadReports}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); }}>
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filtros */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {filters.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[
                styles.filterChip,
                activeFilter === f.value && styles.filterChipActive,
              ]}
              onPress={() => setActiveFilter(f.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === f.value && styles.filterChipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {reports.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="document-text-outline" size={48} color={theme.textMuted} />
            <Text style={styles.emptyText}>Sin reportes</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery
                ? 'No se encontraron resultados'
                : isRescatista
                ? 'No hay reportes recibidos todavía. Conecta vía P2P para capturar balizas o recibir emergencias.'
                : 'Tus reportes de emergencia aparecerán aquí'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.resultCount}>{reports.length} reporte{reports.length !== 1 ? 's' : ''}</Text>
            {reports.map((report) => {
              const fecha = new Date(report.createdAt).toLocaleString('es-PA', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <TouchableOpacity
                  key={report.reportId}
                  style={styles.card}
                  onPress={() => router.push(`/report/${report.reportId}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[report.triagePriority] }]}>
                      <Text style={styles.priorityText}>{report.triagePriority}</Text>
                    </View>
                    <View style={styles.cardMeta}>
                      <Text style={styles.cardDate}>{fecha}</Text>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusText}>
                          {STATUS_LABELS[report.status] || report.status}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.cardSummary} numberOfLines={2}>
                    {report.extractedSummary}
                  </Text>
                  <View style={styles.cardFooter}>
                    {report.locationReference && (
                      <Text style={styles.cardLocation}>📍 {report.locationReference}</Text>
                    )}
                    {report.reportedPeopleCount != null && (
                      <Text style={styles.cardPeople}>👥 {report.reportedPeopleCount}</Text>
                    )}
                    {report.source === 'received' && (
                      <Text style={styles.cardReceived}>📡 Recibido</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    headerContainer: { paddingHorizontal: 16, paddingTop: 16 },
    title: { fontSize: 22, fontWeight: '800', color: theme.text, marginBottom: 12 },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    searchInput: { flex: 1, color: theme.text, fontSize: 14, marginLeft: 8 },
    filterScroll: { marginBottom: 8 },
    filterChip: {
      backgroundColor: theme.card,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 16,
      marginRight: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    filterChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    filterChipText: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    filterChipTextActive: { color: '#FFFFFF' },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingTop: 8 },
    resultCount: { fontSize: 12, color: theme.textMuted, marginBottom: 8 },
    card: {
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    priorityBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
    priorityText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
    cardMeta: { alignItems: 'flex-end' },
    cardDate: { fontSize: 11, color: theme.textMuted },
    statusBadge: { backgroundColor: theme.cardInner, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2, borderWidth: 1, borderColor: theme.border },
    statusText: { color: theme.textMuted, fontSize: 9, fontWeight: '600' },
    cardSummary: { fontSize: 14, color: theme.text, lineHeight: 20, marginBottom: 8 },
    cardFooter: { flexDirection: 'row', gap: 12 },
    cardLocation: { fontSize: 11, color: theme.textMuted },
    cardPeople: { fontSize: 11, color: theme.textMuted },
    cardReceived: { fontSize: 11, color: theme.primary },
    emptyCard: {
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 40,
      alignItems: 'center',
      marginTop: 20,
      borderWidth: 1,
      borderColor: theme.border,
    },
    emptyText: { fontSize: 16, color: theme.textMuted, marginTop: 12 },
    emptySubtext: { fontSize: 13, color: theme.textPlaceholder, marginTop: 4, textAlign: 'center' },
  });
}
