import React, { useState, useRef, useEffect } from 'react';
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
import { useRouter } from 'expo-router';
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

type ProcessingStage = 'audio' | 'image' | 'llm';

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

  // Estados del formulario
  const [textRelato, setTextRelato] = useState('');
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

    let initialStage: ProcessingStage = 'llm';
    if (hasAudio) {
      initialStage = 'audio';
    } else if (hasImage) {
      initialStage = 'image';
    }
    setProcessingStage(initialStage);

    // Configurar timers visuales para retroalimentación en pantalla
    if (stageTimerRef.current) {
      clearTimeout(stageTimerRef.current);
    }

    if (hasAudio && hasImage) {
      stageTimerRef.current = setTimeout(() => {
        setProcessingStage('image');
        stageTimerRef.current = setTimeout(() => {
          setProcessingStage('llm');
        }, 1800);
      }, 1600);
    } else if (hasAudio && !hasImage) {
      stageTimerRef.current = setTimeout(() => {
        setProcessingStage('llm');
      }, 1800);
    } else if (!hasAudio && hasImage) {
      stageTimerRef.current = setTimeout(() => {
        setProcessingStage('llm');
      }, 1800);
    }

    try {
      // 3. Ejecutar Pipeline de IA secuencial local
      const input: TriageInput = {
        textRelato: hasText ? textRelato.trim() : undefined,
        audioUri: hasAudio ? audioUri.trim() : undefined,
        imageUri: hasImage ? imageUri.trim() : undefined,
        province,
        district: district.trim() || undefined,
        corregimiento: corregimiento.trim() || undefined,
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
      report.status = 'confirmado';

      // 5. Guardar reporte en base de datos SQLite
      saveReport(db, report);
      console.log('[ReportarScreen] Reporte guardado como confirmado en SQLite.');

      // 6. Limpiar formulario
      setTextRelato('');
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

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
            <Ionicons name="document-text-outline" size={20} color="#3B82F6" />
            <Text style={styles.sectionTitle}>1. Relato de la Emergencia</Text>
          </View>
          <TextInput
            style={styles.textArea}
            placeholder="Describa la situación de emergencia..."
            placeholderTextColor="#64748B"
            multiline
            numberOfLines={5}
            value={textRelato}
            onChangeText={setTextRelato}
            textAlignVertical="top"
          />
        </View>

        {/* Sección 2: Audio (Nota de Voz) */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="mic-outline" size={20} color="#3B82F6" />
            <Text style={styles.sectionTitle}>2. Nota de Voz / Audio</Text>
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

        {/* Sección 3: Fotografía de la Escena */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="camera-outline" size={20} color="#3B82F6" />
            <Text style={styles.sectionTitle}>3. Foto de la Escena</Text>
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
              <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
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

        {/* Sección 4: Ubicación en Panamá */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="location-outline" size={20} color="#3B82F6" />
            <Text style={styles.sectionTitle}>4. Ubicación</Text>
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
              placeholderTextColor="#64748B"
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
              placeholderTextColor="#64748B"
              value={corregimiento}
              onChangeText={setCorregimiento}
              editable={!useSavedAddress}
            />
          </View>
        </View>

        {/* Sección 5: Personas Afectadas */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="people-outline" size={20} color="#3B82F6" />
            <Text style={styles.sectionTitle}>5. Personas Afectadas</Text>
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
              <View style={styles.stageItem}>
                <Ionicons
                  name={
                    processingStage === 'audio'
                      ? 'radio'
                      : processingStage === 'image' || processingStage === 'llm'
                      ? 'checkmark-circle'
                      : 'ellipse-outline'
                  }
                  size={20}
                  color={
                    processingStage === 'audio'
                      ? '#F59E0B'
                      : processingStage === 'image' || processingStage === 'llm'
                      ? '#22C55E'
                      : '#64748B'
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

              <View style={styles.stageItem}>
                <Ionicons
                  name={
                    processingStage === 'image'
                      ? 'radio'
                      : processingStage === 'llm'
                      ? 'checkmark-circle'
                      : 'ellipse-outline'
                  }
                  size={20}
                  color={
                    processingStage === 'image'
                      ? '#F59E0B'
                      : processingStage === 'llm'
                      ? '#22C55E'
                      : '#64748B'
                  }
                />
                <Text
                  style={[
                    styles.stageText,
                    processingStage === 'image' && styles.stageTextActive,
                  ]}
                >
                  Analizando imagen de escena...
                </Text>
              </View>

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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
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
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
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
    color: '#F8FAFC',
  },
  textArea: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 14,
    minHeight: 110,
    borderWidth: 1,
    borderColor: '#334155',
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
    backgroundColor: '#3B82F6',
  },
  audioButtonRecording: {
    backgroundColor: '#EF4444',
  },
  audioButtonFile: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
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
    backgroundColor: '#F8FAFC',
  },
  audioButtonText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  audioFileButtonText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  mediaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  mediaBadgeTextContainer: {
    flex: 1,
  },
  mediaBadgeTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  mediaBadgeSubtitle: {
    color: '#94A3B8',
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
    backgroundColor: '#3B82F6',
  },
  photoButtonGallery: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  photoButtonText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  photoGalleryButtonText: {
    color: '#94A3B8',
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
    borderColor: '#334155',
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
    backgroundColor: '#3B82F6',
  },
  addressMainButtonActive: {
    backgroundColor: '#1D4ED8',
    borderWidth: 2,
    borderColor: '#60A5FA',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  addressMainButtonText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  locationFormContainer: {
    transition: 'opacity 0.2s',
  },
  locationFormDisabled: {
    opacity: 0.35,
  },
  inputDisabledStyle: {
    backgroundColor: '#1E293B',
    borderColor: '#1E293B',
    color: '#64748B',
  },
  inputLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
  pickerSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pickerSelectorText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  inputField: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepperContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepperLabel: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepperButton: {
    backgroundColor: '#3B82F6',
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepperValue: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
    minWidth: 28,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 8,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitIcon: {
    marginRight: 8,
  },
  submitButtonText: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    width: '100%',
    maxHeight: '75%',
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
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
    borderBottomColor: '#334155',
  },
  modalOptionItemSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderRadius: 8,
  },
  modalOptionText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  modalOptionTextSelected: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  modalCloseButton: {
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalCloseButtonText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  processingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  processingDialog: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  spinner: {
    marginBottom: 16,
  },
  processingMainTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
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
    color: '#94A3B8',
    fontSize: 13,
  },
  stageTextActive: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  processingFooterNote: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
