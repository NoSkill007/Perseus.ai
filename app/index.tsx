import React, { useState } from 'react';
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
  Image,
} from 'react-native';
import { runTriagePipeline, TriageInput, TriageResult, StartPriority } from '../src';
import {
  startAudioRecording,
  stopAudioRecording,
  pickAudioFile,
  takeCameraPhoto,
  pickGalleryImage,
} from '../src/utils/mediaCapture';

const PROVINCIAS = [
  'Chiriquí',
  'Bocas del Toro',
  'Panamá',
  'Panamá Oeste',
  'Colón',
  'Veraguas',
  'Coclé',
  'Herrera',
  'Los Santos',
  'Darién',
  'Comarca Ngäbe-Buglé',
  'Comarca Guna Yala',
];

const PRESETS = [
  {
    name: '📍 Sintético Chiriquí',
    input: {
      textRelato: 'Somos cuatro personas junto a la escuela del barrio en Chiriquí. Nos falta agua. No sé el nombre de la calle.',
      province: 'Chiriquí',
      audioUri: '',
      imageUri: '',
    },
  },
  {
    name: '🚨 Inundación Crítica',
    input: {
      textRelato: 'Familia de seis personas atrapadas en el techo por subida del río. Hay dos adultos mayores heridos.',
      province: 'Bocas del Toro',
      audioUri: 'file:///local/audio_auxilio.wav',
      imageUri: 'file:///local/foto_casa_inundada.jpg',
    },
  },
  {
    name: '🩹 Daños Leves',
    input: {
      textRelato: 'Tres personas refugiadas en la cancha comunal, tenemos comida pero requerimos frazadas y albergue.',
      province: 'Veraguas',
      audioUri: '',
      imageUri: 'file:///local/foto_cancha.jpg',
    },
  },
];

export default function App() {
  const [relato, setRelato] = useState(PRESETS[0].input.textRelato);
  const [province, setProvince] = useState(PRESETS[0].input.province);
  const [audioUri, setAudioUri] = useState('');
  const [imageUri, setImageUri] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TriageResult | null>(null);

  // Estados multimedia en vivo
  const [recordingObj, setRecordingObj] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);

  const handleToggleRecord = async () => {
    if (isRecording && recordingObj) {
      const uri = await stopAudioRecording(recordingObj);
      setIsRecording(false);
      setRecordingObj(null);
      if (uri) {
        setAudioUri(uri);
      }
    } else {
      const rec = await startAudioRecording();
      if (rec) {
        setRecordingObj(rec);
        setIsRecording(true);
      }
    }
  };

  const handlePickAudio = async () => {
    const uri = await pickAudioFile();
    if (uri) {
      setAudioUri(uri);
    }
  };

  const handleTakePhoto = async () => {
    const uri = await takeCameraPhoto();
    if (uri) {
      setImageUri(uri);
    }
  };

  const handlePickGallery = async () => {
    const uri = await pickGalleryImage();
    if (uri) {
      setImageUri(uri);
    }
  };

  const handleProcessTriage = async () => {
    setIsLoading(true);
    setResult(null);

    const input: TriageInput = {
      textRelato: relato,
      province,
      audioUri: audioUri.trim() || undefined,
      imageUri: imageUri.trim() || undefined,
      operatorDeviceId: 'DEV-MOBILE-01',
    };

    try {
      const res = await runTriagePipeline(input);
      setResult(res);
    } catch (e) {
      console.error('Error al ejecutar triaje:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const getPriorityColor = (priority: StartPriority) => {
    switch (priority) {
      case 'ROJO':
        return '#DC2626';
      case 'AMARILLO':
        return '#D97706';
      case 'VERDE':
        return '#16A34A';
      case 'NEGRO':
        return '#1E293B';
      default:
        return '#64748B';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appTitle}>🛡️ Perseus.ai</Text>
          <Text style={styles.subtitle}>
            Coordinación y Triaje Local en Emergencias (Panamá)
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeText}>⚡ QVAC 100% On-Device Offline</Text>
            </View>
            <View style={styles.ruleBadge}>
              <Text style={styles.ruleBadgeText}>0 APIs Cloud</Text>
            </View>
          </View>
        </View>

        {/* Plantillas de prueba rápida */}
        <Text style={styles.sectionHeader}>Casos Sintéticos Rápidos:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
          {PRESETS.map((preset, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.presetButton}
              onPress={() => {
                setRelato(preset.input.textRelato);
                setProvince(preset.input.province);
                setAudioUri(preset.input.audioUri || '');
                setImageUri(preset.input.imageUri || '');
              }}
            >
              <Text style={styles.presetButtonText}>{preset.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Formulario de Entrada */}
        <View style={styles.card}>
          {/* 1. Provincia / Comarca */}
          <Text style={styles.label}>1. Provincia / Comarca:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.provScroll}>
            {PROVINCIAS.map((prov) => (
              <TouchableOpacity
                key={prov}
                style={[styles.provChip, province === prov && styles.provChipSelected]}
                onPress={() => setProvince(prov)}
              >
                <Text
                  style={[
                    styles.provChipText,
                    province === prov && styles.provChipTextSelected,
                  ]}
                >
                  {prov}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* 2. Relato de Texto */}
          <Text style={styles.label}>2. Relato de la emergencia (Texto):</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={4}
            value={relato}
            onChangeText={setRelato}
            placeholder="Escribe el relato de la situación observada..."
            placeholderTextColor="#64748B"
          />

          {/* 3. Entrada de Voz (En vivo o Archivo) */}
          <Text style={styles.label}>3. Entrada de Voz (Fase ASR - Whisper):</Text>
          <View style={styles.mediaButtonsRow}>
            <TouchableOpacity
              style={[
                styles.mediaButton,
                isRecording ? styles.mediaButtonActive : styles.mediaButtonDefault,
              ]}
              onPress={handleToggleRecord}
            >
              <Text style={styles.mediaButtonText}>
                {isRecording ? '⏹️ Detener Grabación' : '🎙️ Grabar Voz en Vivo'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.mediaButtonDefault} onPress={handlePickAudio}>
              <Text style={styles.mediaButtonText}>📁 Escoger Audio</Text>
            </TouchableOpacity>
          </View>

          {audioUri ? (
            <View style={styles.mediaPreviewBox}>
              <Text style={styles.mediaPreviewLabel}>Audio Seleccionado:</Text>
              <Text style={styles.mediaPreviewUri} numberOfLines={1}>
                {audioUri}
              </Text>
              <TouchableOpacity onPress={() => setAudioUri('')} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>✕ Quitar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TextInput
              style={styles.input}
              value={audioUri}
              onChangeText={setAudioUri}
              placeholder="Opcional: Ruta manual (ej: /local/voz.wav)"
              placeholderTextColor="#64748B"
            />
          )}

          {/* 4. Entrada de Foto (Cámara en vivo o Galería) */}
          <Text style={styles.label}>4. Entrada de Foto (Fase Visión - VisionPsy):</Text>
          <View style={styles.mediaButtonsRow}>
            <TouchableOpacity style={styles.mediaButtonDefault} onPress={handleTakePhoto}>
              <Text style={styles.mediaButtonText}>📸 Tomar Foto (Cámara)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.mediaButtonDefault} onPress={handlePickGallery}>
              <Text style={styles.mediaButtonText}>🖼️ Galería / Archivo</Text>
            </TouchableOpacity>
          </View>

          {imageUri ? (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: imageUri }} style={styles.imageThumbnail} resizeMode="cover" />
              <View style={styles.imageDetails}>
                <Text style={styles.mediaPreviewLabel}>Foto Adjunta:</Text>
                <Text style={styles.mediaPreviewUri} numberOfLines={2}>
                  {imageUri}
                </Text>
                <TouchableOpacity onPress={() => setImageUri('')} style={styles.clearBtn}>
                  <Text style={styles.clearBtnText}>✕ Quitar Foto</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TextInput
              style={styles.input}
              value={imageUri}
              onChangeText={setImageUri}
              placeholder="Opcional: Ruta manual (ej: /local/foto.jpg)"
              placeholderTextColor="#64748B"
            />
          )}

          {/* Botón de Procesamiento */}
          <TouchableOpacity
            style={[styles.processButton, isLoading && styles.buttonDisabled]}
            onPress={handleProcessTriage}
            disabled={isLoading}
          >
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#FFF" />
                <Text style={styles.processButtonText}> Procesando Pipeline Secuencial...</Text>
              </View>
            ) : (
              <Text style={styles.processButtonText}>⚡ Procesar Triaje con IA Local</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Panel de Resultados del Triaje */}
        {result && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeaderRow}>
              <Text style={styles.resultTitle}>Ficha de Triaje Generada</Text>
              <View
                style={[
                  styles.priorityBadge,
                  { backgroundColor: getPriorityColor(result.triagePriority) },
                ]}
              >
                <Text style={styles.priorityBadgeText}>
                  PRIORIDAD: {result.triagePriority}
                </Text>
              </View>
            </View>

            {/* Resumen Estructurado */}
            <View style={styles.resultField}>
              <Text style={styles.fieldLabel}>Resumen Estructurado (LLM):</Text>
              <Text style={styles.fieldValue}>{result.extractedSummary}</Text>
            </View>

            {/* Personas y Ubicación */}
            <View style={styles.twoCols}>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>Personas Afectadas:</Text>
                <Text style={styles.metricText}>
                  {result.reportedPeopleCount !== undefined
                    ? `${result.reportedPeopleCount} personas`
                    : 'No especificado'}
                </Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>Ubicación Referenciada:</Text>
                <Text style={styles.fieldValueSmall}>
                  {result.locationReference || province}
                </Text>
              </View>
            </View>

            {/* Necesidades Identificadas */}
            <View style={styles.resultField}>
              <Text style={styles.fieldLabel}>Necesidades Esfera Identificadas:</Text>
              <View style={styles.tagsContainer}>
                {result.needs.map((need, i) => (
                  <View key={i} style={styles.tagBadge}>
                    <Text style={styles.tagText}>{need}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Fases del Pipeline */}
            <View style={styles.phasesBox}>
              <Text style={styles.phasesTitle}>Trazabilidad de Pipeline Secuencial:</Text>
              <Text style={styles.phaseItem}>
                🎙️ <Text style={styles.bold}>Fase 1 (ASR):</Text>{' '}
                {result.transcript || 'Omitida (Sin audio)'}
              </Text>
              <Text style={styles.phaseItem}>
                👁️ <Text style={styles.bold}>Fase 2 (Visión):</Text>{' '}
                {result.visionSeverity || 'Omitida (Sin foto)'}
              </Text>
              <Text style={styles.phaseItem}>
                🧠 <Text style={styles.bold}>Fase 3 (LLM):</Text> Llama 3.2 1B Instruct Q4 (Enum START forzado)
              </Text>
            </View>

            {/* Datos Faltantes */}
            {result.missingFields && result.missingFields.length > 0 && (
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>⚠️ Campos Pendientes de Revisión Humana:</Text>
                {result.missingFields.map((field, idx) => (
                  <Text key={idx} style={styles.warningItem}>
                    • {field}
                  </Text>
                ))}
              </View>
            )}

            {/* Footer de Métricas */}
            <View style={styles.metricFooter}>
              <Text style={styles.metricFooterText}>
                ⏱️ Tiempo de Inferencia: <Text style={styles.bold}>{result.executionTimeMs} ms</Text>
              </Text>
              <Text style={styles.metricFooterText}>
                🔒 100% Inferencia Local: <Text style={styles.bold}>Sí (QVAC)</Text>
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  offlineBadge: {
    backgroundColor: '#065F46',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  offlineBadgeText: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '700',
  },
  ruleBadge: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ruleBadgeText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeader: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  presetScroll: {
    marginBottom: 16,
  },
  presetButton: {
    backgroundColor: '#1E293B',
    borderColor: '#38BDF8',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  presetButtonText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    borderColor: '#334155',
    borderWidth: 1,
    marginBottom: 20,
  },
  label: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  provScroll: {
    marginBottom: 6,
  },
  provChip: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 6,
  },
  provChipSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },
  provChipText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  provChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  textArea: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    color: '#F8FAFC',
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  mediaButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  mediaButton: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaButtonDefault: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderColor: '#38BDF8',
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaButtonActive: {
    backgroundColor: '#DC2626',
    borderColor: '#EF4444',
    borderWidth: 1,
  },
  mediaButtonText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  mediaPreviewBox: {
    backgroundColor: '#0F172A',
    borderColor: '#059669',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mediaPreviewLabel: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
    marginRight: 4,
  },
  mediaPreviewUri: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 11,
    marginRight: 8,
  },
  clearBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  clearBtnText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '700',
  },
  imagePreviewContainer: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderColor: '#059669',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    gap: 10,
    alignItems: 'center',
  },
  imageThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#1E293B',
  },
  imageDetails: {
    flex: 1,
  },
  input: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
  },
  processButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  processButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  resultCard: {
    backgroundColor: '#0F172A',
    borderColor: '#38BDF8',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
  },
  resultHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
  },
  priorityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  priorityBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  resultField: {
    marginBottom: 12,
  },
  fieldLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  fieldValue: {
    color: '#F8FAFC',
    fontSize: 14,
    lineHeight: 20,
  },
  fieldValueSmall: {
    color: '#F8FAFC',
    fontSize: 13,
  },
  twoCols: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  col: {
    flex: 1,
    backgroundColor: '#1E293B',
    padding: 10,
    borderRadius: 8,
  },
  metricText: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '700',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagBadge: {
    backgroundColor: '#1E293B',
    borderColor: '#38BDF8',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    color: '#E0F2FE',
    fontSize: 12,
    fontWeight: '600',
  },
  phasesBox: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  phasesTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  phaseItem: {
    color: '#CBD5E1',
    fontSize: 12,
    marginBottom: 4,
  },
  bold: {
    fontWeight: '700',
    color: '#F8FAFC',
  },
  warningBox: {
    backgroundColor: '#451A03',
    borderColor: '#B45309',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  warningTitle: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  warningItem: {
    color: '#FEF3C7',
    fontSize: 12,
  },
  metricFooter: {
    borderTopColor: '#334155',
    borderTopWidth: 1,
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricFooterText: {
    color: '#94A3B8',
    fontSize: 12,
  },
});
