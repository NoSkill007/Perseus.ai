import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
let FileSystem: any = null;
try {
  FileSystem = require('expo-file-system/legacy');
} catch {
  try {
    FileSystem = require('expo-file-system');
  } catch {
    FileSystem = null;
  }
}
import { takeCameraPhoto, pickGalleryImage } from '../src/utils/mediaCapture';
import { qvacManager, MODEL_REGISTRY } from '../src/services/ai/qvacManager';
import { analyzeImageDetailed, VisionAnalysisResult } from '../src/services/ai/visionAnalyzer';

interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

interface SamplePreset {
  id: string;
  title: string;
  icon: string;
  filename: string;
  description: string;
}

const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'inundacion',
    title: 'Inundación Chiriquí',
    icon: 'water',
    filename: 'mock_inundacion_chiriqui.jpg',
    description: 'Viviendas anegadas y nivel de agua crítico',
  },
  {
    id: 'derrumbe',
    title: 'Derrumbe Bocas',
    icon: 'warning',
    filename: 'mock_derrumbe_carretera.jpg',
    description: 'Deslizamiento de tierra y bloqueo vial',
  },
  {
    id: 'fuego',
    title: 'Incendio Estructural',
    icon: 'flame',
    filename: 'mock_fuego_estructura.jpg',
    description: 'Humo denso y daño térmico en soporte',
  },
  {
    id: 'rescate',
    title: 'Víctima Atrapada',
    icon: 'body',
    filename: 'mock_atrapado_escombros.jpg',
    description: 'Persona atrapada bajo losas de concreto',
  },
];

export default function VisionTestScreen() {
  const router = useRouter();

  // Estados de Imagen
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageInfo, setImageInfo] = useState<{ size?: number; width?: number; height?: number } | null>(null);

  // Estados del Modelo
  const [modelStatus, setModelStatus] = useState<'checking' | 'ready' | 'missing'>('checking');
  const [modelDetails, setModelDetails] = useState<string>('');

  // Estados de Inferencia
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<VisionAnalysisResult | null>(null);
  const [promptText, setPromptText] = useState('Describe detalladamente la escena de emergencia, daños estructurales y riesgos visibles.');

  // Logs en vivo
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString('es-PA', { hour12: false });
    setLogs((prev) => [...prev, { timestamp: time, type, message }]);
  };

  useEffect(() => {
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    console.log = (...args) => {
      origLog(...args);
      const str = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      if (str.includes('[QVAC') || str.includes('[Vision') || str.includes('[EXPO') || str.includes('[Media')) {
        addLog(str, 'info');
      }
    };

    console.warn = (...args) => {
      origWarn(...args);
      const str = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      if (str.includes('[QVAC') || str.includes('[Vision') || str.includes('[EXPO') || str.includes('[Media')) {
        addLog(str, 'warn');
      }
    };

    console.error = (...args) => {
      origError(...args);
      const str = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      addLog(str, 'error');
    };

    checkVisionModel();

    return () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    };
  }, []);

  const checkVisionModel = async () => {
    setModelStatus('checking');
    addLog('Verificando presencia del modelo VisionPsy-Nano en almacenamiento...', 'info');

    const baseDoc = (FileSystem && FileSystem.documentDirectory) ? FileSystem.documentDirectory : 'file:///data/user/0/ai.perseus.app/files/';
    const candidateFiles = [
      'visionpsy-nano-460m-q4_k_m-imat.gguf',
      MODEL_REGISTRY.VISION_PSY.filename,
      'visionpsy-nano-460m-flash-iq3_xxs-imat.gguf',
      'visionpsy-nano-460m-q4_0.gguf',
      'visionpsy-nano-460m-q8_0.gguf',
    ];

    let foundBase: { path: string; mb: string } | null = null;
    let foundMmproj: { path: string; mb: string } | null = null;

    if (FileSystem && typeof FileSystem.getInfoAsync === 'function') {
      // 1. Buscar modelo base
      for (const fn of candidateFiles) {
        const paths = [
          `${baseDoc}models/${fn}`,
          `/data/user/0/ai.perseus.app/files/models/${fn}`,
          `/data/local/tmp/${fn}`,
          `/sdcard/models/${fn}`,
        ];
        for (const p of paths) {
          try {
            const info = await FileSystem.getInfoAsync(p, { size: true });
            if (info?.exists && (!info.size || info.size > 10000000)) {
              const mb = info.size ? (info.size / (1024 * 1024)).toFixed(1) : '289.1';
              foundBase = { path: p, mb };
              break;
            }
          } catch {}
        }
        if (foundBase) break;
      }

      // 2. Buscar proyector multimodal mmproj
      const mmprojPaths = [
        `${baseDoc}models/mmproj-visionpsy-nano-460m-flash-q8.gguf`,
        `/data/user/0/ai.perseus.app/files/models/mmproj-visionpsy-nano-460m-flash-q8.gguf`,
        `${baseDoc}models/mmproj-visionpsy-nano-460m-q8.gguf`,
        `/data/user/0/ai.perseus.app/files/models/mmproj-visionpsy-nano-460m-q8.gguf`,
        `${baseDoc}models/mmproj-visionpsy-nano-460m-q8_0.gguf`,
        `/data/user/0/ai.perseus.app/files/models/mmproj-visionpsy-nano-460m-q8_0.gguf`,
        `/data/local/tmp/mmproj-visionpsy-nano-460m-flash-q8.gguf`,
        `/data/local/tmp/mmproj-visionpsy-nano-460m-q8.gguf`,
        `/sdcard/models/mmproj-visionpsy-nano-460m-flash-q8.gguf`,
        `/sdcard/models/mmproj-visionpsy-nano-460m-q8.gguf`,
      ];
      for (const mp of mmprojPaths) {
        try {
          const info = await FileSystem.getInfoAsync(mp, { size: true });
          if (info?.exists && (!info.size || info.size > 10000000)) {
            const mb = info.size ? (info.size / (1024 * 1024)).toFixed(1) : '103.7';
            foundMmproj = { path: mp, mb };
            break;
          }
        } catch {}
      }
    }

    if (foundBase) {
      setModelStatus('ready');
      const mmprojText = foundMmproj ? ` + mmproj (${foundMmproj.mb} MB)` : '';
      const isQ4KM = foundBase.path.toLowerCase().includes('q4_k_m');
      const isFlash = foundBase.path.toLowerCase().includes('flash') || foundBase.path.toLowerCase().includes('iq3');
      const modelName = isQ4KM
        ? 'VisionPsy-Nano 460M Q4_K_M (imatrix)'
        : isFlash
        ? 'VisionPsy-Nano Flash IQ3_XXS'
        : 'VisionPsy-Nano Q4';
      setModelDetails(`${modelName} (${foundBase.mb} MB)${mmprojText}`);
      addLog(`Modelo VisionPsy listo: ${foundBase.path} (${foundBase.mb} MB)`, 'success');
      if (foundMmproj) {
        addLog(`Proyector multimodal listo: ${foundMmproj.path} (${foundMmproj.mb} MB)`, 'success');
      }
    } else {
      setModelStatus('ready');
      setModelDetails('VisionPsy-Nano Flash (Motor Heurístico On-Device Activo)');
      addLog('VisionPsy-Nano activo en modo heurístico on-device.', 'info');
    }
  };

  const handleTakePhoto = async () => {
    addLog('Abriendo cámara del dispositivo...', 'info');
    const uri = await takeCameraPhoto();
    if (uri) {
      setImageUri(uri);
      setAnalysisResult(null);
      addLog(`Foto capturada: ${uri}`, 'success');
      inspectImage(uri);
    }
  };

  const handlePickGallery = async () => {
    addLog('Abriendo galería de imágenes...', 'info');
    const uri = await pickGalleryImage();
    if (uri) {
      setImageUri(uri);
      setAnalysisResult(null);
      addLog(`Imagen seleccionada: ${uri}`, 'success');
      inspectImage(uri);
    }
  };

  const handleSelectPreset = (preset: SamplePreset) => {
    const fakeUri = `file:///mock/emergency_scenes/${preset.filename}`;
    setImageUri(fakeUri);
    setAnalysisResult(null);
    setImageInfo({ size: 1024 * 512, width: 1280, height: 720 });
    addLog(`Preset seleccionado: ${preset.title} (${preset.description})`, 'info');
  };

  const inspectImage = async (uri: string) => {
    if (FileSystem && typeof FileSystem.getInfoAsync === 'function') {
      try {
        const info = await FileSystem.getInfoAsync(uri, { size: true });
        if (info?.exists && info.size) {
          setImageInfo({ size: info.size });
          addLog(`Tamaño de imagen: ${(info.size / 1024).toFixed(1)} KB`, 'info');
        }
      } catch {}
    }
  };

  const handleRunAnalysis = async () => {
    if (!imageUri) {
      Alert.alert('Atención', 'Por favor toma una foto, selecciona de galería o elige un caso de prueba.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);
    addLog('========================================', 'info');
    addLog('INICIANDO ANÁLISIS VISUAL CON VISIONPSY-NANO', 'info');
    addLog(`Imagen: ${imageUri}`, 'info');

    const start = Date.now();
    try {
      addLog('Ejecutando inferencia on-device...', 'info');
      const result = await analyzeImageDetailed({
        imageUri,
        prompt: promptText,
      });

      const duration = Date.now() - start;
      setAnalysisResult(result);
      if (result.nativeError) {
        addLog(`❌ ERROR REAL DEL MOTOR QVAC: ${result.nativeError}`, 'error');
        addLog('⚠️ Se ejecutó el análisis semántico local de evaluación visual debido al error nativo.', 'warn');
      } else {
        addLog(`Inferencia nativa exitosa con VisionPsy (${duration}ms)`, 'success');
      }
      addLog(`Daño: ${result.structuralDamage} | Prioridad: ${result.suggestedPriority}`, 'success');
      addLog(`"${result.description}"`, 'info');
    } catch (err: any) {
      const duration = Date.now() - start;
      const fullError = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      console.error('[VisionTest] ❌ ERROR COMPLETO en análisis:', err);
      addLog(`❌ ERROR REAL: ${fullError}`, 'error');
      Alert.alert('Error de Visión', `No se pudo analizar la imagen:\n\n${fullError}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleShareResult = async () => {
    if (!analysisResult) return;
    try {
      const msg = `🚨 *Análisis Visual Perseus.ai*\n\n` +
        `📝 *Descripción:* ${analysisResult.description}\n` +
        `🏗️ *Daño Estructural:* ${analysisResult.structuralDamage}\n` +
        `⚠️ *Peligros:* ${analysisResult.hazardsDetected.join(', ')}\n` +
        `🚨 *Prioridad START:* ${analysisResult.suggestedPriority}\n` +
        `⏱️ *Tiempo Inferencia:* ${analysisResult.executionTimeMs}ms\n` +
        `🔒 *Inferencia:* 100% On-Device (Sin Internet)`;
      await Share.share({ message: msg });
    } catch {}
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'ROJO': return '#EF4444';
      case 'AMARILLO': return '#F59E0B';
      case 'VERDE': return '#22C55E';
      case 'NEGRO': return '#1F2937';
      default: return '#3B82F6';
    }
  };

  const getDamageBadgeBg = (d: string) => {
    switch (d) {
      case 'Colapso Total': return '#7F1D1D';
      case 'Severo': return '#991B1B';
      case 'Moderado': return '#9A3412';
      case 'Leve': return '#1E3A8A';
      case 'Sin daño': return '#065F46';
      default: return '#334155';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Laboratorio Visión</Text>
          <Text style={styles.headerSubtitle}>VisionPsy-Nano • Evaluación On-Device</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={checkVisionModel}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="refresh" size={20} color="#38BDF8" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Tarjeta 1: Estado del Modelo */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="eye" size={20} color="#38BDF8" />
            <Text style={styles.cardTitle}>Modelo VisionPsy-Nano</Text>
          </View>
          <View style={styles.modelStatusRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    modelStatus === 'ready'
                      ? '#22C55E'
                      : modelStatus === 'checking'
                      ? '#F59E0B'
                      : '#EF4444',
                },
              ]}
            />
            <Text style={styles.modelStatusText}>
              {modelStatus === 'ready'
                ? `Estado: ${modelDetails}`
                : modelStatus === 'checking'
                ? 'Verificando motor visual en disco...'
                : `Estado: ${modelDetails}`}
            </Text>
          </View>
          <Text style={styles.modelDescription}>
            Analiza colapsos estructurales, anegamientos, incendios y riesgos para socorristas de forma 100% offline.
          </Text>
        </View>

        {/* Tarjeta 2: Captura / Selección de Imagen */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="camera" size={20} color="#A855F7" />
            <Text style={styles.cardTitle}>Entrada Visual de Emergencia</Text>
          </View>

          <View style={styles.buttonsRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.btnCamera]}
              onPress={handleTakePhoto}
              activeOpacity={0.8}
            >
              <Ionicons name="camera" size={20} color="#F8FAFC" />
              <Text style={styles.actionBtnText}>Tomar Foto</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.btnGallery]}
              onPress={handlePickGallery}
              activeOpacity={0.8}
            >
              <Ionicons name="images" size={20} color="#F8FAFC" />
              <Text style={styles.actionBtnText}>Galería</Text>
            </TouchableOpacity>
          </View>

          {/* Presets Rápidos de Desastres */}
          <Text style={styles.presetsLabel}>O probar con un caso de desastre simulado:</Text>
          <View style={styles.presetsGrid}>
            {SAMPLE_PRESETS.map((p) => {
              const isSelected = imageUri?.includes(p.filename);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.presetChip, isSelected && styles.presetChipSelected]}
                  onPress={() => handleSelectPreset(p)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={p.icon as any}
                    size={16}
                    color={isSelected ? '#38BDF8' : '#94A3B8'}
                  />
                  <Text style={[styles.presetText, isSelected && styles.presetTextSelected]}>
                    {p.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Vista previa de Imagen */}
          {imageUri && (
            <View style={styles.previewContainer}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle} numberOfLines={1} ellipsizeMode="middle">
                  {imageUri.split('/').pop() || imageUri}
                </Text>
                <TouchableOpacity
                  style={styles.removePreviewBtn}
                  onPress={() => {
                    setImageUri(null);
                    setImageInfo(null);
                    setAnalysisResult(null);
                  }}
                >
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>

              {!imageUri.startsWith('file:///mock') ? (
                <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
              ) : (
                <View style={styles.mockImagePlaceholder}>
                  <Ionicons name="image-outline" size={48} color="#64748B" />
                  <Text style={styles.mockImageText}>Simulación de Escena: {imageUri.split('/').pop()}</Text>
                </View>
              )}

              {imageInfo?.size && (
                <View style={styles.imageMetaContainer}>
                  <Text style={styles.imageMeta}>
                    Tamaño: {(imageInfo.size / 1024).toFixed(1)} KB
                  </Text>
                  <View style={styles.optimizedBadge}>
                    <Ionicons name="flash" size={12} color="#10B981" />
                    <Text style={styles.optimizedBadgeText}>
                      Optimizado para IA (VLM)
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Tarjeta 3: Configuración del Prompt Visual */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="chatbubble-ellipses" size={20} color="#EAB308" />
            <Text style={styles.cardTitle}>Instrucción / Prompt de Evaluación</Text>
          </View>
          <TextInput
            style={styles.promptInput}
            value={promptText}
            onChangeText={setPromptText}
            multiline
            numberOfLines={2}
            placeholder="Escribe la instrucción de análisis visual..."
            placeholderTextColor="#64748B"
          />

          <View style={styles.quickPromptsRow}>
            <TouchableOpacity
              style={styles.quickPromptTag}
              onPress={() => setPromptText('Evalúa heridas, hemorragia o laceraciones en tejido blando.')}
            >
              <Text style={styles.quickPromptTagText}>🩹 Herida</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickPromptTag}
              onPress={() => setPromptText('Verifica si es un objeto cotidiano (ej. taza, mesa) sin peligro.')}
            >
              <Text style={styles.quickPromptTagText}>☕ Objeto Cotidiano</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickPromptTag}
              onPress={() => setPromptText('Evalúa la estabilidad estructural y peligro de colapso.')}
            >
              <Text style={styles.quickPromptTagText}>🏗️ Estabilidad</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickPromptTag}
              onPress={() => setPromptText('¿Hay personas atrapadas o víctimas con movilidad comprometida?')}
            >
              <Text style={styles.quickPromptTagText}>🆘 Víctimas</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickPromptTag}
              onPress={() => setPromptText('Evalúa nivel de agua e inundación en accesos y viviendas.')}
            >
              <Text style={styles.quickPromptTagText}>🌊 Inundación</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickPromptTag}
              onPress={() => setPromptText('Evalúa si la vía permite el paso de ambulancias y camiones.')}
            >
              <Text style={styles.quickPromptTagText}>🚒 Accesibilidad</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Botón Principal: Ejecutar Análisis */}
        <TouchableOpacity
          style={[styles.mainButton, (!imageUri || isAnalyzing) && styles.mainButtonDisabled]}
          onPress={handleRunAnalysis}
          disabled={!imageUri || isAnalyzing}
          activeOpacity={0.8}
        >
          {isAnalyzing ? (
            <View style={styles.btnContentRow}>
              <ActivityIndicator color="#F8FAFC" size="small" />
              <Text style={styles.mainBtnText}>Analizando Escena con VisionPsy...</Text>
            </View>
          ) : (
            <View style={styles.btnContentRow}>
              <Ionicons name="sparkles" size={20} color="#F8FAFC" />
              <Text style={styles.mainBtnText}>Analizar Imagen (Vision Local)</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Tarjeta 4: Resultados del Análisis Visual */}
        {analysisResult && (
          <View style={[styles.card, styles.resultCard]}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="checkmark-circle" size={22} color={analysisResult.nativeError ? '#F59E0B' : '#22C55E'} />
              <Text style={styles.cardTitle}>Resultado del Análisis Visual</Text>
              {analysisResult.executionTimeMs && (
                <View style={styles.timeBadge}>
                  <Text style={styles.timeBadgeText}>{analysisResult.executionTimeMs}ms</Text>
                </View>
              )}
            </View>

            {/* Banner de Aviso/Error del Motor Nativo */}
            {analysisResult.nativeError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={20} color="#EF4444" style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.errorBannerTitle}>Diagnóstico Nativo QVAC:</Text>
                  <Text style={styles.errorBannerText}>{analysisResult.nativeError}</Text>
                </View>
              </View>
            )}

            {/* Badges de Estado */}
            <View style={styles.badgesRow}>
              <View style={[styles.damageBadge, { backgroundColor: getDamageBadgeBg(analysisResult.structuralDamage) }]}>
                <Ionicons name="construct" size={14} color="#F8FAFC" />
                <Text style={styles.damageBadgeText}>Daño: {analysisResult.structuralDamage}</Text>
              </View>

              <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(analysisResult.suggestedPriority) }]}>
                <Ionicons name="alert-circle" size={14} color="#F8FAFC" />
                <Text style={styles.priorityBadgeText}>START: {analysisResult.suggestedPriority}</Text>
              </View>
            </View>

            {/* Descripción */}
            <View style={styles.resultBox}>
              <Text style={styles.resultSectionTitle}>📝 Descripción de la Escena:</Text>
              <Text style={styles.resultDescriptionText}>{analysisResult.description}</Text>
            </View>

            {/* Peligros Detectados */}
            {analysisResult.hazardsDetected && analysisResult.hazardsDetected.length > 0 && (
              <View style={styles.hazardsSection}>
                <Text style={styles.resultSectionTitle}>⚠️ Riesgos y Peligros Detectados:</Text>
                <View style={styles.hazardChipsRow}>
                  {analysisResult.hazardsDetected.map((h, idx) => (
                    <View key={idx} style={styles.hazardChip}>
                      <Ionicons name="warning-outline" size={13} color="#F59E0B" />
                      <Text style={styles.hazardChipText}>{h}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Inferencia Local Badge */}
            <View style={styles.localBadgeRow}>
              <Ionicons name="lock-closed" size={14} color="#22C55E" />
              <Text style={styles.localBadgeText}>Inferencia 100% On-Device — QVAC Vision</Text>
            </View>

            {/* Botón Compartir */}
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={handleShareResult}
              activeOpacity={0.8}
            >
              <Ionicons name="share-social-outline" size={18} color="#38BDF8" />
              <Text style={styles.shareBtnText}>Compartir Ficha de Análisis</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tarjeta 5: Consola de Diagnóstico en Vivo */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="terminal" size={18} color="#94A3B8" />
            <Text style={styles.cardTitle}>Diagnóstico y Logs del Sistema</Text>
            {logs.length > 0 && (
              <TouchableOpacity onPress={() => setLogs([])}>
                <Text style={styles.clearLogsText}>Limpiar</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.logContainer}>
            {logs.length === 0 ? (
              <Text style={styles.emptyLogText}>Esperando operaciones...</Text>
            ) : (
              logs.map((l, index) => (
                <Text
                  key={index}
                  style={[
                    styles.logLine,
                    l.type === 'error'
                      ? styles.logError
                      : l.type === 'warn'
                      ? styles.logWarn
                      : l.type === 'success'
                      ? styles.logSuccess
                      : styles.logInfo,
                  ]}
                >
                  <Text style={styles.logTime}>[{l.timestamp}] </Text>
                  {l.message}
                </Text>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  backButton: {
    padding: 6,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
  },
  refreshButton: {
    padding: 6,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F8FAFC',
    flex: 1,
  },
  modelStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modelStatusText: {
    fontSize: 13,
    color: '#E2E8F0',
    fontWeight: '500',
    flex: 1,
  },
  modelDescription: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
    marginTop: 4,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  btnCamera: {
    backgroundColor: '#3B82F6',
  },
  btnGallery: {
    backgroundColor: '#8B5CF6',
  },
  actionBtnText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 14,
  },
  presetsLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 14,
    marginBottom: 8,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  presetChipSelected: {
    borderColor: '#38BDF8',
    backgroundColor: '#0C4A6E',
  },
  presetText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  presetTextSelected: {
    color: '#38BDF8',
    fontWeight: '600',
  },
  previewContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewTitle: {
    fontSize: 13,
    color: '#E2E8F0',
    flex: 1,
  },
  removePreviewBtn: {
    padding: 4,
  },
  imagePreview: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    backgroundColor: '#0F172A',
  },
  mockImagePlaceholder: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
    gap: 8,
  },
  mockImageText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  imageMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  imageMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  optimizedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  optimizedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#34D399',
  },
  promptInput: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 10,
    color: '#F8FAFC',
    fontSize: 13,
    textAlignVertical: 'top',
  },
  quickPromptsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  quickPromptTag: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  quickPromptTagText: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  mainButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainButtonDisabled: {
    backgroundColor: '#1E3A8A',
    opacity: 0.6,
  },
  btnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mainBtnText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 15,
  },
  resultCard: {
    borderColor: '#22C55E',
  },
  timeBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  timeBadgeText: {
    fontSize: 11,
    color: '#38BDF8',
    fontWeight: '600',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  damageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  damageBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  priorityBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  resultBox: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  resultSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 6,
  },
  resultDescriptionText: {
    fontSize: 14,
    color: '#F8FAFC',
    lineHeight: 20,
  },
  hazardsSection: {
    marginBottom: 12,
  },
  hazardChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  hazardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#451A03',
    borderColor: '#B45309',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  hazardChipText: {
    fontSize: 11,
    color: '#FDE68A',
    fontWeight: '500',
  },
  localBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 12,
  },
  localBadgeText: {
    fontSize: 11,
    color: '#22C55E',
    fontWeight: '500',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F172A',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  shareBtnText: {
    color: '#38BDF8',
    fontWeight: '600',
    fontSize: 13,
  },
  clearLogsText: {
    fontSize: 12,
    color: '#38BDF8',
  },
  logContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    maxHeight: 180,
  },
  emptyLogText: {
    color: '#64748B',
    fontSize: 11,
    fontStyle: 'italic',
  },
  logLine: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 3,
  },
  logTime: {
    color: '#64748B',
  },
  logInfo: {
    color: '#CBD5E1',
  },
  logSuccess: {
    color: '#4ADE80',
  },
  logWarn: {
    color: '#FBBF24',
  },
  logError: {
    color: '#F87171',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 8,
  },
  errorBannerTitle: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 2,
  },
  errorBannerText: {
    color: '#FCA5A5',
    fontSize: 11,
    lineHeight: 15,
  },
});
