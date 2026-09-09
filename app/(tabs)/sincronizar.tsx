import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import type { ReportRecord, UserProfile } from '../../src/types/triageTypes';

/**
 * Pantalla de Sincronización P2P — Perseus.ai
 * 
 * Unidireccional: Ciudadano ENVÍA → Rescatista RECIBE
 * Protocolo: TCP Socket en puerto 7890 dentro de la misma LAN sin internet.
 * 
 * NOTA: La capa de transporte TCP real requiere `react-native-tcp-socket` 
 * (responsabilidad Persona C). Esta pantalla implementa toda la lógica de UI,
 * protocolo JSON y deduplicación, lista para conectar con el transport layer.
 */

const P2P_PORT = 7890;

export default function SincronizarScreen() {
  const db = useSQLiteContext();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [peerIp, setPeerIp] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [pendingReports, setPendingReports] = useState<ReportRecord[]>([]);
  const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set());

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString('es-PA');
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev].slice(0, 50));
  };

  useFocusEffect(
    useCallback(() => {
      const p = getProfile(db);
      setProfile(p);
      // Cargar reportes confirmados pendientes de envío
      const all = getReports(db);
      const pending = all.filter(
        (r) => r.source === 'local' && (r.status === 'confirmado' || r.status === 'enviado')
      );
      setPendingReports(pending);
    }, [db])
  );

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
   * SIMULA el envío de reportes seleccionados al rescatista
   * En producción esto usará TCP socket real via react-native-tcp-socket
   */
  const handleSendReports = async () => {
    if (selectedReportIds.size === 0) {
      Alert.alert('Sin selección', 'Selecciona al menos un reporte para enviar.');
      return;
    }
    if (!peerIp.trim()) {
      Alert.alert('IP requerida', 'Ingresa la dirección IP del dispositivo destino.');
      return;
    }

    setIsSending(true);
    addLog(`Conectando a ${peerIp}:${P2P_PORT}...`);

    for (const reportId of selectedReportIds) {
      const report = getReportById(db, reportId);
      if (!report) continue;

      // Construir paquete P2P (reporte + perfil del reportante)
      const packet = {
        type: 'REPORT',
        version: 1,
        report: {
          ...report,
          reporterProfile: profile, // Adjuntar perfil para el rescatista
        },
      };

      addLog(`Enviando reporte ${reportId.slice(0, 8)}...`);

      // TODO: Reemplazar con TCP socket real (Persona C)
      // Simular envío exitoso tras delay
      await new Promise((resolve) => setTimeout(resolve, 800));

      const syncEventId = `sync-${Date.now()}-${reportId.slice(0, 8)}`;
      markReportSent(db, reportId, syncEventId);
      addLog(`✅ Reporte ${reportId.slice(0, 8)} enviado`);

      // Simular ACK
      await new Promise((resolve) => setTimeout(resolve, 300));
      markReportAckReceived(db, reportId);
      addLog(`✅ ACK recibido para ${reportId.slice(0, 8)}`);
    }

    addLog(`📡 ${selectedReportIds.size} reporte(s) enviados exitosamente`);
    setIsSending(false);
    setSelectedReportIds(new Set());

    // Recargar lista
    const all = getReports(db);
    setPendingReports(all.filter((r) => r.source === 'local' && (r.status === 'confirmado' || r.status === 'enviado')));
  };

  /**
   * SIMULA iniciar servidor de escucha P2P
   * En producción creará un TCP server en el puerto 7890
   */
  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      addLog('🔴 Servidor detenido');
    } else {
      setIsListening(true);
      addLog(`🟢 Escuchando conexiones entrantes en puerto ${P2P_PORT}...`);
      addLog('Esperando reportes de ciudadanos en la red local...');

      // TODO: Reemplazar con TCP server real (Persona C)
      // El handler de recepción sería:
      // onDataReceived = (data) => {
      //   const packet = JSON.parse(data);
      //   if (packet.type === 'REPORT' && !reportExists(db, packet.report.reportId)) {
      //     const received = { ...packet.report, source: 'received', status: 'recibido', receivedAt: Date.now() };
      //     saveReport(db, received);
      //     addLog(`📩 Nuevo reporte recibido: ${received.reportId.slice(0,8)}`);
      //     // Enviar ACK
      //     sendAck(packet.report.reportId);
      //   }
      // }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>📡 Sincronización P2P</Text>

        {/* Estado de red */}
        <View style={styles.statusCard}>
          <Ionicons
            name={isListening ? 'radio' : 'radio-outline'}
            size={24}
            color={isListening ? '#22C55E' : '#94A3B8'}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>
              {isListening ? 'Servidor activo' : 'Servidor inactivo'}
            </Text>
            <Text style={styles.statusSubtext}>
              Puerto: {P2P_PORT} • Protocolo: TCP/JSON
            </Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: isListening ? '#22C55E' : '#EF4444' }]} />
        </View>

        {isRescatista ? (
          /* ==================== RECIBIR (RESCATISTA) ==================== */
          <>
            <Text style={styles.sectionTitle}>📥 Recibir Reportes</Text>
            <Text style={styles.sectionDesc}>
              Activa el servidor para recibir reportes de ciudadanos en la misma red local.
            </Text>

            <TouchableOpacity
              style={[styles.mainButton, isListening && styles.mainButtonDanger]}
              onPress={toggleListening}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isListening ? 'stop-circle' : 'play-circle'}
                size={24}
                color="#F8FAFC"
              />
              <Text style={styles.mainButtonText}>
                {isListening ? 'Detener servidor' : 'Escuchar conexiones'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          /* ==================== ENVIAR (CIUDADANO) ==================== */
          <>
            <Text style={styles.sectionTitle}>📤 Enviar Reportes</Text>

            {/* IP destino */}
            <Text style={styles.label}>IP del rescatista</Text>
            <TextInput
              style={styles.input}
              value={peerIp}
              onChangeText={setPeerIp}
              placeholder="192.168.1.100"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
            />

            {/* Reportes pendientes */}
            <Text style={styles.label}>Reportes confirmados ({pendingReports.length})</Text>
            {pendingReports.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No hay reportes confirmados para enviar</Text>
              </View>
            ) : (
              pendingReports.map((r) => (
                <TouchableOpacity
                  key={r.reportId}
                  style={[styles.reportItem, selectedReportIds.has(r.reportId) && styles.reportItemSelected]}
                  onPress={() => toggleReportSelection(r.reportId)}
                >
                  <Ionicons
                    name={selectedReportIds.has(r.reportId) ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={selectedReportIds.has(r.reportId) ? '#3B82F6' : '#94A3B8'}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.reportSummary} numberOfLines={1}>
                      {r.extractedSummary}
                    </Text>
                    <Text style={styles.reportMeta}>
                      {r.triagePriority} • {r.status} • {new Date(r.createdAt).toLocaleTimeString('es-PA')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}

            <TouchableOpacity
              style={[styles.mainButton, (isSending || selectedReportIds.size === 0) && styles.mainButtonDisabled]}
              onPress={handleSendReports}
              disabled={isSending || selectedReportIds.size === 0}
              activeOpacity={0.8}
            >
              {isSending ? (
                <ActivityIndicator color="#F8FAFC" />
              ) : (
                <Ionicons name="send" size={20} color="#F8FAFC" />
              )}
              <Text style={styles.mainButtonText}>
                {isSending ? 'Enviando...' : `Enviar ${selectedReportIds.size} reporte(s)`}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Log de actividad */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>📋 Log de Actividad</Text>
        <View style={styles.logContainer}>
          {logs.length === 0 ? (
            <Text style={styles.logEmpty}>Sin actividad reciente</Text>
          ) : (
            logs.map((log, i) => (
              <Text key={i} style={styles.logEntry}>{log}</Text>
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
  scrollContent: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: '#F8FAFC', marginBottom: 16 },
  statusCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  statusTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '600' },
  statusSubtext: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 6 },
  sectionDesc: { fontSize: 13, color: '#94A3B8', marginBottom: 14, lineHeight: 18 },
  label: { fontSize: 13, color: '#94A3B8', fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
  },
  mainButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  mainButtonDanger: { backgroundColor: '#EF4444' },
  mainButtonDisabled: { backgroundColor: '#334155' },
  mainButtonText: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  reportItem: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  reportItemSelected: { borderColor: '#3B82F6' },
  reportSummary: { color: '#F8FAFC', fontSize: 14 },
  reportMeta: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  emptyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: { color: '#94A3B8', fontSize: 13 },
  logContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    minHeight: 120,
  },
  logEntry: { color: '#94A3B8', fontSize: 11, fontFamily: 'monospace', lineHeight: 18 },
  logEmpty: { color: '#64748B', fontSize: 12, fontStyle: 'italic' },
});
