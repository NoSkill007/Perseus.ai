import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Image,
  Modal,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter, useFocusEffect } from 'expo-router';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { runTriagePipeline } from '../../src/services/ai/triagePipeline';
import { saveReport, triageResultToReport } from '../../src/services/reportService';
import { getProfile } from '../../src/services/profileService';
import {
  startAudioRecording,
  stopAudioRecording,
  pickAudioFile,
  takeCameraPhoto,
  pickGalleryImage,
} from '../../src/utils/mediaCapture';
import { useTheme } from '../../src/context/ThemeContext';
import type { ThemeColors } from '../../src/constants/theme';
import type { TriageInput } from '../../src/types/triageTypes';

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

type ProcessingStage = 'audio' | 'llm';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getFilename(uri: string): string {
  try {
    const segments = uri.split('/');
    const last = segments[segments.length - 1];
    return last ? decodeURIComponent(last) : 'audio_grabado.m4a';
  } catch {
    return 'audio_grabado.m4a';
  }
}

export default function ReportarScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Verificar rol de usuario: el rescatista no puede reportar emergencias
  const userProfile = useMemo(() => getProfile(db), [db]);
  const isRescatista = userProfile?.role === 'rescatista';

  useFocusEffect(
    useCallback(() => {
      const p = getProfile(db);
      if (p?.role === 'rescatista') {
        Alert.alert(
          'Acceso Restringido',
          'El rol de Rescatista está destinado exclusivamente a la recepción, atención y triage de reportes de emergencia.',
          [{ text: 'Ir al Panel', onPress: () => router.replace('/(tabs)') }]
        );
      }
    }, [db, router])
  );

  // Estados del formulario
  const [textRelato, setTextRelato] = useState('');
  const [injuriesAndSymptoms, setInjuriesAndSymptoms] = useState('');
  const [province, setProvince] = useState(PROVINCIAS[0]);
  const [district, setDistrict] = useState('');
  const [corregimiento, setCorregimiento] = useState('');
  const [personasAfectadas, setPersonasAfectadas] = useState(1);
  const [useSavedAddress, setUseSavedAddress] = useState(false);

  // Estados multimedia
  const [audioUri, setAudioUri] = useState('');
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [imageUri, setImageUri] = useState('');

  // Estados de grabación en vivo
  const [recordingObj, setRecordingObj] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Animación del indicador de pulso rojo
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estados de UI y modales
  const [isProvinceModalVisible, setIsProvinceModalVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>('audio');

  const recordingRef = useRef<Audio.Recording | null>(null);

  // Limpieza de recursos al desmontar pantalla
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (stageTimerRef.current) {
        clearTimeout(stageTimerRef.current);
      }
      if (recordingRef.current) {
        recordingRef.current.getStatusAsync().then((status) => {
          if (status.isRecording) {
            recordingRef.current?.stopAndUnloadAsync().catch(() => {});
          }
        }).catch(() => {});
      }
    };
  }, []);

  // Manejador para grabar o detener audio
  const handleToggleRecord = async () => {
    console.log('[ReportarScreen] handleToggleRecord llamado. isRecording actual:', isRecording);
    if (isRecording && recordingObj) {
      try {
        const uri = await stopAudioRecording(recordingObj);
        setIsRecording(false);
        setRecordingObj(null);
        recordingRef.current = null;

        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        pulseAnim.stopAnimation();
        pulseAnim.setValue(1);

        if (uri) {
          console.log('[ReportarScreen] Audio grabado exitosamente:', uri);
          setAudioUri(uri);
          setAudioDuration(recordingSeconds);
        }
      } catch (err) {
        console.error('[ReportarScreen] Error al detener grabación:', err);
        Alert.alert('Error', 'No se pudo detener la grabación de audio.');
      }
    } else {
      try {
        setRecordingSeconds(0);

        // Feedback por callback de expo-av + fallback interval
        const rec = await startAudioRecording((status) => {
          if (status.isRecording) {
            const currentSeconds = Math.floor((status.durationMillis || 0) / 1000);
            setRecordingSeconds(currentSeconds);
          }
        });

        if (rec) {
          setRecordingObj(rec);
          recordingRef.current = rec;
          setIsRecording(true);

          // Iniciar animación de pulso rojo
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, {
                toValue: 0.2,
                duration: 500,
                useNativeDriver: true,
              }),
              Animated.timing(pulseAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
              }),
            ])
          ).start();

          // Fallback interval por si el callback no dispara periódicamente
          timerRef.current = setInterval(() => {
            setRecordingSeconds((prev) => prev + 1);
          }, 1000);
        }
      } catch (err) {
        console.error('[ReportarScreen] Error al iniciar grabación:', err);
        Alert.alert('Error', 'No se pudo iniciar la grabación de audio.');
      }
    }
  };

  // Manejador para seleccionar archivo de audio
  const handlePickAudio = async () => {
    try {
      console.log('[ReportarScreen] Abriendo explorador de archivos para audio...');
      const uri = await pickAudioFile();
      if (uri) {
        console.log('[ReportarScreen] Archivo de audio seleccionado:', uri);
        setAudioUri(uri);
        setAudioDuration(null);
      }
    } catch (err) {
      console.error('[ReportarScreen] Error al seleccionar archivo de audio:', err);
      Alert.alert('Error', 'No se pudo cargar el archivo de audio.');
    }
  };

  // Manejador para eliminar audio adjunto
  const handleRemoveAudio = () => {
    console.log('[ReportarScreen] Audio adjunto eliminado');
    setAudioUri('');
    setAudioDuration(null);
  };

  // Manejador para capturar foto con la cámara
  const handleTakePhoto = async () => {
    try {
      console.log('[ReportarScreen] Abriendo cámara...');
      const uri = await takeCameraPhoto();
      if (uri) {
        console.log('[ReportarScreen] Foto capturada:', uri);
        setImageUri(uri);
      }
    } catch (err) {
      console.error('[ReportarScreen] Error al capturar foto:', err);
      Alert.alert('Error', 'No se pudo abrir la cámara.');
    }
  };

  // Manejador para seleccionar foto de galería
  const handlePickGallery = async () => {
    try {
      console.log('[ReportarScreen] Abriendo galería...');
      const uri = await pickGalleryImage();
      if (uri) {
        console.log('[ReportarScreen] Imagen de galería seleccionada:', uri);
        setImageUri(uri);
      }
    } catch (err) {
      console.error('[ReportarScreen] Error al seleccionar foto de galería:', err);
      Alert.alert('Error', 'No se pudo seleccionar la foto.');
    }
  };

  // Manejador para eliminar foto adjunta
  const handleRemoveImage = () => {
    console.log('[ReportarScreen] Foto adjunta eliminada');
    setImageUri('');
  };

  // Stepper de personas afectadas
  const handleDecrementPeople = () => {
    setPersonasAfectadas((prev) => Math.max(1, prev - 1));
  };

  const handleIncrementPeople = () => {
    setPersonasAfectadas((prev) => prev + 1);
  };

  // Manejador para alternar el uso de la dirección guardada del perfil
  const handleToggleSavedAddress = () => {
    if (!useSavedAddress) {
      try {
        const p = getProfile(db);
        if (!p) {
          Alert.alert('Sin perfil', 'No se encontró un perfil guardado.');
          return;
        }

        let loadedSomething = false;

        if (p.province && PROVINCIAS.includes(p.province)) {
          setProvince(p.province);
          loadedSomething = true;
        }

        if (p.address && p.address.trim()) {
          setCorregimiento(p.address.trim());
          loadedSomething = true;
        }

        setDistrict('');

        if (loadedSomething) {
          setUseSavedAddress(true);
        } else {
          Alert.alert(
            'Dirección no disponible',
            'No tienes una dirección registrada en tu perfil. Puedes completarla manualmente a continuación.'
          );
        }
      } catch (err) {
        console.warn('[ReportarScreen] Error al obtener dirección guardada:', err);
      }
    } else {
      // Desactivar y habilitar edición libre
      setUseSavedAddress(false);
    }
  };

  // Envío y ejecución del pipeline de IA
  const handleSubmit = async () => {
    console.log('[ReportarScreen] Validando datos para envío de reporte...');

    const hasAudio = audioUri.trim().length > 0;
    const hasText = textRelato.trim().length > 0;
    const hasImage = imageUri.trim().length > 0;

    // 1. Validar regla de backend: La voz es obligatoria, el relato de texto y la foto son opcionales
    if (!hasAudio) {
      Alert.alert(
        'Audio requerido',
        'La nota de voz / audio es obligatoria para reportar la emergencia. Por favor graba un audio o selecciona un archivo.'
      );
      return;
    }

    // Detener grabación si el usuario aún estaba grabando
    if (isRecording && recordingObj) {
      await handleToggleRecord();
    }

    // 2. Iniciar pantalla de procesamiento con etapas
    setIsProcessing(true);

    const initialStage: ProcessingStage = hasAudio ? 'audio' : 'llm';
    setProcessingStage(initialStage);

    // Configurar timers visuales para retroalimentación en pantalla
    if (stageTimerRef.current) {
      clearTimeout(stageTimerRef.current);
    }

    if (hasAudio) {
      stageTimerRef.current = setTimeout(() => {
        setProcessingStage('llm');
      }, 1500);
    }

    try {
      // 3. Ejecutar Pipeline de IA secuencial local
      const input: TriageInput = {
        textRelato: hasText ? textRelato.trim() : undefined,
        injuriesAndSymptoms: injuriesAndSymptoms.trim() || undefined,
        audioUri: hasAudio ? audioUri.trim() : undefined,
        imageUri: hasImage ? imageUri.trim() : undefined,
        province,
        district: district.trim() || undefined,
        corregimiento: corregimiento.trim() || undefined,
        reportedPeopleCount: personasAfectadas,
      };

      console.log('[ReportarScreen] Llamando a runTriagePipeline...');
      const result = await runTriagePipeline(input);
      console.log('[ReportarScreen] Triaje generado exitosamente con ID:', result.reportId);

      // 4. Convertir resultado a reporte estructurado con clasificación automática de la IA
      const report = triageResultToReport(
        result,
        'local',
        province,
        district.trim() || undefined,
        corregimiento.trim() || undefined
      );

      // Asignar personas afectadas ingresadas y marcar como confirmado directamente
      report.reportedPeopleCount = personasAfectadas;
      if (hasText) report.textRelato = textRelato.trim();
      report.status = 'confirmado';

      // 5. Guardar reporte en base de datos SQLite
      saveReport(db, report);
      console.log('[ReportarScreen] Reporte guardado como confirmado en SQLite.');

      // 6. Limpiar formulario
      setTextRelato('');
      setInjuriesAndSymptoms('');
      setAudioUri('');
      setAudioDuration(null);
      setImageUri('');
      setPersonasAfectadas(1);
      setDistrict('');
      setCorregimiento('');
      setUseSavedAddress(false);
      setIsProcessing(false);

      // 7. Navegar directamente al detalle del reporte procesado
      router.push(`/report/${result.reportId}` as any);
    } catch (err: any) {
      console.error('[ReportarScreen] ❌ ERROR DURANTE EL PROCESAMIENTO:', {
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
        code: err?.code,
        raw: err,
      });
      setIsProcessing(false);
      Alert.alert(
        'Error de procesamiento con IA',
        `${err?.name || 'Error'}: ${err?.message || String(err)}`
      );
    } finally {
      if (stageTimerRef.current) {
        clearTimeout(stageTimerRef.current);
        stageTimerRef.current = null;
      }
    }
  };

  if (isRescatista) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center', padding: 24 }]} edges={['top']}>
        <StatusBar barStyle={theme.statusBarStyle === 'light' ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
        <View style={{ alignItems: 'center', maxWidth: 320 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: theme.primary + '20',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <Ionicons name="shield-checkmark" size={44} color={theme.primary} />
          </View>
          <Text style={[styles.title, { textAlign: 'center', marginBottom: 10 }]}>
            Modo Rescatista
          </Text>
          <Text style={{ textAlign: 'center', color: theme.textMuted, fontSize: 14, lineHeight: 22, marginBottom: 24 }}>
            Los miembros de brigadas y rescatistas atienden y gestionan emergencias desde el Panel de Mando y el canal P2P. La emisión de reportes es exclusiva para ciudadanos.
          </Text>
          <TouchableOpacity
            style={[styles.submitButton, { width: '100%', paddingVertical: 14 }]}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
            <Text style={[styles.submitButtonText, { marginLeft: 8 }]}>Ir al Panel de Rescate</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle={theme.statusBarStyle === 'light' ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Encabezado */}
        <View style={styles.header}>
          <Text style={styles.title}>🆘 Reportar Emergencia</Text>
          <Text style={styles.subtitle}>
            Describe lo ocurrido mediante texto, audio o foto. La IA clasificará la gravedad y necesidades.
          </Text>
        </View>

        {/* Sección 1: Relato en Texto */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="document-text-outline" size={20} color={theme.primary} />
            <Text style={styles.sectionTitle}>1. Relato de la Emergencia</Text>
          </View>
          <TextInput
            style={styles.textArea}
            placeholder="Describa la situación de emergencia..."
            placeholderTextColor={theme.textPlaceholder}
            multiline
            numberOfLines={5}
            value={textRelato}
            onChangeText={setTextRelato}
            textAlignVertical="top"
          />
        </View>

        {/* Sección 2: Heridas y Síntomas Observados */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="medkit-outline" size={20} color="#EF4444" />
            <Text style={styles.sectionTitle}>2. Heridas y Síntomas (Opcional)</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Indica si hay sangrado, fracturas, personas atrapadas o inconscientes para alertar al rescatista.
          </Text>

          {/* Chips de Selección Rápida */}
          <View style={styles.symptomsChipsRow}>
            {[
              'Posible fractura',
              'Hemorragia activa',
              'Persona inconsciente',
              'Dificultad respiratoria',
              'Quemadura',
              'Atrapado bajo escombros',
              'Sin heridas visibles',
            ].map((chip) => {
              const isSelected = injuriesAndSymptoms.includes(chip);
              return (
                <TouchableOpacity
                  key={chip}
                  style={[styles.symptomChip, isSelected && styles.symptomChipActive]}
                  onPress={() => {
                    if (isSelected) {
                      const updated = injuriesAndSymptoms
                        .replace(new RegExp(`(^|,\\s*)${chip}`, 'g'), '')
                        .replace(/^,\s*/, '')
                        .trim();
                      setInjuriesAndSymptoms(updated);
                    } else {
                      const updated = injuriesAndSymptoms.trim()
                        ? `${injuriesAndSymptoms.trim()}, ${chip}`
                        : chip;
                      setInjuriesAndSymptoms(updated);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.symptomChipText, isSelected && styles.symptomChipTextActive]}>
                    {isSelected ? `✓ ${chip}` : `+ ${chip}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={[styles.textArea, { minHeight: 70, marginTop: 8 }]}
            placeholder="Ej: Golpe fuerte en la cabeza, dolor agudo en el pecho, pierna inmovilizada..."
            placeholderTextColor={theme.textPlaceholder}
            multiline
            numberOfLines={3}
            value={injuriesAndSymptoms}
            onChangeText={setInjuriesAndSymptoms}
            textAlignVertical="top"
          />
        </View>

        {/* Sección 3: Audio (Nota de Voz) */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="mic-outline" size={20} color="#3B82F6" />
            <Text style={styles.sectionTitle}>3. Nota de Voz / Audio</Text>
          </View>

          <View style={styles.audioActionRow}>
            {/* Botón Grabar en Vivo */}
            <TouchableOpacity
              style={[
                styles.audioButton,
                isRecording ? styles.audioButtonRecording : styles.audioButtonRecord,
              ]}
              onPress={handleToggleRecord}
              activeOpacity={0.8}
            >
              {isRecording ? (
                <View style={styles.recordingContentRow}>
                  <Animated.View style={[styles.recordingPulseDot, { opacity: pulseAnim }]} />
                  <Ionicons name="stop" size={18} color="#F8FAFC" />
                  <Text style={styles.audioButtonText}>
                    Detener ({formatDuration(recordingSeconds)})
                  </Text>
                </View>
              ) : (
                <View style={styles.audioButtonContentRow}>
                  <Ionicons name="mic" size={18} color="#F8FAFC" />
                  <Text style={styles.audioButtonText}>Grabar Audio</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Botón Seleccionar Archivo */}
            <TouchableOpacity
              style={[styles.audioButton, styles.audioButtonFile]}
              onPress={handlePickAudio}
              disabled={isRecording}
              activeOpacity={0.8}
            >
              <Ionicons name="folder-open-outline" size={18} color="#94A3B8" />
              <Text style={styles.audioFileButtonText}>Archivo</Text>
            </TouchableOpacity>
          </View>

          {/* Badge de Audio Capturado */}
          {audioUri.length > 0 && (
            <View style={styles.mediaBadge}>
              <Ionicons name="volume-high-outline" size={18} color="#22C55E" />
              <View style={styles.mediaBadgeTextContainer}>
                <Text style={styles.mediaBadgeTitle} numberOfLines={1}>
                  {getFilename(audioUri)}
                </Text>
                {audioDuration !== null && (
                  <Text style={styles.mediaBadgeSubtitle}>
                    Duración: {formatDuration(audioDuration)}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.removeMediaButton}
                onPress={handleRemoveAudio}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Sección 4: Fotografía de la Escena */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="camera-outline" size={20} color="#3B82F6" />
            <Text style={styles.sectionTitle}>4. Foto de la Escena / Lesión</Text>
          </View>

          <View style={styles.photoActionRow}>
            <TouchableOpacity
              style={[styles.photoButton, styles.photoButtonCamera]}
              onPress={handleTakePhoto}
              activeOpacity={0.8}
            >
              <Ionicons name="camera" size={18} color="#F8FAFC" />
              <Text style={styles.photoButtonText}>Cámara</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.photoButton, styles.photoButtonGallery]}
              onPress={handlePickGallery}
              activeOpacity={0.8}
            >
              <Ionicons name="images-outline" size={18} color="#94A3B8" />
              <Text style={styles.photoGalleryButtonText}>Galería</Text>
            </TouchableOpacity>
          </View>

          {/* Vista Previa de Imagen */}
          {imageUri.length > 0 && (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: imageUri }} style={styles.imagePreview as any} resizeMode="cover" />
              <TouchableOpacity
                style={styles.removeImageFloatingButton}
                onPress={handleRemoveImage}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={18} color="#F8FAFC" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Sección 5: Ubicación en Panamá */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="location-outline" size={20} color="#3B82F6" />
            <Text style={styles.sectionTitle}>5. Ubicación</Text>
          </View>

          {/* Botón interactivo para alternar dirección guardada (Estilo Cámara / Audio) */}
          <TouchableOpacity
            style={[
              styles.addressMainButton,
              useSavedAddress && styles.addressMainButtonActive,
            ]}
            onPress={handleToggleSavedAddress}
            activeOpacity={0.8}
          >
            <Ionicons
              name={useSavedAddress ? 'checkmark-circle' : 'home'}
              size={18}
              color="#F8FAFC"
            />
            <Text style={styles.addressMainButtonText}>
              {useSavedAddress
                ? '✅ Usando mi dirección guardada'
                : 'Usar mi dirección guardada'}
            </Text>
          </TouchableOpacity>

          {/* Formulario de Ubicación (deshabilitado y opaco cuando useSavedAddress es true) */}
          <View
            style={[
              styles.locationFormContainer,
              useSavedAddress && styles.locationFormDisabled,
            ]}
            pointerEvents={useSavedAddress ? 'none' : 'auto'}
          >
            {/* Selector de Provincia */}
            <Text style={styles.inputLabel}>Provincia o Comarca *</Text>
            <TouchableOpacity
              style={[
                styles.pickerSelector,
                useSavedAddress && styles.inputDisabledStyle,
              ]}
              onPress={() => !useSavedAddress && setIsProvinceModalVisible(true)}
              disabled={useSavedAddress}
              activeOpacity={0.7}
            >
              <Text style={styles.pickerSelectorText}>{province}</Text>
              <Ionicons name="chevron-down" size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* Distrito */}
            <Text style={styles.inputLabel}>Distrito (Opcional)</Text>
            <TextInput
              style={[
                styles.inputField,
                useSavedAddress && styles.inputDisabledStyle,
              ]}
              placeholder="Ej: David, Panamá, Chitré..."
              placeholderTextColor={theme.textPlaceholder}
              value={district}
              onChangeText={setDistrict}
              editable={!useSavedAddress}
            />

            {/* Corregimiento */}
            <Text style={styles.inputLabel}>Corregimiento / Referencia (Opcional)</Text>
            <TextInput
              style={[
                styles.inputField,
                useSavedAddress && styles.inputDisabledStyle,
              ]}
              placeholder="Ej: Calidonia, San Francisco, Dolega..."
              placeholderTextColor={theme.textPlaceholder}
              value={corregimiento}
              onChangeText={setCorregimiento}
              editable={!useSavedAddress}
            />
          </View>
        </View>

        {/* Sección 6: Personas Afectadas */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="people-outline" size={20} color="#3B82F6" />
            <Text style={styles.sectionTitle}>6. Personas Afectadas</Text>
          </View>

          <View style={styles.stepperContainer}>
            <Text style={styles.stepperLabel}>Cantidad estimada:</Text>
            <View style={styles.stepperControls}>
              <TouchableOpacity
                style={[
                  styles.stepperButton,
                  personasAfectadas <= 1 && styles.stepperButtonDisabled,
                ]}
                onPress={handleDecrementPeople}
                disabled={personasAfectadas <= 1}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="remove"
                  size={20}
                  color={personasAfectadas <= 1 ? '#64748B' : '#F8FAFC'}
                />
              </TouchableOpacity>

              <Text style={styles.stepperValue}>{personasAfectadas}</Text>

              <TouchableOpacity
                style={styles.stepperButton}
                onPress={handleIncrementPeople}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={20} color="#F8FAFC" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Botón Principal: Procesar con IA */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={isProcessing}
          activeOpacity={0.85}
        >
          <Ionicons name="sparkles" size={22} color="#F8FAFC" style={styles.submitIcon} />
          <Text style={styles.submitButtonText}>Procesar con IA</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal de Selección de Provincia */}
      <Modal
        visible={isProvinceModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsProvinceModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeaderTitle}>Seleccione Provincia o Comarca</Text>
            <ScrollView style={styles.modalScrollView}>
              {PROVINCIAS.map((prov) => (
                <TouchableOpacity
                  key={prov}
                  style={[
                    styles.modalOptionItem,
                    province === prov && styles.modalOptionItemSelected,
                  ]}
                  onPress={() => {
                    setProvince(prov);
                    setIsProvinceModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      province === prov && styles.modalOptionTextSelected,
                    ]}
                  >
                    {prov}
                  </Text>
                  {province === prov && (
                    <Ionicons name="checkmark-circle" size={20} color="#3B82F6" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setIsProvinceModalVisible(false)}
            >
              <Text style={styles.modalCloseButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal / Overlay de Procesamiento con IA */}
      <Modal visible={isProcessing} transparent animationType="fade">
        <View style={styles.processingOverlay}>
          <View style={styles.processingDialog}>
            <ActivityIndicator size="large" color="#3B82F6" style={styles.spinner} />
            <Text style={styles.processingMainTitle}>Procesando con IA Local</Text>

            <View style={styles.stageList}>
              {audioUri.length > 0 && (
                <View style={styles.stageItem}>
                  <Ionicons
                    name={
                      processingStage === 'audio'
                        ? 'radio'
                        : 'checkmark-circle'
                    }
                    size={20}
                    color={
                      processingStage === 'audio'
                        ? '#F59E0B'
                        : '#22C55E'
                    }
                  />
                  <Text
                    style={[
                      styles.stageText,
                      processingStage === 'audio' && styles.stageTextActive,
                    ]}
                  >
                    Transcribiendo audio (Whisper)...
                  </Text>
                </View>
              )}

              <View style={styles.stageItem}>
                <Ionicons
                  name={processingStage === 'llm' ? 'radio' : 'ellipse-outline'}
                  size={20}
                  color={processingStage === 'llm' ? '#3B82F6' : '#64748B'}
                />
                <Text
                  style={[
                    styles.stageText,
                    processingStage === 'llm' && styles.stageTextActive,
                  ]}
                >
                  Generando clasificación START y necesidades...
                </Text>
              </View>
            </View>

            <Text style={styles.processingFooterNote}>
              Inferencia 100% on-device con QVAC • Sin internet
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    header: {
      marginBottom: 20,
      marginTop: 4,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: theme.text,
      letterSpacing: 0.5,
    },
    subtitle: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 4,
      lineHeight: 18,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      gap: 8,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.text,
    },
    textArea: {
      backgroundColor: theme.cardInner,
      borderRadius: 10,
      padding: 12,
      color: theme.text,
      fontSize: 14,
      minHeight: 110,
      borderWidth: 1,
      borderColor: theme.border,
      lineHeight: 20,
    },
    audioActionRow: {
      flexDirection: 'row',
      gap: 10,
    },
    audioButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    audioButtonRecord: {
      backgroundColor: theme.primary,
    },
    audioButtonRecording: {
      backgroundColor: theme.danger,
    },
    audioButtonFile: {
      backgroundColor: theme.cardInner,
      borderWidth: 1,
      borderColor: theme.border,
      flexDirection: 'row',
      gap: 6,
    },
    audioButtonContentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    recordingContentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    recordingPulseDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#FFFFFF',
    },
    audioButtonText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    audioFileButtonText: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    mediaBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.cardInner,
      borderRadius: 10,
      padding: 10,
      marginTop: 12,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 10,
    },
    mediaBadgeTextContainer: {
      flex: 1,
    },
    mediaBadgeTitle: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600',
    },
    mediaBadgeSubtitle: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    removeMediaButton: {
      padding: 4,
    },
    photoActionRow: {
      flexDirection: 'row',
      gap: 10,
    },
    photoButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    photoButtonCamera: {
      backgroundColor: theme.primary,
    },
    photoButtonGallery: {
      backgroundColor: theme.cardInner,
      borderWidth: 1,
      borderColor: theme.border,
    },
    photoButtonText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    photoGalleryButtonText: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    imagePreviewContainer: {
      marginTop: 12,
      alignSelf: 'center',
      position: 'relative',
    },
    imagePreview: {
      width: 200,
      height: 200,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    removeImageFloatingButton: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: 'rgba(239, 68, 68, 0.9)',
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addressMainButton: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
      backgroundColor: theme.primary,
    },
    addressMainButtonActive: {
      backgroundColor: theme.primaryDark,
      borderWidth: 2,
      borderColor: theme.primaryLight,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 4,
      elevation: 3,
    },
    addressMainButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    locationFormContainer: {},
    locationFormDisabled: {
      opacity: 0.35,
    },
    inputDisabledStyle: {
      backgroundColor: theme.cardInner,
      borderColor: theme.border,
      color: theme.textPlaceholder,
    },
    inputLabel: {
      fontSize: 12,
      color: theme.textMuted,
      fontWeight: '600',
      marginBottom: 6,
      marginTop: 8,
    },
    pickerSelector: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.cardInner,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    pickerSelectorText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
    inputField: {
      backgroundColor: theme.cardInner,
      borderRadius: 10,
      padding: 12,
      color: theme.text,
      fontSize: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    sectionSubtitle: {
      fontSize: 12,
      color: theme.textMuted,
      marginBottom: 10,
      marginTop: -2,
      lineHeight: 17,
    },
    symptomsChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    symptomChip: {
      backgroundColor: theme.cardInner,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 20,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    symptomChipActive: {
      backgroundColor: '#7F1D1D',
      borderColor: '#EF4444',
    },
    symptomChipText: {
      fontSize: 12,
      color: theme.textMuted,
      fontWeight: '600',
    },
    symptomChipTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    stepperContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.cardInner,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    stepperLabel: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: '600',
    },
    stepperControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    stepperButton: {
      backgroundColor: theme.primary,
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperButtonDisabled: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    stepperValue: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '800',
      minWidth: 28,
      textAlign: 'center',
    },
    submitButton: {
      backgroundColor: theme.primary,
      borderRadius: 14,
      paddingVertical: 18,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      marginTop: 8,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    submitIcon: {
      marginRight: 8,
    },
    submitButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.modalOverlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      backgroundColor: theme.modalBg,
      borderRadius: 16,
      width: '100%',
      maxHeight: '75%',
      padding: 18,
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalHeaderTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.text,
      marginBottom: 14,
      textAlign: 'center',
    },
    modalScrollView: {
      marginBottom: 12,
    },
    modalOptionItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    modalOptionItemSelected: {
      backgroundColor: theme.primaryMuted,
      borderRadius: 8,
    },
    modalOptionText: {
      color: theme.textMuted,
      fontSize: 14,
    },
    modalOptionTextSelected: {
      color: theme.primary,
      fontWeight: '700',
    },
    modalCloseButton: {
      backgroundColor: theme.cardInner,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalCloseButtonText: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: '700',
    },
    processingOverlay: {
      flex: 1,
      backgroundColor: theme.modalOverlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    processingDialog: {
      backgroundColor: theme.modalBg,
      borderRadius: 20,
      padding: 24,
      width: '100%',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    spinner: {
      marginBottom: 16,
    },
    processingMainTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.text,
      marginBottom: 20,
      textAlign: 'center',
    },
    stageList: {
      width: '100%',
      gap: 12,
      marginBottom: 20,
    },
    stageItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    stageText: {
      color: theme.textMuted,
      fontSize: 13,
    },
    stageTextActive: {
      color: theme.text,
      fontWeight: '700',
    },
    processingFooterNote: {
      fontSize: 11,
      color: theme.textPlaceholder,
      textAlign: 'center',
      fontStyle: 'italic',
    },
  });
}
