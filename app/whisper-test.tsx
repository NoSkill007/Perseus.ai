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
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
let FileSystem: any = null;
try {
  FileSystem = require('expo-file-system/legacy');
} catch {
  FileSystem = require('expo-file-system');
}
import { startAudioRecording, stopAudioRecording, pickAudioFile } from '../src/utils/mediaCapture';
import { qvacManager, MODEL_REGISTRY } from '../src/services/ai/qvacManager';
import { transcribeAudioLocally } from '../src/services/ai/audioTranscriber';

interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export default function WhisperTestScreen() {
  const router = useRouter();

  // Estados de audio
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingObj, setRecordingObj] = useState<Audio.Recording | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioSize, setAudioSize] = useState<number | null>(null);
  const [soundObj, setSoundObj] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Estados del modelo
  const [modelStatus, setModelStatus] = useState<'checking' | 'ready' | 'missing'>('checking');
  const [modelDetails, setModelDetails] = useState<string>('');

  // Estados de inferencia
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribedText, setTranscribedText] = useState<string>('');
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [promptGuide, setPromptGuide] = useState('Emergencia, rescate, personas atrapadas, heridos en Panamá');

  // Logs en vivo
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (str.includes('[QVAC') || str.includes('[Audio') || str.includes('[EXPO') || str.includes('[Bare') || str.includes('Whisper')) {
        addLog(str, 'info');
      }
    };

    console.warn = (...args) => {
      origWarn(...args);
      const str = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      if (str.includes('[QVAC') || str.includes('[Audio') || str.includes('[EXPO') || str.includes('[Bare') || str.includes('Whisper')) {
        addLog(str, 'warn');
      }
    };

    console.error = (...args) => {
      origError(...args);
      const str = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      addLog(str, 'error');
    };

    checkWhisperModel();
    return () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
      if (timerRef.current) clearInterval(timerRef.current);
      if (soundObj) {
        soundObj.unloadAsync();
      }
    };
  }, []);

  const checkWhisperModel = async () => {
    setModelStatus('checking');
    addLog('Verificando presencia del modelo Whisper en disco...', 'info');

    const config = MODEL_REGISTRY.ASR_WHISPER;
    const baseDoc = FileSystem.documentDirectory || 'file:///data/user/0/ai.perseus.app/files/';
    const candidatePaths = [
      `${baseDoc}models/${config.filename}`,
      `file:///data/user/0/ai.perseus.app/files/models/${config.filename}`,
      `/data/user/0/ai.perseus.app/files/models/${config.filename}`,
      `${baseDoc}${config.filename}`,
      config.localPath,
    ];

    let found = false;
    for (const path of candidatePaths) {
      try {
        const info = await FileSystem.getInfoAsync(path, { size: true });
        if (info.exists && (!info.size || info.size > 10000000)) {
          const mb = info.size ? (info.size / (1024 * 1024)).toFixed(1) : '41.5';
          setModelStatus('ready');
          setModelDetails(`${config.filename} (${mb} MB)`);
          addLog(`Modelo Whisper listo en: ${path} (${mb} MB)`, 'success');
          found = true;
          break;
        }
      } catch {}
    }

    if (!found) {
      setModelStatus('missing');
      setModelDetails('Archivo no encontrado o incompleto');
      addLog(`${config.filename} no encontrado en rutas estándar.`, 'warn');
    }
  };

  const handleToggleRecord = async () => {
    if (isRecording) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
      addLog('Deteniendo grabación de audio...', 'info');

      if (recordingObj) {
        const uri = await stopAudioRecording(recordingObj);
        setRecordingObj(null);
        if (uri) {
          setAudioUri(uri);
          addLog(`Audio grabado: ${uri}`, 'success');
          try {
            const info = await FileSystem.getInfoAsync(uri);
            if (info.exists && info.size) {
              setAudioSize(info.size);
              addLog(`Tamaño del audio: ${(info.size / 1024).toFixed(1)} KB`, 'info');
            }
          } catch {}
        }
      }
    } else {
      addLog('Solicitando micrófono e iniciando grabación...', 'info');
      setRecordingTime(0);
      const recording = await startAudioRecording((status) => {
        if (status.isRecording) {
          setRecordingTime(Math.floor(status.durationMillis / 1000));
        }
      });

      if (recording) {
        setRecordingObj(recording);
        setIsRecording(true);
        addLog('Grabación iniciada.', 'info');
      } else {
        addLog('Fallo al inicializar grabación de micrófono.', 'error');
      }
    }
  };

  const handlePickFile = async () => {
    addLog('Abriendo explorador de archivos...', 'info');
    const uri = await pickAudioFile();
    if (uri) {
      setAudioUri(uri);
      addLog(`Archivo seleccionado: ${uri}`, 'success');
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists && info.size) {
          setAudioSize(info.size);
          addLog(`Tamaño del archivo: ${(info.size / 1024).toFixed(1)} KB`, 'info');
        }
      } catch {}
    }
  };

  const handlePlaySound = async () => {
    if (!audioUri) return;
    try {
      if (isPlaying && soundObj) {
        await soundObj.stopAsync();
        setIsPlaying(false);
        return;
      }

      if (soundObj) {
        await soundObj.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync({ uri: audioUri });
      setSoundObj(sound);
      setIsPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });
      await sound.playAsync();
    } catch (err: any) {
      addLog(`Error al reproducir audio: ${err.message}`, 'error');
    }
  };

  const handleRunWhisper = async () => {
    if (!audioUri) {
      Alert.alert('Atención', 'Por favor graba o selecciona un archivo de audio primero.');
      return;
    }

    setIsTranscribing(true);
    setTranscribedText('');
    setExecutionTime(null);
    addLog('========================================', 'info');
    addLog('INICIANDO PRUEBA DE TRANSCRIPCIÓN WHISPER', 'info');
    addLog(`Ruta de audio: ${audioUri}`, 'info');

    const start = Date.now();
    try {
      addLog('Llamando a transcribeAudioLocally...', 'info');
      const text = await transcribeAudioLocally({ audioUri });
      const duration = Date.now() - start;
      setExecutionTime(duration);

      if (text && text.trim().length > 0) {
        setTranscribedText(text);
        addLog(`Transcripción completada en ${duration}ms:`, 'success');
        addLog(`"${text}"`, 'success');
      } else {
        setTranscribedText('(Whisper no generó texto para este audio)');
        addLog(`Whisper finalizó sin texto en ${duration}ms.`, 'warn');
      }
    } catch (err: any) {
      const duration = Date.now() - start;
      setExecutionTime(duration);
      addLog(`ERROR: ${err.name || 'Error'}: ${err.message}`, 'error');
      if (err.stack) {
        addLog(`Stack: ${err.stack.slice(0, 200)}...`, 'error');
      }
      Alert.alert(
        'Diagnóstico de Whisper',
        `No se pudo completar la inferencia:\n\n${err.message || 'Error nativo'}`
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTestBareKit = async () => {
    addLog('--- PRUEBA RÁPIDA DE BARE-KIT NATIVO ---', 'info');
    try {
      addLog('Importando react-native-bare-kit...', 'info');
      const bareKit = await import('react-native-bare-kit');
      addLog('Creando Worklet ligero de prueba...', 'info');
      const worklet = new bareKit.Worklet();
      addLog('Worklet instanciado con éxito.', 'success');

      const testSource = `
        const { IPC } = BareKit;
        IPC.on('data', (data) => {
          IPC.write(Buffer.from('RESPUESTA: ' + data.toString()));
        });
        IPC.write(Buffer.from('BARE-KIT ESTÁ VIVO'));
      `;

      addLog('Invocando worklet.start("/test.js")...', 'info');
      worklet.start('/test.js', testSource);
      addLog('worklet.start("/test.js") ejecutado sin abortar!', 'success');

      if (worklet.IPC) {
        worklet.IPC.on('data', (data: any) => {
          let text = '';
          try {
            if (typeof TextDecoder !== 'undefined') {
              text = new TextDecoder().decode(data);
            } else if (data?.toString) {
              text = data.toString();
            }
          } catch {
            text = String(data);
          }
          addLog(`[IPC Event] Bare respondió: "${text}"`, 'success');
        });
        setTimeout(() => {
          try {
            worklet.IPC.write(Buffer.from('Hola desde React Native'));
          } catch {}
        }, 300);
      }
    } catch (err: any) {
      addLog(`Error en Bare-Kit: ${err.message}`, 'error');
    }
  };

  const handleShareText = async () => {
    if (!transcribedText) return;
    try {
      await Share.share({ message: transcribedText });
    } catch {}
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Laboratorio Whisper</Text>
          <Text style={styles.headerSubtitle}>Prueba aislada de voz on-device</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={checkWhisperModel}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="refresh" size={20} color="#38BDF8" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="cube" size={20} color="#38BDF8" />
            <Text style={styles.cardTitle}>Modelo Whisper (Tiny Q8_0)</Text>
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
                ? `Modelo disponible: ${modelDetails}`
                : modelStatus === 'checking'
                ? 'Verificando archivo en disco...'
                : `Estado: ${modelDetails}`}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.bareTestBtn}
            onPress={handleTestBareKit}
            activeOpacity={0.8}
          >
            <Ionicons name="hardware-chip-outline" size={16} color="#38BDF8" />
            <Text style={styles.bareTestBtnText}>🧪 Probar Conexión Bare-Kit (Ping-Pong)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="mic" size={20} color="#A855F7" />
            <Text style={styles.cardTitle}>Entrada de Audio</Text>
          </View>

          <View style={styles.buttonsRow}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                isRecording ? styles.btnRecording : styles.btnRecord,
              ]}
              onPress={handleToggleRecord}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isRecording ? 'stop-circle' : 'mic'}
                size={22}
                color="#F8FAFC"
              />
              <Text style={styles.actionBtnText}>
                {isRecording ? `Detener (${recordingTime}s)` : 'Grabar Audio'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.btnPick]}
              onPress={handlePickFile}
              disabled={isRecording}
              activeOpacity={0.8}
            >
              <Ionicons name="folder-open" size={20} color="#F8FAFC" />
              <Text style={styles.actionBtnText}>Cargar Archivo</Text>
            </TouchableOpacity>
          </View>

          {audioUri && (
            <View style={styles.audioPreviewCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.audioPath} numberOfLines={1} ellipsizeMode="middle">
                  {audioUri.split('/').pop() || audioUri}
                </Text>
                {audioSize && (
                  <Text style={styles.audioMeta}>
                    Tamaño: {(audioSize / 1024).toFixed(1)} KB
                  </Text>
                )}
              </View>

              <View style={styles.audioControlButtons}>
                <TouchableOpacity
                  style={styles.circleButton}
                  onPress={handlePlaySound}
                >
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={18}
                    color="#F8FAFC"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.circleButton, { backgroundColor: '#451A1A' }]}
                  onPress={() => {
                    setAudioUri(null);
                    setAudioSize(null);
                  }}
                >
                  <Ionicons name="trash" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="settings" size={20} color="#F59E0B" />
            <Text style={styles.cardTitle}>Guía de Contexto / Prompt</Text>
          </View>
          <TextInput
            style={styles.promptInput}
            value={promptGuide}
            onChangeText={setPromptGuide}
            placeholder="Palabras clave para orientar a Whisper..."
            placeholderTextColor="#64748B"
          />

          <TouchableOpacity
            style={[
              styles.runButton,
              (!audioUri || isTranscribing) && styles.runButtonDisabled,
            ]}
            onPress={handleRunWhisper}
            disabled={!audioUri || isTranscribing}
            activeOpacity={0.85}
          >
            {isTranscribing ? (
              <View style={styles.runButtonContent}>
                <ActivityIndicator color="#F8FAFC" size="small" />
                <Text style={styles.runButtonText}>Transcribiendo con Whisper...</Text>
              </View>
            ) : (
              <View style={styles.runButtonContent}>
                <Ionicons name="flash" size={20} color="#F8FAFC" />
                <Text style={styles.runButtonText}>Ejecutar Whisper ASR</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="document-text" size={20} color="#22C55E" />
            <Text style={styles.cardTitle}>Texto Transcrito</Text>
            {executionTime !== null && (
              <View style={styles.timeBadge}>
                <Text style={styles.timeBadgeText}>{executionTime} ms</Text>
              </View>
            )}
          </View>

          <View style={styles.resultBox}>
            {transcribedText ? (
              <Text style={styles.resultText}>{transcribedText}</Text>
            ) : (
              <Text style={styles.resultPlaceholder}>
                El texto resultante de la transcripción aparecerá aquí...
              </Text>
            )}
          </View>

          {transcribedText ? (
            <TouchableOpacity style={styles.shareBtn} onPress={handleShareText}>
              <Ionicons name="share-outline" size={18} color="#38BDF8" />
              <Text style={styles.shareBtnText}>Copiar / Compartir Texto</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="terminal" size={20} color="#94A3B8" />
            <Text style={styles.cardTitle}>Consola de Diagnóstico</Text>
            <TouchableOpacity
              onPress={() => setLogs([])}
              style={styles.clearLogsBtn}
            >
              <Text style={styles.clearLogsText}>Limpiar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.terminalBox}>
            {logs.length === 0 ? (
              <Text style={styles.terminalEmpty}>Sin eventos registrados aún.</Text>
            ) : (
              logs.map((log, index) => (
                <View key={index} style={styles.logRow}>
                  <Text style={styles.logTime}>[{log.timestamp}]</Text>
                  <Text
                    style={[
                      styles.logMessage,
                      log.type === 'success' && styles.logSuccess,
                      log.type === 'warn' && styles.logWarn,
                      log.type === 'error' && styles.logError,
                    ]}
                  >
                    {log.message}
                  </Text>
                </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    padding: 6,
    marginRight: 8,
  },
  headerTitleContainer: {
    flex: 1,
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
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    flex: 1,
  },
  modelStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modelStatusText: {
    fontSize: 13,
    color: '#CBD5E1',
    flex: 1,
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
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 6,
  },
  btnRecord: {
    backgroundColor: '#DC2626',
  },
  btnRecording: {
    backgroundColor: '#991B1B',
  },
  btnPick: {
    backgroundColor: '#3B82F6',
  },
  actionBtnText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  audioPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  audioPath: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  audioMeta: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  audioControlButtons: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  circleButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptInput: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 10,
    color: '#F8FAFC',
    fontSize: 13,
    marginBottom: 12,
  },
  runButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runButtonDisabled: {
    backgroundColor: '#1E3A5F',
    opacity: 0.6,
  },
  runButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  runButtonText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  resultBox: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
    minHeight: 80,
  },
  resultText: {
    color: '#F8FAFC',
    fontSize: 15,
    lineHeight: 22,
  },
  resultPlaceholder: {
    color: '#64748B',
    fontSize: 13,
    fontStyle: 'italic',
  },
  timeBadge: {
    backgroundColor: '#1E3A5F',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  timeBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
  },
  shareBtnText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600',
  },
  terminalBox: {
    backgroundColor: '#020617',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 12,
    maxHeight: 220,
  },
  terminalEmpty: {
    color: '#475569',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  logRow: {
    flexDirection: 'row',
    marginBottom: 4,
    gap: 6,
  },
  logTime: {
    color: '#64748B',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  logMessage: {
    color: '#CBD5E1',
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
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
  clearLogsBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  clearLogsText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  bareTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0284C7',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    gap: 6,
  },
  bareTestBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
});
