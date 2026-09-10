import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { getProfile } from '../../src/services/profileService';
import {
  getReports,
  getReportById,
  updateReportStatus,
  markReportSent,
  markReportAckReceived,
  reportExists,
  saveReport,
} from '../../src/services/reportService';
import { syncReportsToPeer, syncReportsBeaconLoop, processIncomingPacket } from '../../src/services/syncEngine';
import { getRecentSyncLogs, getSyncStats } from '../../src/services/syncLogService';
import { getRescueNodes, upsertRescueNode } from '../../src/services/nodeService';
import { createPacket, triggerMockReceiverAck } from '../../src/services/p2pTransport';
import {
  isBluetoothNativeSupported,
  getPairedBluetoothDevices,
  startBluetoothServer,
  stopBluetoothServer,
  subscribeToIncomingBluetoothPackets,
  PairedDevice,
} from '../../src/services/bluetoothNative';
import type {
  ReportRecord,
  UserProfile,
  P2PTransportType,
  SyncLogRecord,
  RescueNode,
} from '../../src/types/triageTypes';

const P2P_PORT = 7890;

export default function SincronizarScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Modo de transporte: Wi-Fi Hotspot vs Bluetooth
  const [transport, setTransport] = useState<P2PTransportType>('wifi_lan');
  const [peerAddress, setPeerAddress] = useState('192.168.43.1'); // IP hotspot default o ID BLE

  // Estados de Baliza Continua (Beacon SOS)
  const [isBeaconActive, setIsBeaconActive] = useState(false);
  const [beaconAttemptCount, setBeaconAttemptCount] = useState(0);
  const [isBatterySaving, setIsBatterySaving] = useState(false);
  const beaconAbortRef = useRef<{ aborted: boolean }>({ aborted: false });
  const pulseRadarAnim = useRef(new Animated.Value(1)).current;

  // Estados de transmisión tradicional y escucha
  const [isListening, setIsListening] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatusMsg, setSyncStatusMsg] = useState('');

  // Reportes y datos
  const [pendingReports, setPendingReports] = useState<ReportRecord[]>([]);
  const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set());
  const [syncLogs, setSyncLogs] = useState<SyncLogRecord[]>([]);
  const [stats, setStats] = useState({ totalSent: 0, totalReceived: 0, totalDuplicates: 0 });
  const [nodes, setNodes] = useState<RescueNode[]>([]);
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const btSubscriptionRef = useRef<{ remove: () => void } | null>(null);

  const loadData = useCallback(() => {
    try {
      const p = getProfile(db);
      setProfile(p);

      const all = getReports(db);
      const pending = all.filter(
        (r) => r.source === 'local' && (r.status === 'confirmado' || r.status === 'enviado')
      );
      setPendingReports(pending);

      // Auto-seleccionar todos si ninguno está marcado
      if (selectedReportIds.size === 0 && pending.length > 0) {
        setSelectedReportIds(new Set(pending.map((r) => r.reportId)));
      }

      setSyncLogs(getRecentSyncLogs(db, 20));
      setStats(getSyncStats(db));
      setNodes(getRescueNodes(db));

      // Cargar dispositivos emparejados si Bluetooth nativo está disponible
      if (isBluetoothNativeSupported()) {
        getPairedBluetoothDevices().then((devs) => {
          setPairedDevices(devs);
          if (devs.length > 0 && transport === 'bluetooth' && (!peerAddress || peerAddress === '192.168.43.1' || peerAddress === 'BRIGADA-BT-01')) {
            setPeerAddress(devs[0].name || devs[0].address);
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[Sincronizar] Error al cargar datos:', err);
    }
  }, [db, transport, peerAddress]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    return () => {
      btSubscriptionRef.current?.remove();
      if (isBluetoothNativeSupported()) {
        stopBluetoothServer().catch(() => {});
      }
    };
  }, []);

  const isRescatista = profile?.role === 'rescatista';

  const toggleReportSelection = (reportId: string) => {
    setSelectedReportIds((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        next.add(reportId);
      }
      return next;
    });
  };

  /**
   * Inicia la Baliza SOS Continua (Duty-Cycling y reintentos infinitos hasta ACK o cancelación)
   */
  const handleStartContinuousBeacon = async () => {
    if (selectedReportIds.size === 0) {
      Alert.alert('Sin selección', 'Selecciona al menos un reporte para emitir la baliza SOS.');
      return;
    }
    if (!peerAddress.trim()) {
      Alert.alert('Dirección requerida', 'Ingresa la IP del Hotspot o ID Bluetooth del dispositivo receptor.');
      return;
    }

    beaconAbortRef.current = { aborted: false };
    setIsBeaconActive(true);
    setBeaconAttemptCount(1);
    setIsBatterySaving(false);
    setSyncStatusMsg('Iniciando baliza continua SOS...');

    // Animación de radar pulsante
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseRadarAnim, {
          toValue: 1.25,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseRadarAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    ).start();

    const deviceId = profile?.phone || 'node-device-01';

    try {
      const result = await syncReportsBeaconLoop(db, {
        reportIds: Array.from(selectedReportIds),
        targetAddress: peerAddress,
        transport,
        localProfile: profile,
        deviceId,
        abortSignal: beaconAbortRef.current,
        onStatusUpdate: (msg, isSleeping, count) => {
          setSyncStatusMsg(msg);
          setIsBatterySaving(!!isSleeping);
          if (count) setBeaconAttemptCount(count);
        },
      });

      pulseRadarAnim.stopAnimation();
      pulseRadarAnim.setValue(1);

      if (result.success) {
        Alert.alert(
          '✅ ¡Rescatista Conectado!',
          `Se entregaron ${result.reportsSent} reporte(s) tras ${result.totalAttempts || 1} balizas vía ${
            transport === 'bluetooth' ? 'Bluetooth' : 'Wi-Fi Hotspot'
          }. ¡Acuse ACK confirmado!`
        );
        setSelectedReportIds(new Set());
      } else if (!beaconAbortRef.current.aborted) {
        Alert.alert('Baliza detenida', result.error || 'La transmisión fue interrumpida.');
      }
    } catch (err: any) {
      pulseRadarAnim.stopAnimation();
      pulseRadarAnim.setValue(1);
      Alert.alert('Error', err.message || 'Error en la baliza continua');
    } finally {
      setIsBeaconActive(false);
      setIsBatterySaving(false);
      setSyncStatusMsg('');
      loadData();
    }
  };

  /**
   * Detiene manualmente la baliza continua SOS
   */
  const handleStopContinuousBeacon = () => {
    beaconAbortRef.current.aborted = true;
    setIsBeaconActive(false);
    setIsBatterySaving(false);
    pulseRadarAnim.stopAnimation();
    pulseRadarAnim.setValue(1);
    setSyncStatusMsg('Baliza detenida manualmente.');
  };

  /**
   * Ejecuta la sincronización multi-transporte puntual P2P
   */
  const handleStartSync = async () => {
    if (selectedReportIds.size === 0) {
      Alert.alert('Sin selección', 'Selecciona al menos un reporte para sincronizar.');
      return;
    }
    if (!peerAddress.trim()) {
      Alert.alert('Dirección requerida', 'Ingresa la IP del Hotspot o ID Bluetooth del dispositivo receptor.');
      return;
    }

    setIsSyncing(true);
    setSyncProgress(0.1);
    setSyncStatusMsg('Iniciando handshake...');

    const deviceId = profile?.phone || 'node-device-01';

    try {
      const result = await syncReportsToPeer(db, {
        reportIds: Array.from(selectedReportIds),
        targetAddress: peerAddress,
        transport,
        localProfile: profile,
        deviceId,
        onProgress: (progress, message) => {
          setSyncProgress(progress);
          setSyncStatusMsg(message);
        },
      });

      if (result.success) {
        Alert.alert(
          '¡Sincronización Exitosa!',
          `Se transmitieron ${result.reportsSent} reporte(s) vía ${transport === 'bluetooth' ? 'Bluetooth' : 'Wi-Fi Hotspot'} (${result.bytesTransferred} bytes). Acuse ACK recibido.`
        );
        setSelectedReportIds(new Set());
      } else {
        Alert.alert('Aviso de Sincronización', result.error || 'No se pudo completar la transferencia.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Error inesperado durante la sincronización');
    } finally {
      setIsSyncing(false);
      setSyncProgress(0);
      setSyncStatusMsg('');
      loadData();
    }
  };

  /**
   * Simula o ejecuta la recepción de un paquete P2P de prueba
   */
  const handleSimulateIncomingPacket = () => {
    const demoPacket = createPacket(
      'REPORT_BUNDLE',
      { id: 'nodo-chiriqui-02', callsign: 'Brigada Tierras Altas' },
      {
        reports: [
          {
            reportId: `rep-demo-${Date.now()}`,
            createdAt: Date.now(),
            rawInputText: 'Deslizamiento de tierra en Cerro Punta. 3 personas incomunicadas.',
            extractedSummary: 'Deslizamiento de tierra en Cerro Punta. 3 personas atrapadas con heridas leves.',
            triagePriority: 'ROJO',
            sphereNeeds: ['ACCESO_RESCATE', 'SALUD'],
            locationReference: 'Cerro Punta, Chiriquí',
            reportedPeopleCount: 3,
            missingFields: [],
          },
        ],
      }
    );

    const res = processIncomingPacket(db, demoPacket, transport);
    if (res.success) {
      Alert.alert(
        '📥 Paquete P2P Recibido',
        `Se procesaron ${res.processedCount} reporte(s) entrante(s) de ${demoPacket.senderCallsign}. Registrado en SQLite.`
      );
      loadData();
    }
  };

  const toggleListening = async () => {
    const nextState = !isListening;
    setIsListening(nextState);

    if (nextState) {
      if (transport === 'bluetooth' && isBluetoothNativeSupported()) {
        try {
          await startBluetoothServer('PerseusRescue');
          console.log('[Sincronizar] Servidor Bluetooth RFCOMM activo y escuchando...');

          btSubscriptionRef.current?.remove();
          btSubscriptionRef.current = subscribeToIncomingBluetoothPackets((event) => {
            console.log('[Sincronizar] ¡Paquete Bluetooth RFCOMM recibido de:', event.senderName);
            try {
              const packet = JSON.parse(event.packetJson);
              const res = processIncomingPacket(db, packet, 'bluetooth');
              if (res.success) {
                Alert.alert(
                  '📥 Reporte Recibido por Bluetooth',
                  `¡Paquete físico recibido de ${event.senderName}! ${res.processedCount} reporte(s) integrado(s) en la base de datos de la brigada.`
                );
                loadData();
              }
            } catch (parseErr) {
              console.error('[Sincronizar] Error al parsear paquete BT:', parseErr);
            }
          });
        } catch (err: any) {
          Alert.alert('Error Bluetooth', err.message || 'No se pudo iniciar el servidor Bluetooth');
          setIsListening(false);
        }
      }
    } else {
      if (transport === 'bluetooth' && isBluetoothNativeSupported()) {
        await stopBluetoothServer().catch(() => {});
        btSubscriptionRef.current?.remove();
        btSubscriptionRef.current = null;
        console.log('[Sincronizar] Servidor Bluetooth RFCOMM detenido');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>📡 Sincronización P2P</Text>
          <Text style={styles.subtitle}>
            Transferencia de reportes 100% offline entre dispositivos
          </Text>
        </View>

        {/* Selector de Transporte (Wi-Fi vs Bluetooth) */}
        <View style={styles.transportContainer}>
          <TouchableOpacity
            style={[
              styles.transportButton,
              transport === 'wifi_lan' && styles.transportButtonActive,
            ]}
            onPress={() => setTransport('wifi_lan')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="wifi"
              size={20}
              color={transport === 'wifi_lan' ? '#F8FAFC' : '#94A3B8'}
            />
            <Text
              style={[
                styles.transportButtonText,
                transport === 'wifi_lan' && styles.transportButtonTextActive,
              ]}
            >
              Wi-Fi Hotspot
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.transportButton,
              transport === 'bluetooth' && styles.transportButtonActive,
            ]}
            onPress={() => setTransport('bluetooth')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="bluetooth"
              size={20}
              color={transport === 'bluetooth' ? '#F8FAFC' : '#94A3B8'}
            />
            <Text
              style={[
                styles.transportButtonText,
                transport === 'bluetooth' && styles.transportButtonTextActive,
              ]}
            >
              Bluetooth
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tarjeta de Métricas / Resumen */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Ionicons name="arrow-up-circle" size={20} color="#3B82F6" />
            <Text style={styles.statNum}>{stats.totalSent}</Text>
            <Text style={styles.statLabel}>Enviados</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="arrow-down-circle" size={20} color="#22C55E" />
            <Text style={styles.statNum}>{stats.totalReceived}</Text>
            <Text style={styles.statLabel}>Recibidos</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="copy-outline" size={20} color="#F59E0B" />
            <Text style={styles.statNum}>{stats.totalDuplicates}</Text>
            <Text style={styles.statLabel}>Duplicados</Text>
          </View>
        </View>

        {/* Configuración de Destino */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {transport === 'wifi_lan' ? '🌐 Dirección IP del Hotspot' : '🔷 Dispositivo Bluetooth Receptor'}
          </Text>
          <Text style={styles.cardDesc}>
            {transport === 'wifi_lan'
              ? 'Conéctate al punto de acceso (Hotspot) del rescatista e introduce su IP.'
              : 'Selecciona o introduce el nombre o dirección MAC del teléfono del rescatista emparejado.'}
          </Text>
          <TextInput
            style={styles.input}
            value={peerAddress}
            onChangeText={setPeerAddress}
            placeholder={transport === 'wifi_lan' ? '192.168.43.1' : 'Nombre o MAC (ej. Galaxy S21 o 00:11:22...)'}
            placeholderTextColor="#64748B"
            autoCapitalize="none"
          />

          {/* Chips de dispositivos emparejados detectados */}
          {transport === 'bluetooth' && pairedDevices.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 6 }}>
                Dispositivos Bluetooth emparejados (toca para seleccionar):
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {pairedDevices.map((dev, idx) => {
                  const isSelected = peerAddress === dev.name || peerAddress === dev.address;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={{
                        backgroundColor: isSelected ? '#2563EB' : '#0F172A',
                        borderColor: isSelected ? '#60A5FA' : '#334155',
                        borderWidth: 1,
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      onPress={() => setPeerAddress(dev.name || dev.address)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="bluetooth"
                        size={14}
                        color={isSelected ? '#F8FAFC' : '#3B82F6'}
                      />
                      <Text
                        style={{
                          color: isSelected ? '#F8FAFC' : '#CBD5E1',
                          fontSize: 12,
                          fontWeight: isSelected ? '700' : '500',
                        }}
                      >
                        {dev.name || dev.address}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {/* ==================== VISTA RESCATISTA ==================== */}
        {isRescatista ? (
          <>
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.cardTitle}>📥 Modo Receptor / Servidor</Text>
                  <Text style={styles.cardDesc}>
                    Escuchando paquetes entrantes en {transport === 'wifi_lan' ? `Puerto ${P2P_PORT}` : 'Canal Bluetooth'}
                  </Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: isListening ? '#22C55E' : '#EF4444' }]} />
              </View>

              <TouchableOpacity
                style={[styles.mainButton, isListening && styles.mainButtonDanger]}
                onPress={toggleListening}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isListening ? 'stop-circle' : 'play-circle'}
                  size={20}
                  color="#F8FAFC"
                />
                <Text style={styles.mainButtonText}>
                  {isListening ? 'Detener Recepción' : 'Activar Receptor'}
                </Text>
              </TouchableOpacity>

              {/* Botón de prueba para Jurado / Simulación */}
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleSimulateIncomingPacket}
                activeOpacity={0.8}
              >
                <Ionicons name="download-outline" size={18} color="#3B82F6" />
                <Text style={styles.secondaryButtonText}>Simular Paquete Entrante</Text>
              </TouchableOpacity>
            </View>

            {/* Nodos Descubiertos */}
            {nodes.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>👥 Nodos en la Red Mesh ({nodes.length})</Text>
                {nodes.map((n) => (
                  <View key={n.id} style={styles.nodeItem}>
                    <Ionicons name="radio" size={18} color="#22C55E" />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.nodeCallsign}>{n.callsign}</Text>
                      <Text style={styles.nodeMeta}>
                        {n.role.toUpperCase()} • ID: {n.deviceId.slice(0, 8)} •{' '}
                        {new Date(n.lastSeen).toLocaleTimeString('es-PA')}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          /* ==================== VISTA CIUDADANO ==================== */
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                📤 Reportes Confirmados para Envío ({pendingReports.length})
              </Text>
              {pendingReports.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="checkmark-circle-outline" size={36} color="#22C55E" />
                  <Text style={styles.emptyText}>No tienes reportes pendientes por sincronizar</Text>
                </View>
              ) : (
                pendingReports.map((r) => {
                  const isSelected = selectedReportIds.has(r.reportId);
                  return (
                    <TouchableOpacity
                      key={r.reportId}
                      style={[styles.reportItem, isSelected && styles.reportItemSelected]}
                      onPress={() => toggleReportSelection(r.reportId)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isSelected ? '#3B82F6' : '#64748B'}
                      />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.reportSummary} numberOfLines={2}>
                          {r.extractedSummary}
                        </Text>
                        <Text style={styles.reportMeta}>
                          {r.triagePriority} • {r.status} •{' '}
                          {new Date(r.createdAt).toLocaleTimeString('es-PA')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}

              {/* Interfaz de Baliza Continua (Beacon SOS) y Envío */}
              {pendingReports.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  {isBeaconActive ? (
                    /* Tarjeta Activa de Baliza Continua con Radar */
                    <View style={styles.beaconActiveCard}>
                      <View style={styles.beaconHeaderRow}>
                        <Animated.View
                          style={[
                            styles.beaconRadarCircle,
                            { transform: [{ scale: pulseRadarAnim }] },
                          ]}
                        >
                          <Ionicons
                            name="radio"
                            size={28}
                            color={isBatterySaving ? '#F59E0B' : '#EF4444'}
                          />
                        </Animated.View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.beaconTitleText}>
                            {isBatterySaving
                              ? '🔋 Ciclo de Ahorro de Batería'
                              : `🚨 Baliza SOS Activa (#${beaconAttemptCount})`}
                          </Text>
                          <Text style={styles.beaconStatusText} numberOfLines={2}>
                            {syncStatusMsg || 'Transmitiendo ráfaga por radio...'}
                          </Text>
                        </View>
                      </View>

                      {/* Botón para Cancelar Baliza */}
                      <TouchableOpacity
                        style={styles.stopBeaconButton}
                        onPress={handleStopContinuousBeacon}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="stop-circle" size={22} color="#F8FAFC" />
                        <Text style={styles.stopBeaconButtonText}>
                          Cancelar Búsqueda / Detener Baliza
                        </Text>
                      </TouchableOpacity>

                      {/* Botón para Simular Llegada de Rescatista (Demo Jurado) */}
                      <TouchableOpacity
                        style={styles.simulateAckButton}
                        onPress={() => {
                          triggerMockReceiverAck();
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="checkmark-done-circle" size={18} color="#34D399" />
                        <Text style={styles.simulateAckButtonText}>
                          🎯 Simular Llegada de Rescatista (Confirmar ACK)
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    /* Botones cuando no está activa la baliza */
                    <>
                      {/* Botón Principal: Baliza Continua SOS */}
                      <TouchableOpacity
                        style={[
                          styles.mainButton,
                          styles.beaconMainButton,
                          selectedReportIds.size === 0 && styles.mainButtonDisabled,
                        ]}
                        onPress={handleStartContinuousBeacon}
                        disabled={selectedReportIds.size === 0}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="radio" size={20} color="#F8FAFC" />
                        <Text style={styles.mainButtonText}>
                          🚨 Emitir Baliza Continua SOS ({selectedReportIds.size})
                        </Text>
                      </TouchableOpacity>

                      {/* Botón Secundario: Envío Puntual Único */}
                      <TouchableOpacity
                        style={[
                          styles.secondaryButton,
                          (isSyncing || selectedReportIds.size === 0) && styles.mainButtonDisabled,
                        ]}
                        onPress={handleStartSync}
                        disabled={isSyncing || selectedReportIds.size === 0}
                        activeOpacity={0.8}
                      >
                        {isSyncing ? (
                          <ActivityIndicator color="#3B82F6" />
                        ) : (
                          <Ionicons name="paper-plane-outline" size={18} color="#3B82F6" />
                        )}
                        <Text style={styles.secondaryButtonText}>
                          {isSyncing ? 'Enviando...' : 'Intento de Envío Único'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}

              {/* Barra de progreso de envío puntual */}
              {isSyncing && (
                <View style={styles.progressContainer}>
                  <View style={[styles.progressBar, { width: `${syncProgress * 100}%` }]} />
                  <Text style={styles.progressText}>{syncStatusMsg}</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Bitácora de Auditoría P2P (Auditoría para el jurado) */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>📋 Bitácora de Auditoría P2P</Text>
            <TouchableOpacity onPress={loadData}>
              <Ionicons name="refresh" size={18} color="#3B82F6" />
            </TouchableOpacity>
          </View>
          <Text style={styles.cardDesc}>
            Registro inmutable en SQLite de transferencias, bytes y acuses ACK.
          </Text>

          {syncLogs.length === 0 ? (
            <Text style={styles.logEmpty}>Sin transferencias registradas aún</Text>
          ) : (
            syncLogs.map((log) => (
              <View key={log.id} style={styles.logRow}>
                <Ionicons
                  name={
                    log.direction === 'sent'
                      ? 'arrow-up-circle'
                      : log.status === 'duplicado'
                      ? 'copy'
                      : 'arrow-down-circle'
                  }
                  size={16}
                  color={
                    log.status === 'fallido'
                      ? '#EF4444'
                      : log.status === 'duplicado'
                      ? '#F59E0B'
                      : '#22C55E'
                  }
                />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.logTitle}>
                    [{log.direction.toUpperCase()}] ID: {log.reportId.slice(0, 10)}... (
                    {log.transport.toUpperCase()})
                  </Text>
                  <Text style={styles.logMeta}>
                    {log.status.toUpperCase()} • {log.bytesTransferred} B •{' '}
                    {new Date(log.syncedAt).toLocaleTimeString('es-PA')}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#F8FAFC' },
  subtitle: { fontSize: 13, color: '#94A3B8', marginTop: 4 },
  transportContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  transportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  transportButtonActive: {
    backgroundColor: '#3B82F6',
  },
  transportButtonText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  transportButtonTextActive: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statNum: { fontSize: 18, fontWeight: '800', color: '#F8FAFC', marginTop: 4 },
  statLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#F8FAFC', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#94A3B8', marginBottom: 12, lineHeight: 16 },
  input: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  mainButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  beaconMainButton: {
    backgroundColor: '#DC2626',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  beaconActiveCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#EF4444',
    padding: 16,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  beaconHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  beaconRadarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0F172A',
    borderWidth: 2,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  beaconTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  beaconStatusText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 3,
    lineHeight: 16,
  },
  stopBeaconButton: {
    backgroundColor: '#7F1D1D',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stopBeaconButtonText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  simulateAckButton: {
    backgroundColor: '#064E3B',
    borderColor: '#059669',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  simulateAckButtonText: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '700',
  },
  mainButtonDanger: { backgroundColor: '#EF4444' },
  mainButtonDisabled: { backgroundColor: '#334155' },
  mainButtonText: { color: '#F8FAFC', fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  secondaryButtonText: { color: '#3B82F6', fontSize: 14, fontWeight: '600' },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  nodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
  },
  nodeCallsign: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  nodeMeta: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  emptyContainer: { alignItems: 'center', paddingVertical: 16 },
  emptyText: { color: '#94A3B8', fontSize: 13, marginTop: 6, textAlign: 'center' },
  reportItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  reportItemSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#1E293B',
  },
  reportSummary: { color: '#F8FAFC', fontSize: 13, fontWeight: '500' },
  reportMeta: { color: '#94A3B8', fontSize: 11, marginTop: 4 },
  progressContainer: { marginTop: 12 },
  progressBar: {
    height: 4,
    backgroundColor: '#3B82F6',
    borderRadius: 2,
    marginBottom: 6,
  },
  progressText: { color: '#3B82F6', fontSize: 12, fontStyle: 'italic' },
  logEmpty: { color: '#64748B', fontSize: 12, fontStyle: 'italic', paddingVertical: 8 },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingVertical: 8,
  },
  logTitle: { color: '#F8FAFC', fontSize: 12, fontFamily: 'monospace' },
  logMeta: { color: '#94A3B8', fontSize: 10, marginTop: 2 },
});
