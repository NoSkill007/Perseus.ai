import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
  StyleProp,
  ViewStyle,
  Image,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { ThemeColors } from '../../src/constants/theme';
import {
  getReportById,
  updateReportFields,
  deleteReport,
} from '../../src/services/reportService';
import { generateAiExecutiveSummary } from '../../src/services/ai/triageExtractor';
import type {
  ReportRecord,
  StartPriority,
  DisasterNeedCategory,
} from '../../src/types/triageTypes';

interface NeedOption {
  key: DisasterNeedCategory;
  label: string;
}

const NEED_OPTIONS: NeedOption[] = [
  { key: 'AGUA_SANEAMIENTO', label: 'Agua/Saneamiento' },
  { key: 'ALIMENTACION', label: 'Alimentación' },
  { key: 'SALUD', label: 'Salud' },
  { key: 'ALBERGUE', label: 'Albergue' },
  { key: 'PROTECCION', label: 'Protección' },
  { key: 'ACCESO_RESCATE', label: 'Acceso/Rescate' },
  { key: 'OTRA', label: 'Otra' },
  { key: 'DESCONOCIDA', label: 'Desconocida' },
];

interface PriorityOption {
  key: StartPriority;
  label: string;
  sublabel: string;
}

const PRIORITY_OPTIONS: PriorityOption[] = [
  { key: 'ROJO', label: 'ROJO', sublabel: 'Inmediato / Crítico' },
  { key: 'AMARILLO', label: 'AMARILLO', sublabel: 'Urgente / Retrasado' },
  { key: 'VERDE', label: 'VERDE', sublabel: 'Leve / Ambulatorio' },
  { key: 'NEGRO', label: 'NEGRO', sublabel: 'Sin signos vitales' },
];

export default function HumanReviewScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const reportId = Array.isArray(params.id) ? params.id[0] : params.id;
  const db = useSQLiteContext();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [report, setReport] = useState<ReportRecord | null>(null);

  // Campos editables
  const [textRelato, setTextRelato] = useState<string>('');
  const [executiveSummary, setExecutiveSummary] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [priority, setPriority] = useState<StartPriority>('VERDE');
  const [needs, setNeeds] = useState<DisasterNeedCategory[]>([]);
  const [peopleCount, setPeopleCount] = useState<number>(0);
  const [location, setLocation] = useState<string>('');
  const [injuries, setInjuries] = useState<string>('');
  const [visionAnalysis, setVisionAnalysis] = useState<string>('');

  // Sección de auditoría colapsable (colapsada por defecto)
  const [isAuditExpanded, setIsAuditExpanded] = useState<boolean>(false);

  useEffect(() => {
    if (!reportId) {
      console.log('[ReviewScreen] Error: No se proporcionó ID de reporte en los parámetros.');
      setErrorMessage('Identificador de reporte no especificado.');
      setIsLoading(false);
      return;
    }

    try {
      console.log(`[ReviewScreen] Cargando reporte con ID: ${reportId}`);
      const foundReport = getReportById(db, reportId);

      if (!foundReport) {
        console.log(`[ReviewScreen] Reporte ${reportId} no encontrado en la base de datos.`);
        setErrorMessage(`No se encontró el reporte con ID "${reportId}".`);
      } else {
        setReport(foundReport);
        setTextRelato(foundReport.textRelato || foundReport.extractedSummary || '');
        setSummary(foundReport.extractedSummary || '');

        const initialExec = (foundReport.executiveSummary && foundReport.executiveSummary.trim().length > 25)
          ? foundReport.executiveSummary
          : generateAiExecutiveSummary({
              relatoText: foundReport.textRelato,
              transcriptText: foundReport.transcript,
              visionText: foundReport.visualTriageAnalysis || foundReport.visionSeverity,
              manualInjuries: foundReport.injuriesAndSymptoms,
              peopleCount: foundReport.reportedPeopleCount,
              locationReference: foundReport.locationReference,
              priority: foundReport.triagePriority,
              needs: foundReport.needs || [],
            });
        setExecutiveSummary(initialExec);

        setPriority(foundReport.triagePriority || 'VERDE');
        setNeeds(foundReport.needs || []);
        setPeopleCount(foundReport.reportedPeopleCount ?? 0);
        setLocation(foundReport.locationReference || '');
        setInjuries(foundReport.injuriesAndSymptoms || '');
        setVisionAnalysis(foundReport.visualTriageAnalysis || foundReport.visionSeverity || '');
        console.log(`[ReviewScreen] Reporte ${reportId} cargado exitosamente.`);
      }
    } catch (error) {
      console.error('[ReviewScreen] Error inesperado al cargar el reporte:', error);
      setErrorMessage('Ocurrió un error al leer la base de datos local.');
    } finally {
      setIsLoading(false);
    }
  }, [db, reportId]);

  const toggleNeed = (needKey: DisasterNeedCategory) => {
    setNeeds((prev) =>
      prev.includes(needKey) ? prev.filter((item) => item !== needKey) : [...prev, needKey]
    );
  };

  const handleDecrementPeople = () => {
    setPeopleCount((prev) => Math.max(0, prev - 1));
  };

  const handleIncrementPeople = () => {
    setPeopleCount((prev) => prev + 1);
  };

  const handleChangePeopleText = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    const parsed = parseInt(cleaned, 10);
    setPeopleCount(isNaN(parsed) ? 0 : parsed);
  };

  const handleConfirmAndSave = () => {
    if (!reportId) return;
    try {
      console.log(`[ReviewScreen] Confirmando y guardando reporte: ${reportId}`);
      updateReportFields(db, reportId, {
        extractedSummary: summary.trim(),
        executiveSummary: executiveSummary.trim(),
        textRelato: textRelato.trim(),
        triagePriority: priority,
        needs,
        reportedPeopleCount: peopleCount,
        locationReference: location.trim(),
        injuriesAndSymptoms: injuries.trim(),
        visualTriageAnalysis: visionAnalysis.trim(),
        status: 'confirmado',
      });
      router.replace('/(tabs)');
    } catch (err) {
      console.error('[ReviewScreen] Error al confirmar y guardar reporte:', err);
      Alert.alert('Error', 'No se pudieron guardar los cambios en el reporte.');
    }
  };

  const handleConfirmAndShare = () => {
    if (!reportId) return;
    try {
      console.log(`[ReviewScreen] Confirmando y preparando para compartir: ${reportId}`);
      updateReportFields(db, reportId, {
        extractedSummary: summary.trim(),
        executiveSummary: executiveSummary.trim(),
        textRelato: textRelato.trim(),
        triagePriority: priority,
        needs,
        reportedPeopleCount: peopleCount,
        locationReference: location.trim(),
        injuriesAndSymptoms: injuries.trim(),
        visualTriageAnalysis: visionAnalysis.trim(),
        status: 'confirmado',
      });
      router.push('/(tabs)/sincronizar');
    } catch (err) {
      console.error('[ReviewScreen] Error al confirmar y redirigir a sincronizar:', err);
      Alert.alert('Error', 'No se pudo guardar el reporte antes de sincronizar.');
    }
  };

  const handleDiscard = () => {
    if (!reportId) return;
    Alert.alert(
      'Descartar Reporte',
      '¿Está seguro de que desea descartar este reporte? Los datos del triaje se eliminarán permanentemente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () => {
            try {
              console.log(`[ReviewScreen] Descartando reporte: ${reportId}`);
              deleteReport(db, reportId);
              router.replace('/(tabs)');
            } catch (err) {
              console.error('[ReviewScreen] Error al descartar reporte:', err);
              Alert.alert('Error', 'No se pudo eliminar el reporte.');
            }
          },
        },
      ]
    );
  };

  const getPriorityBadgeStyle = (pKey: StartPriority, isSelected: boolean): StyleProp<ViewStyle> => {
    return [
      styles.priorityBadge,
      pKey === 'ROJO' && styles.priorityBadgeRed,
      pKey === 'AMARILLO' && styles.priorityBadgeYellow,
      pKey === 'VERDE' && styles.priorityBadgeGreen,
      pKey === 'NEGRO' && styles.priorityBadgeBlack,
      isSelected ? styles.priorityBadgeSelected : styles.priorityBadgeUnselected,
    ];
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
          barStyle={theme.isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.background}
        />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Cargando reporte de triaje...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (errorMessage || !report) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
          barStyle={theme.isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.background}
        />
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={64} color={theme.danger} style={styles.stateIcon} />
          <Text style={styles.errorTitle}>Error al Cargar Reporte</Text>
          <Text style={styles.errorDescription}>
            {errorMessage || 'El reporte no fue encontrado en la base de datos local.'}
          </Text>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color={theme.text} style={styles.btnIconLeft} />
            <Text style={styles.btnSecondaryText}>Volver Atrás</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Banner de Revisión Humana */}
        <View style={styles.noticeBanner}>
          <Ionicons name="create-outline" size={22} color={theme.primary} style={styles.noticeIcon} />
          <View style={styles.noticeTextContainer}>
            <Text style={styles.noticeTitle}>Validación y Ajuste Humano</Text>
            <Text style={styles.noticeSubtitle}>
              Revise las inferencias del modelo QVAC antes de confirmar el reporte oficial.
            </Text>
          </View>
        </View>

        {/* Foto de la Escena / Lesión */}
        {report.imageUri && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="camera" size={20} color={theme.primary} style={styles.cardHeaderIcon} />
              <Text style={styles.cardTitle}>Fotografía de la Escena / Lesión</Text>
            </View>
            <Image
              source={{ uri: report.imageUri }}
              style={{ width: '100%', height: 200, borderRadius: 10, backgroundColor: theme.cardInner, marginTop: 6 }}
              resizeMode="cover"
            />
          </View>
        )}

        {/* 1. Relato de la Emergencia */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.primary} style={styles.cardHeaderIcon} />
            <Text style={styles.cardTitle}>1. Relato de la Emergencia (Reportante)</Text>
          </View>
          <Text style={styles.fieldDescription}>
            Descripción original provista por el ciudadano o transcrita de la nota de voz:
          </Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={4}
            value={textRelato}
            onChangeText={(val) => {
              setTextRelato(val);
              if (!summary || summary === textRelato) {
                setSummary(val);
              }
            }}
            placeholder="Escriba o ajuste el relato de la emergencia..."
            placeholderTextColor={theme.placeholder}
          />
        </View>

        {/* Heridas y Síntomas Detectados */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="medkit-outline" size={20} color={theme.danger} style={styles.cardHeaderIcon} />
            <Text style={styles.cardTitle}>Evaluación de Heridas y Síntomas</Text>
          </View>
          <Text style={styles.fieldDescription}>
            Detalle de fracturas, hemorragias, estado de conciencia o lesiones reportadas para la brigada:
          </Text>
          <TextInput
            style={[styles.textArea, { minHeight: 70 }]}
            multiline
            numberOfLines={3}
            value={injuries}
            onChangeText={setInjuries}
            placeholder="Detalle de heridas, síntomas y condición de los lesionados..."
            placeholderTextColor={theme.placeholder}
          />
        </View>

        {/* 2. Prioridad START */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="flag-outline" size={20} color={theme.primary} style={styles.cardHeaderIcon} />
            <Text style={styles.cardTitle}>2. Prioridad START</Text>
          </View>
          <Text style={styles.fieldDescription}>
            Seleccione la clasificación START adecuada según la severidad observada en campo:
          </Text>
          <View style={styles.priorityGrid}>
            {PRIORITY_OPTIONS.map((item) => {
              const isSelected = priority === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.8}
                  style={getPriorityBadgeStyle(item.key, isSelected)}
                  onPress={() => setPriority(item.key)}
                >
                  <View style={styles.priorityHeaderRow}>
                    <Text style={styles.priorityBadgeLabel}>{item.label}</Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                    )}
                  </View>
                  <Text style={styles.priorityBadgeSublabel}>{item.sublabel}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 3. Necesidades */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="grid-outline" size={20} color={theme.primary} style={styles.cardHeaderIcon} />
            <Text style={styles.cardTitle}>3. Necesidades Esfera Identificadas</Text>
          </View>
          <Text style={styles.fieldDescription}>
            Toque las etiquetas para activar o desactivar las categorías de ayuda humanitaria requeridas:
          </Text>
          <View style={styles.chipsContainer}>
            {NEED_OPTIONS.map((item) => {
              const isSelected = needs.includes(item.key);
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.7}
                  style={[
                    styles.needChip,
                    isSelected ? styles.needChipSelected : styles.needChipUnselected,
                  ]}
                  onPress={() => toggleNeed(item.key)}
                >
                  {isSelected && (
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" style={styles.chipCheckIcon} />
                  )}
                  <Text
                    style={[
                      styles.needChipText,
                      isSelected ? styles.needChipTextSelected : styles.needChipTextUnselected,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 4. Personas afectadas */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="people-outline" size={20} color={theme.primary} style={styles.cardHeaderIcon} />
            <Text style={styles.cardTitle}>4. Personas Afectadas</Text>
          </View>
          <Text style={styles.fieldDescription}>
            Cantidad estimada de personas afectadas o lesionadas en la escena:
          </Text>
          <View style={styles.stepperContainer}>
            <TouchableOpacity
              style={[
                styles.stepperBtn,
                peopleCount <= 0 && styles.stepperBtnDisabled,
              ]}
              onPress={handleDecrementPeople}
              disabled={peopleCount <= 0}
            >
              <Ionicons
                name="remove"
                size={22}
                color={peopleCount <= 0 ? (theme.isDark ? '#475569' : '#94A3B8') : '#FFFFFF'}
              />
            </TouchableOpacity>

            <TextInput
              style={styles.stepperInput}
              keyboardType="number-pad"
              value={peopleCount.toString()}
              onChangeText={handleChangePeopleText}
              selectTextOnFocus
            />

            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={handleIncrementPeople}
            >
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 5. Ubicación */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="location-outline" size={20} color={theme.primary} style={styles.cardHeaderIcon} />
            <Text style={styles.cardTitle}>5. Ubicación de Referencia</Text>
          </View>
          <Text style={styles.fieldDescription}>
            Puntos de referencia, corregimiento, escuela o coordenadas aproximadas:
          </Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="Ejemplo: Cerca de la escuela primaria de Chiriquí..."
            placeholderTextColor={theme.placeholder}
          />
        </View>

        {/* 6. Campos faltantes (read-only) */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="help-circle-outline" size={20} color={theme.warning} style={styles.cardHeaderIcon} />
            <Text style={styles.cardTitle}>6. Campos Faltantes (Incompletitud)</Text>
          </View>
          <Text style={styles.fieldDescription}>
            Datos críticos que el modelo de triaje identificó como ausentes o ambiguos en el relato:
          </Text>
          {report.missingFields && report.missingFields.length > 0 ? (
            <View style={styles.missingTagsContainer}>
              {report.missingFields.map((field, idx) => (
                <View key={idx} style={styles.missingTagBadge}>
                  <Ionicons name="alert-circle-outline" size={16} color={theme.warning} style={styles.missingTagIcon} />
                  <Text style={styles.missingTagText}>{field}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.missingEmptyBadge}>
              <Ionicons name="checkmark-circle-outline" size={18} color={theme.success} style={styles.missingTagIcon} />
              <Text style={styles.missingEmptyText}>
                No se detectaron campos faltantes críticos en la inferencia.
              </Text>
            </View>
          )}
        </View>

        {/* Resumen Ejecutivo IA para Rescatistas (Párrafo Consolidado Multimodal) */}
        <View style={[styles.card, styles.executiveSummaryCard]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.aiBadge}>
              <Ionicons name="hardware-chip-outline" size={15} color="#FFFFFF" />
              <Text style={styles.aiBadgeText}>IA Local QVAC</Text>
            </View>
            <Text style={[styles.cardTitle, { flex: 1, color: theme.primary }]}>
              Resumen Ejecutivo IA (Rescatistas)
            </Text>
          </View>
          <Text style={styles.fieldDescription}>
            Párrafo consolidado que unifica lo observado en cámara, la transcripción del audio y el relato, redactado como informe operativo para la brigada:
          </Text>
          <TextInput
            style={[styles.textArea, styles.executiveSummaryInput]}
            multiline
            numberOfLines={6}
            value={executiveSummary}
            onChangeText={setExecutiveSummary}
            placeholder="Resumen ejecutivo integral para los rescatistas..."
            placeholderTextColor={theme.placeholder}
          />

          {/* Advertencia explícita de IA */}
          <View style={styles.aiDisclaimerBox}>
            <Ionicons name="information-circle" size={18} color={theme.primary} />
            <Text style={styles.aiDisclaimerText}>
              Síntesis generada automáticamente por IA on-device (Llama 3.2 + VisionPsy + Whisper). No es 100% precisa; ajuste cualquier detalle antes de confirmar.
            </Text>
          </View>
        </View>

        {/* 7. Auditoría (collapsible section, collapsed by default) */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.auditToggleRow}
            activeOpacity={0.7}
            onPress={() => setIsAuditExpanded((prev) => !prev)}
          >
            <View style={styles.auditHeaderLeft}>
              <Ionicons name="analytics-outline" size={20} color={theme.primary} style={styles.cardHeaderIcon} />
              <Text style={styles.cardTitle}>7. Auditoría y Trazabilidad IA</Text>
            </View>
            <Ionicons
              name={isAuditExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.textMuted}
            />
          </TouchableOpacity>

          {isAuditExpanded && (
            <View style={styles.auditContent}>
              <View style={styles.qvacLocalBadge}>
                <Ionicons name="shield-checkmark" size={16} color={theme.success} style={styles.qvacBadgeIcon} />
                <Text style={styles.qvacLocalBadgeText}>
                  ✅ Inferencia 100% Local — QVAC
                </Text>
              </View>

              {/* Transcripción */}
              <View style={styles.auditFieldBox}>
                <Text style={styles.auditFieldLabel}>Transcripción de Audio (Whisper):</Text>
                <Text style={styles.auditFieldValue}>
                  {report.transcript || 'No se procesó audio o no hubo transcripción.'}
                </Text>
              </View>

              {/* Análisis visual */}
              <View style={styles.auditFieldBox}>
                <Text style={styles.auditFieldLabel}>Análisis Visual de Escena (VisionPsy):</Text>
                <Text style={styles.auditFieldValue}>
                  {report.visionSeverity || 'No se adjuntó fotografía o no se detectaron daños visibles.'}
                </Text>
              </View>

              {/* Tiempo */}
              <View style={styles.auditFieldBox}>
                <Text style={styles.auditFieldLabel}>Tiempo de Ejecución del Pipeline:</Text>
                <Text style={styles.auditTimeValue}>{report.executionTimeMs} ms</Text>
              </View>

              {/* Salida cruda del modelo */}
              <View style={styles.auditFieldBox}>
                <Text style={styles.auditFieldLabel}>Salida Cruda del Modelo (LLM Monospace):</Text>
                <View style={styles.monospaceContainer}>
                  <Text style={styles.monospaceText}>
                    {report.rawModelOutput || 'Sin salida cruda registrada.'}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Botones de Acción */}
        <View style={styles.actionsContainer}>
          {/* Confirmar y Guardar */}
          <TouchableOpacity
            style={styles.btnPrimary}
            activeOpacity={0.8}
            onPress={handleConfirmAndSave}
          >
            <Ionicons name="checkmark-circle-outline" size={22} color="#FFFFFF" style={styles.btnIconLeft} />
            <Text style={styles.btnPrimaryText}>✅ Confirmar y Guardar</Text>
          </TouchableOpacity>

          {/* Confirmar y Compartir */}
          <TouchableOpacity
            style={styles.btnShare}
            activeOpacity={0.8}
            onPress={handleConfirmAndShare}
          >
            <Ionicons name="radio-outline" size={22} color="#FFFFFF" style={styles.btnIconLeft} />
            <Text style={styles.btnShareText}>📡 Confirmar y Compartir</Text>
          </TouchableOpacity>

          {/* Descartar */}
          <TouchableOpacity
            style={styles.btnDanger}
            activeOpacity={0.8}
            onPress={handleDiscard}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" style={styles.btnIconLeft} />
            <Text style={styles.btnDangerText}>🗑️ Descartar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 48,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    stateIcon: {
      marginBottom: 16,
    },
    loadingText: {
      color: theme.textMuted,
      fontSize: 16,
      fontWeight: '600',
      marginTop: 14,
    },
    errorTitle: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '800',
      marginBottom: 8,
      textAlign: 'center',
    },
    errorDescription: {
      color: theme.textMuted,
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    noticeBanner: {
      backgroundColor: theme.card,
      borderColor: theme.primary,
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    noticeIcon: {
      marginRight: 12,
    },
    noticeTextContainer: {
      flex: 1,
    },
    noticeTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 2,
    },
    noticeSubtitle: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 16,
    },
    card: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    },
    executiveSummaryCard: {
      borderColor: theme.primary,
      borderWidth: 1.5,
      backgroundColor: theme.card,
    },
    aiBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: theme.primary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      marginRight: 8,
    },
    aiBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    executiveSummaryInput: {
      minHeight: 120,
      lineHeight: 22,
      marginBottom: 12,
    },
    aiDisclaimerBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: theme.cardInner,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    aiDisclaimerText: {
      flex: 1,
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 16,
      fontStyle: 'italic',
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    cardHeaderIcon: {
      marginRight: 8,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
    },
    fieldDescription: {
      color: theme.textMuted,
      fontSize: 12,
      marginBottom: 12,
      lineHeight: 17,
    },
    textArea: {
      backgroundColor: theme.cardInner,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 8,
      color: theme.text,
      padding: 12,
      fontSize: 14,
      minHeight: 90,
      textAlignVertical: 'top',
      lineHeight: 20,
    },
    input: {
      backgroundColor: theme.cardInner,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 8,
      color: theme.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },
    priorityGrid: {
      gap: 10,
    },
    priorityBadge: {
      borderRadius: 10,
      padding: 14,
    },
    priorityBadgeRed: {
      backgroundColor: '#EF4444',
    },
    priorityBadgeYellow: {
      backgroundColor: '#F59E0B',
    },
    priorityBadgeGreen: {
      backgroundColor: '#22C55E',
    },
    priorityBadgeBlack: {
      backgroundColor: '#1F2937',
    },
    priorityBadgeSelected: {
      borderWidth: 3,
      borderColor: theme.isDark ? '#FFFFFF' : '#0F172A',
      elevation: 6,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 4,
    },
    priorityBadgeUnselected: {
      borderWidth: 1,
      borderColor: theme.border,
      opacity: 0.65,
    },
    priorityHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    priorityBadgeLabel: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    priorityBadgeSublabel: {
      color: '#F8FAFC',
      fontSize: 12,
      fontWeight: '500',
      opacity: 0.9,
    },
    chipsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    needChip: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
    },
    needChipSelected: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    needChipUnselected: {
      backgroundColor: theme.cardInner,
      borderColor: theme.border,
    },
    chipCheckIcon: {
      marginRight: 6,
    },
    needChipText: {
      fontSize: 13,
    },
    needChipTextSelected: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    needChipTextUnselected: {
      color: theme.textMuted,
      fontWeight: '500',
    },
    stepperContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      marginTop: 4,
    },
    stepperBtn: {
      backgroundColor: theme.primary,
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepperBtnDisabled: {
      backgroundColor: theme.isDark ? '#1E293B' : '#E2E8F0',
      borderColor: theme.border,
      borderWidth: 1,
    },
    stepperInput: {
      backgroundColor: theme.cardInner,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 8,
      color: theme.text,
      fontSize: 22,
      fontWeight: '800',
      textAlign: 'center',
      width: 100,
      height: 48,
    },
    missingTagsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    missingTagBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.isDark ? '#451A03' : '#FEF3C7',
      borderColor: theme.isDark ? '#B45309' : '#F59E0B',
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    missingTagIcon: {
      marginRight: 6,
    },
    missingTagText: {
      color: theme.isDark ? '#FDE68A' : '#92400E',
      fontSize: 12,
      fontWeight: '600',
    },
    missingEmptyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.isDark ? '#052E16' : '#DCFCE7',
      borderColor: theme.isDark ? '#166534' : '#22C55E',
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    missingEmptyText: {
      color: theme.isDark ? '#86EFAC' : '#166534',
      fontSize: 13,
      fontWeight: '600',
    },
    auditToggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    auditHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    auditContent: {
      marginTop: 14,
      borderTopColor: theme.border,
      borderTopWidth: 1,
      paddingTop: 14,
      gap: 12,
    },
    qvacLocalBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.isDark ? '#064E3B' : '#DCFCE7',
      borderColor: theme.isDark ? '#059669' : '#22C55E',
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      alignSelf: 'flex-start',
    },
    qvacBadgeIcon: {
      marginRight: 6,
    },
    qvacLocalBadgeText: {
      color: theme.isDark ? '#A7F3D0' : '#166534',
      fontSize: 12,
      fontWeight: '700',
    },
    auditFieldBox: {
      backgroundColor: theme.cardInner,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
    },
    auditFieldLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    auditFieldValue: {
      color: theme.text,
      fontSize: 13,
      lineHeight: 18,
    },
    auditTimeValue: {
      color: theme.info,
      fontSize: 14,
      fontWeight: '700',
    },
    monospaceContainer: {
      backgroundColor: theme.cardInner,
      borderRadius: 6,
      padding: 8,
      marginTop: 4,
      borderColor: theme.border,
      borderWidth: 1,
    },
    monospaceText: {
      color: theme.isDark ? '#38BDF8' : theme.primary,
      fontSize: 12,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
      lineHeight: 16,
    },
    actionsContainer: {
      marginTop: 8,
      gap: 12,
    },
    btnPrimary: {
      backgroundColor: theme.success,
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    btnPrimaryText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
    },
    btnShare: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    btnShareText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
    },
    btnDanger: {
      backgroundColor: 'transparent',
      borderColor: theme.danger,
      borderWidth: 1.5,
      borderRadius: 10,
      paddingVertical: 13,
      paddingHorizontal: 16,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    btnDangerText: {
      color: theme.danger,
      fontSize: 15,
      fontWeight: '700',
    },
    btnSecondary: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
    },
    btnSecondaryText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
    btnIconLeft: {
      marginRight: 8,
    },
  });
